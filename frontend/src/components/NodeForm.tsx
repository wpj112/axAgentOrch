import { useState, useEffect } from 'react'
import type { AgentNode } from '../api/client'

interface NodeFormProps {
  initial?: AgentNode | null
  onSave: (node: AgentNode) => void
  onCancel: () => void
}

const TYPE_OPTIONS = ['start', 'llm', 'http', 'db', 'code', 'end']

function NodeForm({ initial, onSave, onCancel }: NodeFormProps) {
  const [type, setType] = useState(initial?.type || 'llm')
  const [label, setLabel] = useState(initial?.label || '')
  const [config, setConfig] = useState<Record<string, string>>({})

  useEffect(() => {
    if (initial?.config) {
      const flat: Record<string, string> = {}
      for (const [k, v] of Object.entries(initial.config)) {
        flat[k] = typeof v === 'string' ? v : JSON.stringify(v)
      }
      setConfig(flat)
    }
  }, [initial])

  const handleSave = () => {
    onSave({ type: type as AgentNode['type'], label, config: config as Record<string, unknown> })
  }

  const setConfigField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div style={{ padding: 20, minWidth: 400 }}>
      <h3 style={{ marginTop: 0 }}>
        {initial ? '编辑节点' : '添加节点'}
      </h3>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>类型</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as AgentNode['type'])}
          style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6 }}
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>标签</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="节点显示名称"
          style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }}
        />
      </div>

      {type === 'llm' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Model</label>
            <input value={config.model || ''} onChange={(e) => setConfigField('model', e.target.value)} placeholder="gpt-4o" style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>System Prompt</label>
            <textarea value={config.system_prompt || ''} onChange={(e) => setConfigField('system_prompt', e.target.value)} rows={3} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Temperature</label>
            <input value={config.temperature || '0.7'} onChange={(e) => setConfigField('temperature', e.target.value)} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
        </>
      )}

      {type === 'http' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>URL</label>
            <input value={config.url || ''} onChange={(e) => setConfigField('url', e.target.value)} placeholder="https://api.example.com/data" style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Method</label>
            <select value={config.method || 'GET'} onChange={(e) => setConfigField('method', e.target.value)} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6 }}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Headers (JSON)</label>
            <textarea value={config.headers || '{}'} onChange={(e) => setConfigField('headers', e.target.value)} rows={2} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Body Template (JSON)</label>
            <textarea value={config.body || '{}'} onChange={(e) => setConfigField('body', e.target.value)} rows={2} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        </>
      )}

      {type === 'db' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Connection String</label>
            <input value={config.connection_string || ''} onChange={(e) => setConfigField('connection_string', e.target.value)} placeholder="postgresql://user:pass@host/db" style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Query</label>
            <textarea value={config.query || ''} onChange={(e) => setConfigField('query', e.target.value)} placeholder="SELECT * FROM table LIMIT 10" rows={3} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        </>
      )}

      {type === 'code' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Language</label>
            <select value={config.language || 'python'} onChange={(e) => setConfigField('language', e.target.value)} style={{ width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6 }}>
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Source Code</label>
            <textarea value={config.source_code || ''} onChange={(e) => setConfigField('source_code', e.target.value)} rows={6} style={{ width: '100%', padding: '6px 10px', fontFamily: 'monospace', fontSize: 13, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button onClick={onCancel} style={{ padding: '8px 20px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', background: '#fff' }}>
          取消
        </button>
        <button onClick={handleSave} style={{ padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6, cursor: 'pointer', background: '#1976d2', color: '#fff' }}>
          确认
        </button>
      </div>
    </div>
  )
}

export default NodeForm
