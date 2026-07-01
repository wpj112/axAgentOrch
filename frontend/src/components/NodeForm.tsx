import { useEffect, useState } from 'react'
import type { AgentNode } from '../api/client'
import JsonEditor from './JsonEditor'
import { NodeIcon, NODE_CONFIG } from './nodeIcons'

const defaultIfElseBranches = `weather = weather
chat = chat`

interface NodeFormProps {
  initial?: AgentNode | null
  allNodes?: AgentNode[]
  onSave: (node: AgentNode) => void
  onCancel: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #2a3a5c',
  borderRadius: 6, boxSizing: 'border-box', background: '#0f1a30', color: '#e0e0e0',
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#b0bec5' }
const fieldStyle: React.CSSProperties = { marginBottom: 12 }

function selectorToPath(selector: unknown): string {
  if (Array.isArray(selector)) return selector.map(String).join('.')
  return typeof selector === 'string' ? selector : 'text'
}

function deriveIfElseFields(config: Record<string, string>): Record<string, string> {
  const next = { ...config }
  if (next.field_path && next.branches_text) return next

  try {
    const cases = JSON.parse(next.cases || next.cases_json || '[]')
    if (Array.isArray(cases) && cases.length > 0) {
      const firstCond = cases[0]?.conditions?.[0] || {}
      next.field_path = selectorToPath(firstCond.variable_selector)
      next.operator = firstCond.operator || 'is'
      next.branches_text = cases.map((item: any) => {
        const cond = item?.conditions?.[0] || {}
        const value = cond.operator === 'not_empty' ? '' : String(cond.value ?? '')
        return `${item.case_id} = ${value}`.trimEnd()
      }).join('\n')
    }
  } catch {}

  if (!next.field_path) next.field_path = 'text'
  if (!next.operator) next.operator = 'is'
  if (!next.branches_text) next.branches_text = defaultIfElseBranches
  if (!next.default_case_id) next.default_case_id = 'default'
  return next
}

function deriveLoopFields(config: Record<string, string>): Record<string, string> {
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

function parseIfElseBranches(fieldPath: string, operator: string, branchesText: string) {
  const selector = fieldPath.split('.').map((part) => part.trim()).filter(Boolean)
  const branches = branchesText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawCaseId, ...rest] = line.split('=')
      const caseId = rawCaseId.trim()
      const rawValue = rest.join('=').trim()
      const branch: Record<string, unknown> = { case_id: caseId }
      if (operator !== 'not_empty') branch.value = rawValue
      return branch
    })
    .filter((branch) => branch.case_id)

  const cases = branches.map((branch) => ({
    case_id: branch.case_id,
    conditions: [{
      variable_selector: selector,
      operator,
      ...(operator === 'not_empty' ? {} : { value: branch.value }),
    }],
  }))

  return { branches, cases }
}

function NodeForm({ initial, allNodes, onSave, onCancel }: NodeFormProps) {
  const [type, setType] = useState(initial?.type || 'llm')
  const [label, setLabel] = useState(initial?.label || '')
  const [parentId, setParentId] = useState(initial?.parent_id || '')
  const [config, setConfig] = useState<Record<string, string>>({})

  useEffect(() => {
    if (initial) {
      setType(initial.type as AgentNode['type'])
      setLabel(initial.label || '')
      setParentId(initial.parent_id || '')
    }
    if (initial?.config) {
      const flat: Record<string, string> = {}
      for (const [k, v] of Object.entries(initial.config)) {
        flat[k] = typeof v === 'string' ? v : JSON.stringify(v)
      }
      if (initial.type === 'if_else') {
        setConfig(deriveIfElseFields(flat))
      } else if (initial.type === 'loop') {
        setConfig(deriveLoopFields(flat))
      } else {
        setConfig(flat)
      }
    } else {
      setConfig({})
    }
  }, [initial])

  const handleSave = () => {
    const finalConfig: Record<string, unknown> = { ...config }
    if (type === 'if_else') {
      const fieldPath = (config.field_path || 'text').trim()
      const operator = config.operator || 'is'
      const { branches, cases } = parseIfElseBranches(fieldPath, operator, config.branches_text || '')
      finalConfig.field_path = fieldPath
      finalConfig.operator = operator
      finalConfig.branches = branches
      finalConfig.cases = cases
      finalConfig.default_case_id = config.default_case_id || 'default'
      delete finalConfig.branches_text
      delete finalConfig.cases_json
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
    onSave({ id: initial?.id, type: type as AgentNode['type'], label, config: finalConfig, parent_id: parentId || null })
  }

  const setConfigField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const loopChildren = type === 'loop' && initial?.id && allNodes
    ? allNodes.filter((node) => node.parent_id === initial.id)
    : []

  const loopConditionNodes = loopChildren.filter((node) => node.id)

  return (
    <div style={{ padding: 20, minWidth: 340, color: '#e0e0e0' }}>
      <h3 style={{ marginTop: 0, color: '#90caf9' }}>
        {initial ? '编辑节点' : '添加节点'}
      </h3>

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
                border: '1px solid #2a3a5c',
                background: type === t ? cfg.color + '22' : '#0f1a30',
                color: type === t ? cfg.color : '#b0bec5',
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
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            style={inputStyle}
          >
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
            <label style={labelStyle}>判断字段</label>
            <input value={config.field_path || 'text'} onChange={(e) => setConfigField('field_path', e.target.value)} placeholder="text / result / data.intent" style={inputStyle} />
            <div style={{ fontSize: 11, color: '#6a7a8a', marginTop: 6, lineHeight: 1.6 }}>
              If-else 默认读取它正上游节点的输出。常见写法：LLM 用 `text`，Code 用 `result`，HTTP JSON 直接写字段名，如 `intent` 或 `data.intent`。
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>操作符</label>
            <select value={config.operator || 'is'} onChange={(e) => setConfigField('operator', e.target.value)} style={inputStyle}>
              <option value="is">等于</option>
              <option value="not_empty">非空</option>
              <option value="lt">小于</option>
              <option value="gte">大于等于</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>分支列表</label>
            <textarea
              value={config.branches_text || defaultIfElseBranches}
              onChange={(e) => setConfigField('branches_text', e.target.value)}
              rows={6}
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
            />
            <div style={{ fontSize: 11, color: '#6a7a8a', marginTop: 4 }}>
              每行一个分支，格式：`分支名 = 比较值`。例如 `weather = weather`。
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>默认分支名</label>
            <input value={config.default_case_id || 'default'} onChange={(e) => setConfigField('default_case_id', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ fontSize: 11, color: '#6a7a8a', marginTop: 4, lineHeight: 1.6 }}>
            保存后，从条件节点连出去的边，双击边并填写分支名，例如 `weather` / `chat` / `default`。
          </div>
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
            <select
              value={config.loop_condition_node_id || ''}
              onChange={(e) => setConfigField('loop_condition_node_id', e.target.value)}
              style={inputStyle}
              disabled={!loopConditionNodes.length}
            >
              <option value="">未设置（仅按最大轮次结束）</option>
              {loopConditionNodes.map((node) => (
                <option key={node.id} value={node.id}>{node.label} ({NODE_CONFIG[node.type]?.label || node.type})</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>判断字段</label>
            <input
              value={config.loop_condition_field || ''}
              onChange={(e) => setConfigField('loop_condition_field', e.target.value)}
              placeholder="text / result / score / data.intent"
              style={inputStyle}
              disabled={!config.loop_condition_node_id}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>操作符</label>
            <select
              value={config.loop_condition_operator || 'lt'}
              onChange={(e) => setConfigField('loop_condition_operator', e.target.value)}
              style={inputStyle}
              disabled={!config.loop_condition_node_id}
            >
              <option value="is">等于</option>
              <option value="not_empty">非空</option>
              <option value="lt">小于</option>
              <option value="gte">大于等于</option>
            </select>
          </div>
          {config.loop_condition_operator !== 'not_empty' && (
            <div style={fieldStyle}>
              <label style={labelStyle}>比较值</label>
              <input
                value={config.loop_condition_value || ''}
                onChange={(e) => setConfigField('loop_condition_value', e.target.value)}
                placeholder="例如 3 / done / 0.8"
                style={inputStyle}
                disabled={!config.loop_condition_node_id}
              />
            </div>
          )}
          <div style={{ fontSize: 11, color: '#6a7a8a', marginTop: -4, marginBottom: 12, lineHeight: 1.6 }}>
            {config.loop_condition_node_id
              ? `当前会读取所选节点的输出字段，例如 ${config.loop_condition_field || 'text'}。常见字段：LLM 用 text，Code 用 result，HTTP / DB 可直接写返回里的字段路径。`
              : '先选择循环体里的一个节点作为判断来源，再填写它输出里的字段名。'}
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
          <div style={{ fontSize: 11, color: '#6a7a8a', marginTop: 4, lineHeight: 1.6 }}>
            {loopChildren.length
              ? `当前循环体里有 ${loopChildren.length} 个节点。条件来源、起点和终点都可以直接从这些节点里选择。`
              : '先把节点加入这个 loop 容器，条件来源、起点/终点下拉里才会出现可选项。'}
          </div>
          <div style={{ fontSize: 11, color: '#6a7a8a', marginTop: 8 }}>
            loop 连到外部结束节点的边请命名为 `loop_exit`。
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button onClick={onCancel} style={{ padding: '8px 20px', fontSize: 14, border: '1px solid #2a3a5c', borderRadius: 6, cursor: 'pointer', background: '#0f1a30', color: '#e0e0e0' }}>取消</button>
        <button onClick={handleSave} style={{ padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6, cursor: 'pointer', background: '#1565c0', color: '#fff' }}>确认</button>
      </div>
    </div>
  )
}

export default NodeForm
