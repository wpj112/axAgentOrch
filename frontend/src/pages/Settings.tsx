import { useState, useEffect } from 'react'
import { fetchSettings, updateSettings, type AppSettings } from '../api/client'

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 14,
  border: '1px solid #2e3345', borderRadius: 6, boxSizing: 'border-box',
  background: '#252836', color: '#e0e0e0',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 14,
  border: '1px solid #2e3345', borderRadius: 6, boxSizing: 'border-box',
  background: '#252836', color: '#e0e0e0',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4,
  color: '#9ca3af',
}

const fieldStyle: React.CSSProperties = { marginBottom: 16 }

type Provider = 'openai' | 'ollama' | 'deepseek' | 'custom'

const PROVIDERS: { key: Provider; label: string; baseUrl: string; models: string[] }[] = [
  { key: 'openai',   label: 'OpenAI',   baseUrl: 'https://api.openai.com/v1',      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { key: 'ollama',   label: 'Ollama',   baseUrl: 'http://host.docker.internal:11434/v1', models: ['llama3', 'qwen2.5', 'qwen2.5:7b', 'qwen2.5:14b', 'mistral', 'deepseek-r1'] },
  { key: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1',     models: ['deepseek-chat', 'deepseek-coder'] },
  { key: 'custom',   label: '自定义',    baseUrl: '',                                 models: [] },
]

function detectProvider(baseUrl: string): Provider {
  if (baseUrl.includes('openai.com')) return 'openai'
  if (baseUrl.includes('11434')) return 'ollama'
  if (baseUrl.includes('deepseek.com')) return 'deepseek'
  return 'custom'
}

function Settings() {
  const [settings, setSettings] = useState<AppSettings>({ model: '', api_key: '', base_url: '', temperature: '0.7' })
  const [provider, setProvider] = useState<Provider>('openai')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetchSettings().then(s => {
      setSettings(s)
      setProvider(detectProvider(s.base_url || ''))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleProviderChange = (p: Provider) => {
    setProvider(p)
    const info = PROVIDERS.find(q => q.key === p)!
    if (p !== 'custom') {
      setSettings({ ...settings, base_url: info.baseUrl, model: info.models[0] })
    }
  }

  const models = PROVIDERS.find(p => p.key === provider)?.models || []

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

  if (loading) return <div style={{ color: '#9ca3af' }}>加载中...</div>

  return (
    <div style={{ maxWidth: 520, color: '#e0e0e0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <a href="/" style={{ color: '#60a5fa', textDecoration: 'none', fontSize: 14 }}>← 返回列表</a>
        <span style={{ fontSize: 18, fontWeight: 600 }}>全局设置</span>
      </div>

      <div style={{ background: '#1a1d29', border: '1px solid #2e3345', borderRadius: 10, padding: 24 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>提供商</label>
          <select
            value={provider}
            onChange={e => handleProviderChange(e.target.value as Provider)}
            style={selectStyle}
          >
            {PROVIDERS.map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Model</label>
          {models.length > 0 ? (
            <>
              <input
                list="model-options"
                value={settings.model}
                onChange={e => setSettings({ ...settings, model: e.target.value })}
                placeholder="选择或输入模型名"
                style={inputStyle}
              />
              <datalist id="model-options">
                {models.map(m => <option key={m} value={m} />)}
              </datalist>
            </>
          ) : (
            <input
              value={settings.model}
              onChange={e => setSettings({ ...settings, model: e.target.value })}
              placeholder="输入模型名"
              style={inputStyle}
            />
          )}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>API Key</label>
          <input
            type="password"
            value={settings.api_key}
            onChange={e => setSettings({ ...settings, api_key: e.target.value })}
            placeholder="sk-...（本地 Ollama 可留空）"
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Base URL</label>
          <input
            value={settings.base_url}
            onChange={e => setSettings({ ...settings, base_url: e.target.value })}
            placeholder="https://api.openai.com/v1"
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Temperature</label>
          <input
            value={settings.temperature}
            onChange={e => setSettings({ ...settings, temperature: e.target.value })}
            placeholder="0.7"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 24px', fontSize: 14, border: 'none', borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer', background: '#3b82f6', color: '#fff',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
          {msg && <span style={{ fontSize: 13, color: msg === '保存成功' ? '#22c55e' : '#ef9a9a' }}>{msg}</span>}
        </div>
      </div>
    </div>
  )
}

export default Settings
