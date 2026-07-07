import { useEffect, useMemo, useState } from 'react'
import type { AgentNode } from '../api/client'
import JsonEditor from './JsonEditor'
import { NodeIcon, NODE_CONFIG } from './nodeIcons'
import VariableSelector, { getRecommendedOutputField } from './VariableSelector'

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
  width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid var(--border)',
  borderRadius: 6, boxSizing: 'border-box', background: 'var(--bg-elevated)', color: 'var(--text-primary)',
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }
const fieldStyle: React.CSSProperties = { marginBottom: 12 }

type ConfigState = Record<string, string>

type HttpBodyField = {
  id: string
  target_path: string
  source_type: 'constant' | 'node'
  constant_value?: string
  variable_selector?: string[]
  value_type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
}

type LlmPromptVariable = {
  id: string
  name: string
  variable_selector: string[]
}

function parseJsonList<T>(value: string | undefined, fallback: T[] = []) {
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : fallback
  } catch {
    return fallback
  }
}

function makeBodyField(): HttpBodyField {
  return {
    id: `field_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    target_path: '',
    source_type: 'constant',
    constant_value: '',
    value_type: 'string',
  }
}

function makePromptVariable(): LlmPromptVariable {
  return {
    id: `var_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: '',
    variable_selector: [],
  }
}

function invertLoopOperator(operator: string) {
  switch (operator) {
    case 'lt':
      return 'gte'
    case 'gte':
      return 'lt'
    case 'not_empty':
      return 'not_empty'
    default:
      return operator || 'gte'
  }
}

function deriveLoopFields(config: ConfigState): ConfigState {
  const next = { ...config }
  let parsedCondition: Record<string, unknown> = {}

  const rawCondition = next.end_condition || next.condition
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
  const isLegacyCondition = !next.end_condition && Boolean(next.condition)
  const parsedOperator = String(parsedCondition.operator || (isLegacyCondition ? 'lt' : 'gte'))

  next.loop_condition_node_id = selector[0] || ''
  next.loop_condition_field = selector.slice(1).join('.') || ''
  next.loop_condition_operator = isLegacyCondition ? invertLoopOperator(parsedOperator) : parsedOperator
  next.loop_condition_value = parsedOperator === 'not_empty' ? '' : String(parsedCondition.value ?? '')
  next.loop_condition_mode = isLegacyCondition ? 'legacy' : 'end_condition'

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
  if (!flat.body_mode) flat.body_mode = flat.body ? 'raw_json' : 'fields'
  if (!flat.body_fields) flat.body_fields = '[]'
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
    const recommendedField = getRecommendedOutputField(node?.type)
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
    const recommendedField = getRecommendedOutputField(node?.type)
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
  const bodyFields = useMemo(() => parseJsonList<HttpBodyField>(config.body_fields), [config.body_fields])
  const promptVariables = useMemo(() => parseJsonList<LlmPromptVariable>(config.prompt_variables), [config.prompt_variables])

  const updateBodyFields = (nextFields: HttpBodyField[]) => {
    setConfigField('body_fields', JSON.stringify(nextFields))
  }

  const updateBodyField = (fieldId: string, patch: Partial<HttpBodyField>) => {
    updateBodyFields(bodyFields.map((field) => field.id === fieldId ? { ...field, ...patch } : field))
  }

  const updatePromptVariables = (nextVariables: LlmPromptVariable[]) => {
    setConfigField('prompt_variables', JSON.stringify(nextVariables))
  }

  const updatePromptVariable = (variableId: string, patch: Partial<LlmPromptVariable>) => {
    updatePromptVariables(promptVariables.map((variable) => variable.id === variableId ? { ...variable, ...patch } : variable))
  }

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
      const conditionOperator = config.loop_condition_operator || 'gte'
      const conditionValue = (config.loop_condition_value || '').trim()
      const selector = [conditionNodeId, ...conditionField.split('.').map((part) => part.trim()).filter(Boolean)].filter(Boolean)

      if (selector.length > 0) {
        finalConfig.end_condition = {
          variable_selector: selector,
          operator: conditionOperator,
          ...(conditionOperator === 'not_empty' ? {} : { value: conditionValue }),
        }
      } else {
        finalConfig.end_condition = {}
      }

      finalConfig.max_iterations = parseInt(config.max_iterations || '5', 10)
      finalConfig.start_node_id = config.start_node_id || ''
      finalConfig.end_node_id = config.end_node_id || ''
      delete finalConfig.condition
      delete finalConfig.loop_condition_node_id
      delete finalConfig.loop_condition_field
      delete finalConfig.loop_condition_operator
      delete finalConfig.loop_condition_value
      delete finalConfig.loop_condition_mode
    }

    if (type === 'http') {
      finalConfig.body_mode = config.body_mode || 'fields'
      if (finalConfig.body_mode === 'fields') {
        finalConfig.body_fields = bodyFields
          .filter((field) => field.target_path.trim())
          .map((field) => ({
            target_path: field.target_path.trim(),
            source_type: field.source_type,
            value_type: field.value_type || 'string',
            ...(field.source_type === 'node'
              ? { variable_selector: field.variable_selector || [] }
              : { constant_value: field.constant_value ?? '' }),
          }))
      } else {
        finalConfig.body_fields = []
      }
    }

    if (type === 'llm') {
      finalConfig.prompt_variables = promptVariables
        .filter((variable) => variable.name.trim() && variable.variable_selector?.length)
        .map((variable) => ({
          name: variable.name.trim(),
          variable_selector: variable.variable_selector || [],
        }))
    }

    onSave({ id: initial?.id, type: type as AgentNode['type'], label, config: finalConfig, parent_id: parentId || null }, nextEdges)
  }

  return (
    <div style={{ padding: 20, minWidth: 340, color: 'var(--text-primary)' }}>
      <h3 style={{ marginTop: 0, color: 'var(--color-primary-light)' }}>{initial ? '编辑节点' : '添加节点'}</h3>

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
                border: '1px solid var(--border)',
                background: type === t ? cfg.color + '22' : 'var(--bg-elevated)',
                color: type === t ? cfg.color : 'var(--text-secondary)',
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
            <label style={labelStyle}>Prompt 变量</label>
            <div style={{ display: 'grid', gap: 10 }}>
              {promptVariables.length > 0 ? promptVariables.map((variable) => (
                <div key={variable.id} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-nested)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 8 }}>
                    <input
                      value={variable.name}
                      onChange={(e) => updatePromptVariable(variable.id, { name: e.target.value })}
                      placeholder="变量名，如 score"
                      style={inputStyle}
                    />
                    <VariableSelector
                      nodes={allNodes || []}
                      currentNodeId={initial?.id}
                      value={{ nodeId: variable.variable_selector?.[0] || '', field: variable.variable_selector?.slice(1).join('.') || '' }}
                      onChange={(next) => updatePromptVariable(variable.id, { variable_selector: [next.nodeId, ...next.field.split('.').map((part) => part.trim()).filter(Boolean)].filter(Boolean) })}
                      fieldPlaceholder="text / result / data.score"
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{'可在 System Prompt 中用 {{变量名}} 引用。'}</div>
                    <button
                      onClick={() => updatePromptVariables(promptVariables.filter((item) => item.id !== variable.id))}
                      style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid var(--border-danger)', background: 'var(--bg-danger)', color: 'var(--color-danger-text)', cursor: 'pointer' }}
                    >
                      删除变量
                    </button>
                  </div>
                </div>
              )) : (
                <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 12 }}>
                  {'可选配置。添加后，可在 System Prompt 中用 {{变量名}} 精确引用上游字段。'}
                </div>
              )}
              <button
                onClick={() => updatePromptVariables([...promptVariables, makePromptVariable()])}
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-light)', cursor: 'pointer' }}
              >
                添加变量
              </button>
            </div>
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
            <label style={labelStyle}>Body 模式</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { value: 'raw_json', label: '原始 JSON' },
                { value: 'fields', label: '字段构造' },
              ].map((item) => (
                <button
                  key={item.value}
                  onClick={() => setConfigField('body_mode', item.value)}
                  style={{
                    padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)',
                    background: (config.body_mode || 'fields') === item.value ? 'var(--bg-selected)' : 'var(--bg-elevated)',
                    color: (config.body_mode || 'fields') === item.value ? 'var(--text-light)' : 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {(config.body_mode || 'fields') === 'raw_json' ? (
            <div style={fieldStyle}>
              <label style={labelStyle}>Body JSON</label>
              <JsonEditor value={config.body || '{}'} onChange={(v) => setConfigField('body', v)} />
            </div>
          ) : (
            <div style={fieldStyle}>
              <label style={labelStyle}>Body 字段</label>
              <div style={{ display: 'grid', gap: 10 }}>
                {bodyFields.length > 0 ? bodyFields.map((field) => (
                  <div key={field.id} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-nested)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px', gap: 8, marginBottom: 8 }}>
                      <input
                        value={field.target_path}
                        onChange={(e) => updateBodyField(field.id, { target_path: e.target.value })}
                        placeholder="目标字段，如 score / position.lon"
                        style={inputStyle}
                      />
                      <select
                        value={field.value_type}
                        onChange={(e) => updateBodyField(field.id, { value_type: e.target.value as HttpBodyField['value_type'] })}
                        style={inputStyle}
                      >
                        <option value="string">字符串</option>
                        <option value="number">数字</option>
                        <option value="boolean">布尔</option>
                        <option value="object">对象</option>
                        <option value="array">数组</option>
                        <option value="any">原值</option>
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 8 }}>
                      <select
                        value={field.source_type}
                        onChange={(e) => updateBodyField(field.id, { source_type: e.target.value as HttpBodyField['source_type'] })}
                        style={inputStyle}
                      >
                        <option value="constant">常量</option>
                        <option value="node">节点输出</option>
                      </select>
                      {field.source_type === 'node' ? (
                        <VariableSelector
                          nodes={allNodes || []}
                          currentNodeId={initial?.id}
                          value={{ nodeId: field.variable_selector?.[0] || '', field: field.variable_selector?.slice(1).join('.') || '' }}
                          onChange={(next) => updateBodyField(field.id, { variable_selector: [next.nodeId, ...next.field.split('.').map((part) => part.trim()).filter(Boolean)].filter(Boolean) })}
                          fieldPlaceholder="text / result / data.score"
                        />
                      ) : (
                        <input
                          value={field.constant_value || ''}
                          onChange={(e) => updateBodyField(field.id, { constant_value: e.target.value })}
                          placeholder="常量值"
                          style={inputStyle}
                        />
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                      <button
                        onClick={() => updateBodyFields(bodyFields.filter((item) => item.id !== field.id))}
                        style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid var(--border-danger)', background: 'var(--bg-danger)', color: 'var(--color-danger-text)', cursor: 'pointer' }}
                      >
                        删除字段
                      </button>
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 12 }}>
                    还没有字段，添加一行来构造请求 body。
                  </div>
                )}
                <button
                onClick={() => updateBodyFields([...bodyFields, makeBodyField()])}
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-light)', cursor: 'pointer' }}
                >
                  添加字段
                </button>
              </div>
            </div>
          )}
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
            <label style={labelStyle}>判断变量</label>
            <VariableSelector
              nodes={ifSourceNodes}
              currentNodeId={initial?.id}
              allowDirectUpstream
              value={{ nodeId: config.if_source_node_id || '', field: config.if_source_field || 'text' }}
              onChange={(next) => setConfig((prev) => ({ ...prev, if_source_node_id: next.nodeId, if_source_field: next.field }))}
              fieldPlaceholder="text / result / data.intent"
            />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
            先在画布里从 if-else 连出目标节点，这里会自动生成对应分支。
          </div>
          </div>
          {connectedBranchTargets.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {connectedBranchTargets.map((target) => (
                <div key={target.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-nested)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-light)', marginBottom: 8 }}>分支到：{target.label}</div>
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
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>未命中其它分支时，默认走这里</div>
                    ) : (config[`branch_operator__${target.id}`] || 'is') !== 'not_empty' ? (
                      <input
                        value={config[`branch_value__${target.id}`] || ''}
                        onChange={(e) => setConfigField(`branch_value__${target.id}`, e.target.value)}
                        placeholder="例如 0.8 / done / 达标"
                        style={inputStyle}
                      />
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>该分支在字段非空时命中</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '12px 12px', borderRadius: 10, background: 'var(--bg-info)', border: '1px dashed var(--border-accent)', fontSize: 12, color: 'var(--text-light)', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-lighter)', marginBottom: 4 }}>还没有可配置的分支</div>
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
            <label style={labelStyle}>结束变量</label>
            <VariableSelector
              nodes={loopConditionNodes}
              currentNodeId={initial?.id}
              value={{ nodeId: config.loop_condition_node_id || '', field: config.loop_condition_field || '' }}
              onChange={(next) => setConfig((prev) => ({ ...prev, loop_condition_node_id: next.nodeId, loop_condition_field: next.field }))}
              disabled={!loopConditionNodes.length}
              fieldPlaceholder="text / result / score / data.intent"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>操作符</label>
            <select value={config.loop_condition_operator || 'gte'} onChange={(e) => setConfigField('loop_condition_operator', e.target.value)} style={inputStyle} disabled={!config.loop_condition_node_id}>
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
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, marginBottom: 12, lineHeight: 1.6 }}>
            {config.loop_condition_node_id
              ? `每轮结束后会读取所选节点的输出字段，例如 ${config.loop_condition_field || 'text'}；条件满足时退出循环。常见字段：LLM 用 text，Code 用 result，HTTP / DB 可直接写返回里的字段路径。`
              : '先选择循环体里的一个节点作为结束判断来源。固定结构节点会自动带出推荐字段；HTTP / DB 默认留空，避免推荐错误字段。'}
          </div>
          {config.loop_condition_mode === 'legacy' && (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-warning)', border: '1px solid var(--border-warning)', fontSize: 12, color: 'var(--color-warning)', lineHeight: 1.6, marginBottom: 12 }}>
              这个 loop 之前使用的是旧版"继续条件"。这里已经按"结束条件"方式帮你转换显示；保存后会升级为新版配置。
            </div>
          )}
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
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 }}>
            {loopChildren.length
              ? `当前循环体里有 ${loopChildren.length} 个节点。结束条件来源、起点和终点都可以直接从这些节点里选择。`
              : '先把节点加入这个 loop 容器，结束条件来源、起点/终点下拉里才会出现可选项。'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            loop 连到外部结束节点的边请命名为 `loop_exit`。
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button onClick={onCancel} style={{ padding: '8px 20px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>取消</button>
        <button onClick={handleSave} style={{ padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'var(--color-primary)', color: '#fff' }}>确认</button>
      </div>
    </div>
  )
}

export default NodeForm
