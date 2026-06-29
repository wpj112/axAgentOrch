import { useState, useEffect } from 'react'
import { fetchSettings, updateSettings, type AppSettings } from '../api/client'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 14,
  border: '1px solid #2a3a5c', borderRadius: 6, boxSizing: 'border-box',
  background: '#0f1a30', color: '#e0e0e0',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4,
  color: '#b0bec5',
}

const fieldStyle: React.CSSProperties = { marginBottom: 16 }

function Settings() {
  const [settings, setSettings] = useState<AppSettings>({ model: '', api_key: '', base_url: '', temperature: '0.7' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetchSettings().then(s => { setSettings(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings(settings)
      setMsg('保存成功')
    } catch {
      setMsg('保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: '#b0bec5' }}>加载中...</div>

  return (
    <div style={{ maxWidth: 520, color: '#e0e0e0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <a href="/" style={{ color: '#90caf9', textDecoration: 'none', fontSize: 14 }}>← 返回列表</a>
        <span style={{ fontSize: 18, fontWeight: 600 }}>全局设置</span>
      </div>

      <div style={{ background: '#1e2a4a', border: '1px solid #2a3a5c', borderRadius: 10, padding: 24 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Model</label>
          <input value={settings.model} onChange={e => setSettings({ ...settings, model: e.target.value })} placeholder="gpt-4o / llama3 / qwen2.5" style={inputStyle} />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>API Key</label>
          <input type="password" value={settings.api_key} onChange={e => setSettings({ ...settings, api_key: e.target.value })} placeholder="sk-..." style={inputStyle} />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Base URL</label>
          <input value={settings.base_url} onChange={e => setSettings({ ...settings, base_url: e.target.value })} placeholder="https://api.openai.com/v1" style={inputStyle} />
          <div style={{ fontSize: 11, color: '#6a7a8a', marginTop: 4 }}>
            支持 Ollama：<code style={{ background: '#0f1a30', padding: '1px 4px', borderRadius: 3 }}>http://localhost:11434/v1</code>
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Temperature</label>
          <input value={settings.temperature} onChange={e => setSettings({ ...settings, temperature: e.target.value })} placeholder="0.7" style={inputStyle} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 24px', fontSize: 14, border: 'none', borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer', background: '#1565c0', color: '#fff',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
          {msg && <span style={{ fontSize: 13, color: msg === '保存成功' ? '#81c784' : '#ef9a9a' }}>{msg}</span>}
        </div>
      </div>
    </div>
  )
}

export default Settings
