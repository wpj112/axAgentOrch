import { useState, useEffect } from 'react'
import type { AgentNode } from '../api/client'

const defaultIfElseCases = JSON.stringify({
  cases: [
    {
      case_id: "case_1",
      conditions: [
        { variable_selector: ["node_id", "field"], operator: "is", value: "target_value" }
      ]
    }
  ],
  default_case_id: "default"
}, null, 2)

const defaultLoopCondition = JSON.stringify({
  variable_selector: ["node_id", "field"],
  operator: "lt",
  value: 0.8
}, null, 2)

interface NodeFormProps {
  initial?: AgentNode | null
  onSave: (node: AgentNode) => void
  onCancel: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #2a3a5c',
  borderRadius: 6, boxSizing: 'border-box', background: '#0f1a30', color: '#e0e0e0',
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#b0bec5' }

const fieldStyle: React.CSSProperties = { marginBottom: 12 }

const TYPE_OPTIONS = ['start', 'llm', 'http', 'db', 'code', 'if_else', 'loop', 'end']

function NodeForm({ initial, onSave, onCancel }: NodeFormProps) {
  const [type, setType] = useState(initial?.type || 'llm')
  const [label, setLabel] = useState(initial?.label || '')
  const [config, setConfig] = useState<Record<string, string>>({})

  useEffect(() => {
    if (initial) {
      setType(initial.type as AgentNode['type'])
      setLabel(initial.label || '')
    }
    if (initial?.config) {
      const flat: Record<string, string> = {}
      for (const [k, v] of Object.entries(initial.config)) {
        flat[k] = typeof v === 'string' ? v : JSON.stringify(v)
      }
      setConfig(flat)
    }
  }, [initial])

  const handleSave = () => {
    const finalConfig: Record<string, unknown> = { ...config }
    // Parse JSON fields for if_else and loop on save
    if (type === 'if_else') {
      try { finalConfig.cases = JSON.parse((config.cases_json as string) || '{}') } catch { finalConfig.cases = [] }
      finalConfig.default_case_id = config.default_case_id || 'default'
      delete finalConfig.cases_json
      delete finalConfig.default_case_id
    }
    if (type === 'loop') {
      try { finalConfig.condition = JSON.parse((config.condition_json as string) || '{}') } catch { finalConfig.condition = {} }
      finalConfig.max_iterations = parseInt((config.max_iterations as string) || '5', 10)
      finalConfig.start_node_id = config.start_node_id || ''
      finalConfig.end_node_id = config.end_node_id || ''
      delete finalConfig.condition_json
      delete finalConfig.max_iterations
      delete finalConfig.start_node_id
      delete finalConfig.end_node_id
    }
    onSave({ type: type as AgentNode['type'], label, config: finalConfig })
  }

  const setConfigField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div style={{ padding: 20, minWidth: 340, color: '#e0e0e0' }}>
      <h3 style={{ marginTop: 0, color: '#90caf9' }}>
        {initial ? '编辑节点' : '添加节点'}
      </h3>

      <div style={fieldStyle}>
        <label style={labelStyle}>类型</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as AgentNode['type'])}
          style={inputStyle}
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>标签</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="节点显示名称"
          style={inputStyle}
        />
      </div>

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
            <textarea value={config.body || '{}'} onChange={(e) => setConfigField('body', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
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
            <label style={labelStyle}>Cases (JSON)</label>
            <textarea
              value={config.cases_json || defaultIfElseCases}
              onChange={(e) => setConfigField('cases_json', e.target.value)}
              rows={8}
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Default Case ID</label>
            <input value={config.default_case_id || 'default'} onChange={(e) => setConfigField('default_case_id', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ fontSize: 11, color: '#6a7a8a', marginTop: 4 }}>
            边通过 source_handle 匹配 case_id。例如 source_handle="order_search" 连到对应分支节点。
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
            <label style={labelStyle}>Condition (JSON)</label>
            <textarea
              value={config.condition_json || defaultLoopCondition}
              onChange={(e) => setConfigField('condition_json', e.target.value)}
              rows={5}
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Start Node ID</label>
            <input value={config.start_node_id || ''} onChange={(e) => setConfigField('start_node_id', e.target.value)} placeholder="循环体第一个节点ID" style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>End Node ID</label>
            <input value={config.end_node_id || ''} onChange={(e) => setConfigField('end_node_id', e.target.value)} placeholder="循环体最后一个节点ID" style={inputStyle} />
          </div>
          <div style={{ fontSize: 11, color: '#6a7a8a', marginTop: 4 }}>
            循环体内节点需设置 parent_id=此节点ID。出口边用 source_handle="loop_exit"。
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button onClick={onCancel} style={{ padding: '8px 20px', fontSize: 14, border: '1px solid #2a3a5c', borderRadius: 6, cursor: 'pointer', background: '#0f1a30', color: '#e0e0e0' }}>
          取消
        </button>
        <button onClick={handleSave} style={{ padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6, cursor: 'pointer', background: '#1565c0', color: '#fff' }}>
          确认
        </button>
      </div>
    </div>
  )
}

export default NodeForm
