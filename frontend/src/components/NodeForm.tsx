import { useEffect, useMemo, useState } from 'react'
import type { AgentNode } from '../api/client'
import JsonEditor from './JsonEditor'
import { NodeIcon, NODE_CONFIG } from './nodeIcons'

interface EdgeLike {
  sourceIdx: number
  targetIdx: number
  sourceHandle?: string | null
  condition?: string | null
}

interface NodeFormProps {
  initial?: AgentNode | null
  allNodes?: AgentNode[]
  edges?: EdgeLike[]
  onSave: (node: AgentNode, edgeUpdates?: EdgeLike[]) => void
  onCancel: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #2e3345',
  borderRadius: 6, boxSizing: 'border-box', background: '#252836', color: '#e0e0e0',
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#9ca3af' }
const fieldStyle: React.CSSProperties = { marginBottom: 12 }

type ConfigState = Record<string, string>

function getRecommendedField(nodeType?: AgentNode['type']) {
  switch (nodeType) {
    case 'llm':
      return 'text'
    case 'code':
      return 'result'
    case 'if_else':
      return 'matched_case'
    case 'loop':
      return 'iterations'
    case 'start':
    case 'end':
      return 'status'
    case 'http':
    case 'db':
      return ''
    default:
      return 'text'
  }
}

function deriveLoopFields(config: ConfigState): ConfigState {
  const next = { ...config }
  let parsedCondition: Record<string, unknown> = {}

  const rawCondition = next.condition
  if (rawCondition) {
    try {
      parsedCondition = JSON.parse(rawCondition)
    } catch {
      parsedCondition = {}
    }
  }

  const selector = Array.isArray(parsedCondition.variable_selector)
    ? parsedCondition.variable_selector.map(String)
    : []

  next.loop_condition_node_id = selector[0] || ''
  next.loop_condition_field = selector.slice(1).join('.') || ''
  next.loop_condition_operator = String(parsedCondition.operator || 'lt')
  next.loop_condition_value = parsedCondition.operator === 'not_empty' ? '' : String(parsedCondition.value ?? '')

  if (!next.max_iterations) next.max_iterations = '5'
  if (!next.start_node_id) next.start_node_id = ''
  if (!next.end_node_id) next.end_node_id = ''
  return next
}

function deriveIfElseFields(config: ConfigState, branchTargets: AgentNode[]): ConfigState {
  const next = { ...config }
  let parsedCases: Array<{ case_id?: string; conditions?: Array<Record<string, unknown>> }> = []

  try {
    parsedCases = JSON.parse(next.cases || next.cases_json || '[]')
  } catch {
    parsedCases = []
  }

  const firstCond = parsedCases[0]?.conditions?.[0] || {}
  const selector = Array.isArray(firstCond.variable_selector)
    ? firstCond.variable_selector.map(String)
    : []

  next.if_source_node_id = selector.length > 1 ? selector[0] || '' : ''
  next.if_source_field = selector.length > 1 ? selector.slice(1).join('.') : (next.field_path || 'text')
  next.default_case_id = next.default_case_id || 'default'

  for (const target of branchTargets) {
    if (!target.id) continue
    if (next.default_case_id === target.id) {
      next[`branch_operator__${target.id}`] = '__default__'
      next[`branch_value__${target.id}`] = ''
      continue
    }
    const caseConfig = parsedCases.find((item) => item.case_id === target.id)
    const cond = caseConfig?.conditions?.[0] || {}
    next[`branch_operator__${target.id}`] = String(cond.operator || 'is')
    next[`branch_value__${target.id}`] = cond.operator === 'not_empty' ? '' : String(cond.value ?? '')
  }

  return next
}

function makeFlatConfig(initial?: AgentNode | null): ConfigState {
  if (!initial?.config) return {}
  const flat: ConfigState = {}
  for (const [k, v] of Object.entries(initial.config)) {
    flat[k] = typeof v === 'string' ? v : JSON.stringify(v)
  }
  return flat
}

function NodeForm({ initial, allNodes, edges, onSave, onCancel }: NodeFormProps) {
  const [type, setType] = useState(initial?.type || 'llm')
  const [label, setLabel] = useState(initial?.label || '')
  const [parentId, setParentId] = useState(initial?.parent_id || '')
  const [config, setConfig] = useState<ConfigState>({})

  const initialNodeIndex = useMemo(() => {
    if (!initial?.id || !allNodes) return -1
    return allNodes.findIndex((node) => node.id === initial.id)
  }, [allNodes, initial?.id])

  const connectedBranchTargets = useMemo(() => {
    if (type !== 'if_else' || !initial?.id || !allNodes || !edges || initialNodeIndex < 0) return [] as AgentNode[]
    return edges
      .filter((edge) => edge.sourceIdx === initialNodeIndex)
      .map((edge) => allNodes[edge.targetIdx])
      .filter((node): node is AgentNode => Boolean(node?.id))
  }, [type, initial?.id, allNodes, edges, initialNodeIndex])

  const ifSourceNodes = useMemo(() => {
    if (!allNodes) return [] as AgentNode[]
    return allNodes.filter((node) => node.id !== initial?.id && node.id)
  }, [allNodes, initial?.id])

  useEffect(() => {
    if (initial) {
      setType(initial.type as AgentNode['type'])
      setLabel(initial.label || '')
      setParentId(initial.parent_id || '')
    }
    const flat = makeFlatConfig(initial)
    if (initial?.type === 'if_else') {
      setConfig(deriveIfElseFields(flat, connectedBranchTargets))
    } else if (initial?.type === 'loop') {
      setConfig(deriveLoopFields(flat))
    } else {
      setConfig(flat)
    }
  }, [initial, connectedBranchTargets])

  const setConfigField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const handleIfSourceNodeChange = (nodeId: string) => {
    const node = ifSourceNodes.find((item) => item.id === nodeId)
    const recommendedField = getRecommendedField(node?.type)
    setConfig((prev) => ({
      ...prev,
      if_source_node_id: nodeId,
      if_source_field: !prev.if_source_field || prev.if_source_field === 'text' || prev.if_source_field === 'result' || prev.if_source_field === 'data' || prev.if_source_field === 'status' || prev.if_source_field === 'matched_case' || prev.if_source_field === 'iterations'
        ? recommendedField
        : prev.if_source_field,
    }))
  }

  const handleLoopConditionNodeChange = (nodeId: string) => {
    const node = loopConditionNodes.find((item) => item.id === nodeId)
    const recommendedField = getRecommendedField(node?.type)
    setConfig((prev) => ({
      ...prev,
      loop_condition_node_id: nodeId,
      loop_condition_field: !prev.loop_condition_field || prev.loop_condition_field === 'text' || prev.loop_condition_field === 'result' || prev.loop_condition_field === 'data' || prev.loop_condition_field === 'status' || prev.loop_condition_field === 'matched_case' || prev.loop_condition_field === 'iterations'
        ? recommendedField
        : prev.loop_condition_field,
    }))
  }

  const loopChildren = type === 'loop' && initial?.id && allNodes
    ? allNodes.filter((node) => node.parent_id === initial.id)
    : []
  const loopConditionNodes = loopChildren.filter((node) => node.id)

  const handleSave = () => {
    const finalConfig: Record<string, unknown> = { ...config }
    let nextEdges: EdgeLike[] | undefined

    if (type === 'if_else') {
      const sourceNodeId = (config.if_source_node_id || '').trim()
      const sourceField = (config.if_source_field || 'text').trim() || 'text'
      let defaultCaseId = 'default'
      const cases = connectedBranchTargets
        .filter((target) => target.id)
        .map((target) => {
          const targetId = target.id as string
          const operator = config[`branch_operator__${targetId}`] || 'is'
          const value = (config[`branch_value__${targetId}`] || '').trim()
          if (operator === '__default__') {
            defaultCaseId = targetId
            return null
          }
          if (operator !== 'not_empty' && value === '') return null
          return {
            case_id: targetId,
            conditions: [{
              variable_selector: sourceNodeId ? [sourceNodeId, ...sourceField.split('.').map((part) => part.trim()).filter(Boolean)] : sourceField.split('.').map((part) => part.trim()).filter(Boolean),
              operator,
              ...(operator === 'not_empty' ? {} : { value }),
            }],
          }
        })
        .filter(Boolean)

      finalConfig.cases = cases
      finalConfig.default_case_id = defaultCaseId
      finalConfig.field_path = sourceField
      finalConfig.operator = cases[0]?.conditions?.[0]?.operator || 'is'
      finalConfig.branches = connectedBranchTargets
        .filter((target) => target.id)
        .map((target) => ({ case_id: target.id }))

      delete finalConfig.if_source_node_id
      delete finalConfig.if_source_field
      for (const target of connectedBranchTargets) {
        if (!target.id) continue
        delete finalConfig[`branch_operator__${target.id}`]
        delete finalConfig[`branch_value__${target.id}`]
      }
      delete finalConfig.cases_json
      delete finalConfig.branches_text

      if (allNodes && edges && initialNodeIndex >= 0) {
        nextEdges = edges.map((edge) => {
          if (edge.sourceIdx !== initialNodeIndex) return edge
          const targetNode = allNodes[edge.targetIdx]
          if (!targetNode?.id) return edge
          return {
            ...edge,
            sourceHandle: targetNode.id,
            condition: targetNode.id,
          }
        })
      }
    }

    if (type === 'loop') {
      const conditionNodeId = (config.loop_condition_node_id || '').trim()
      const conditionField = (config.loop_condition_field || '').trim()
      const conditionOperator = config.loop_condition_operator || 'lt'
      const conditionValue = (config.loop_condition_value || '').trim()
      const selector = [conditionNodeId, ...conditionField.split('.').map((part) => part.trim()).filter(Boolean)].filter(Boolean)

      if (selector.length > 0) {
        finalConfig.condition = {
          variable_selector: selector,
          operator: conditionOperator,
          ...(conditionOperator === 'not_empty' ? {} : { value: conditionValue }),
        }
      } else {
        finalConfig.condition = {}
      }

      finalConfig.max_iterations = parseInt(config.max_iterations || '5', 10)
      finalConfig.start_node_id = config.start_node_id || ''
      finalConfig.end_node_id = config.end_node_id || ''
      delete finalConfig.loop_condition_node_id
      delete finalConfig.loop_condition_field
      delete finalConfig.loop_condition_operator
      delete finalConfig.loop_condition_value
    }

    onSave({ id: initial?.id, type: type as AgentNode['type'], label, config: finalConfig, parent_id: parentId || null }, nextEdges)
  }

  return (
    <div style={{ padding: 20, minWidth: 340, color: '#e0e0e0' }}>
      <h3 style={{ marginTop: 0, color: '#60a5fa' }}>{initial ? '编辑节点' : '添加节点'}</h3>

      <div style={fieldStyle}>
        <label style={labelStyle}>类型</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(NODE_CONFIG).map(([t, cfg]) => (
            <button
              key={t}
              onClick={() => setType(t as AgentNode['type'])}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', fontSize: 12, borderRadius: 6,
                border: '1px solid #2e3345',
                background: type === t ? cfg.color + '22' : '#252836',
                color: type === t ? cfg.color : '#9ca3af',
                cursor: 'pointer', fontWeight: type === t ? 600 : 400,
              }}
            >
              <NodeIcon type={t} size={13} />
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>标签</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="节点显示名称" style={inputStyle} />
      </div>

      {allNodes && allNodes.length > 1 && (
        <div style={fieldStyle}>
          <label style={labelStyle}>加入循环体</label>
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} style={inputStyle}>
            <option value="">无（留在主流程）</option>
            {allNodes.filter((n) => n.id !== initial?.id && n.type === 'loop').map((n) => (
              <option key={n.id} value={n.id}>{n.label} (loop)</option>
            ))}
          </select>
        </div>
      )}

      {type === 'llm' && (
        <>
          <div style={fieldStyle}>
            <label style={labelStyle}>Model</label>
            <input value={config.model || ''} onChange={(e) => setConfigField('model', e.target.value)} placeholder="gpt-4o" style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>System Prompt</label>
            <textarea value={config.system_prompt || ''} onChange={(e) => setConfigField('system_prompt', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Temperature</label>
            <input value={config.temperature || '0.7'} onChange={(e) => setConfigField('temperature', e.target.value)} style={inputStyle} />
          </div>
        </>
      )}

      {type === 'http' && (
        <>
          <div style={fieldStyle}>
            <label style={labelStyle}>URL</label>
            <input value={config.url || ''} onChange={(e) => setConfigField('url', e.target.value)} placeholder="https://api.example.com/data" style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Method</label>
            <select value={config.method || 'GET'} onChange={(e) => setConfigField('method', e.target.value)} style={inputStyle}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Headers (JSON)</label>
            <textarea value={config.headers || '{}'} onChange={(e) => setConfigField('headers', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Body Template (JSON)</label>
            <JsonEditor value={config.body || '{}'} onChange={(v) => setConfigField('body', v)} />
          </div>
        </>
      )}

      {type === 'db' && (
        <>
          <div style={fieldStyle}>
            <label style={labelStyle}>Connection String</label>
            <input value={config.connection_string || ''} onChange={(e) => setConfigField('connection_string', e.target.value)} placeholder="postgresql://user:pass@host/db" style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Query</label>
            <textarea value={config.query || ''} onChange={(e) => setConfigField('query', e.target.value)} placeholder="SELECT * FROM table LIMIT 10" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </>
      )}

      {type === 'code' && (
        <>
          <div style={fieldStyle}>
            <label style={labelStyle}>Language</label>
            <select value={config.language || 'python'} onChange={(e) => setConfigField('language', e.target.value)} style={inputStyle}>
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Source Code</label>
            <textarea value={config.source_code || ''} onChange={(e) => setConfigField('source_code', e.target.value)} rows={6} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }} />
          </div>
        </>
      )}

      {type === 'if_else' && (
        <>
          <div style={fieldStyle}>
            <label style={labelStyle}>判断来源节点</label>
            <select value={config.if_source_node_id || ''} onChange={(e) => handleIfSourceNodeChange(e.target.value)} style={inputStyle}>
              <option value="">使用直接上游输出</option>
              {ifSourceNodes.map((node) => (
                <option key={node.id} value={node.id}>{node.label} ({NODE_CONFIG[node.type]?.label || node.type})</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>判断字段</label>
            <input value={config.if_source_field || 'text'} onChange={(e) => setConfigField('if_source_field', e.target.value)} placeholder="text / result / data.intent" style={inputStyle} />
            <div style={{ fontSize: 11, color: '#8b8fa3', marginTop: 6, lineHeight: 1.6 }}>
              先在画布里从 if-else 连出目标节点，这里会自动生成对应分支。LLM / Code / If-else / Loop 会自动带出推荐字段；HTTP / DB 因返回结构不固定，默认留空让你自己选择具体字段。
            </div>
          </div>
          {connectedBranchTargets.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {connectedBranchTargets.map((target) => (
                <div key={target.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #2e3345', background: '#202432' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#d7e3ec', marginBottom: 8 }}>分支到：{target.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
                    <select
                      value={config[`branch_operator__${target.id}`] || 'is'}
                      onChange={(e) => setConfigField(`branch_operator__${target.id}`, e.target.value)}
                      style={inputStyle}
                    >
                      <option value="__default__">默认</option>
                      <option value="is">等于</option>
                      <option value="contains">包含</option>
                      <option value="starts_with">开头是</option>
                      <option value="ends_with">结尾是</option>
                      <option value="not_empty">非空</option>
                      <option value="lt">小于</option>
                      <option value="gte">大于等于</option>
                    </select>
                    {(config[`branch_operator__${target.id}`] || 'is') === '__default__' ? (
                      <div style={{ fontSize: 11, color: '#8b8fa3' }}>未命中其它分支时，默认走这里</div>
                    ) : (config[`branch_operator__${target.id}`] || 'is') !== 'not_empty' ? (
                      <input
                        value={config[`branch_value__${target.id}`] || ''}
                        onChange={(e) => setConfigField(`branch_value__${target.id}`, e.target.value)}
                        placeholder="例如 0.8 / done / 达标"
                        style={inputStyle}
                      />
                    ) : (
                      <div style={{ fontSize: 11, color: '#8b8fa3' }}>该分支在字段非空时命中</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '12px 12px', borderRadius: 10, background: 'rgba(59,130,246,0.08)', border: '1px dashed rgba(96,165,250,0.45)', fontSize: 12, color: '#bfdbfe', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, color: '#dbeafe', marginBottom: 4 }}>还没有可配置的分支</div>
              <div>先回到画布，从这个 if-else 节点连出一个或多个目标节点。</div>
              <div>连线完成后重新打开面板，这里会自动出现“到哪个节点 + 条件是什么”的配置项。</div>
            </div>
          )}
        </>
      )}

      {type === 'loop' && (
        <>
          <div style={fieldStyle}>
            <label style={labelStyle}>Max Iterations</label>
            <input value={config.max_iterations || '5'} onChange={(e) => setConfigField('max_iterations', e.target.value)} style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>继续条件</label>
            <select value={config.loop_condition_node_id || ''} onChange={(e) => handleLoopConditionNodeChange(e.target.value)} style={inputStyle} disabled={!loopConditionNodes.length}>
              <option value="">未设置（仅按最大轮次结束）</option>
              {loopConditionNodes.map((node) => (
                <option key={node.id} value={node.id}>{node.label} ({NODE_CONFIG[node.type]?.label || node.type})</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>判断字段</label>
            <input value={config.loop_condition_field || ''} onChange={(e) => setConfigField('loop_condition_field', e.target.value)} placeholder="text / result / score / data.intent" style={inputStyle} disabled={!config.loop_condition_node_id} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>操作符</label>
            <select value={config.loop_condition_operator || 'lt'} onChange={(e) => setConfigField('loop_condition_operator', e.target.value)} style={inputStyle} disabled={!config.loop_condition_node_id}>
              <option value="is">等于</option>
              <option value="contains">包含</option>
              <option value="starts_with">开头是</option>
              <option value="ends_with">结尾是</option>
              <option value="not_empty">非空</option>
              <option value="lt">小于</option>
              <option value="gte">大于等于</option>
            </select>
          </div>
          {config.loop_condition_operator !== 'not_empty' && (
            <div style={fieldStyle}>
              <label style={labelStyle}>比较值</label>
              <input value={config.loop_condition_value || ''} onChange={(e) => setConfigField('loop_condition_value', e.target.value)} placeholder="例如 3 / done / 0.8" style={inputStyle} disabled={!config.loop_condition_node_id} />
            </div>
          )}
          <div style={{ fontSize: 11, color: '#8b8fa3', marginTop: -4, marginBottom: 12, lineHeight: 1.6 }}>
            {config.loop_condition_node_id
              ? `当前会读取所选节点的输出字段，例如 ${config.loop_condition_field || 'text'}。常见字段：LLM 用 text，Code 用 result，HTTP / DB 可直接写返回里的字段路径。`
              : '先选择循环体里的一个节点作为判断来源。固定结构节点会自动带出推荐字段；HTTP / DB 默认留空，避免推荐错误字段。'}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>循环体起点</label>
            <select value={config.start_node_id || ''} onChange={(e) => setConfigField('start_node_id', e.target.value)} style={inputStyle} disabled={!loopChildren.length}>
              <option value="">未设置</option>
              {loopChildren.map((node) => (
                <option key={node.id} value={node.id}>{node.label} ({NODE_CONFIG[node.type]?.label || node.type})</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>循环体终点</label>
            <select value={config.end_node_id || ''} onChange={(e) => setConfigField('end_node_id', e.target.value)} style={inputStyle} disabled={!loopChildren.length}>
              <option value="">未设置</option>
              {loopChildren.map((node) => (
                <option key={node.id} value={node.id}>{node.label} ({NODE_CONFIG[node.type]?.label || node.type})</option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 11, color: '#8b8fa3', marginTop: 4, lineHeight: 1.6 }}>
            {loopChildren.length
              ? `当前循环体里有 ${loopChildren.length} 个节点。条件来源、起点和终点都可以直接从这些节点里选择。`
              : '先把节点加入这个 loop 容器，条件来源、起点/终点下拉里才会出现可选项。'}
          </div>
          <div style={{ fontSize: 11, color: '#8b8fa3', marginTop: 8 }}>
            loop 连到外部结束节点的边请命名为 `loop_exit`。
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button onClick={onCancel} style={{ padding: '8px 20px', fontSize: 14, border: '1px solid #2e3345', borderRadius: 6, cursor: 'pointer', background: '#252836', color: '#e0e0e0' }}>取消</button>
        <button onClick={handleSave} style={{ padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6, cursor: 'pointer', background: '#3b82f6', color: '#fff' }}>确认</button>
      </div>
    </div>
  )
}

export default NodeForm
