import { useState, useEffect } from 'react'
import { fetchSettings, updateSettings, type AppSettings } from '../api/client'
import { useTheme } from '../ThemeContext'

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 14,
  border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box',
  background: 'var(--bg-elevated)', color: 'var(--text-primary)',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 14,
  border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box',
  background: 'var(--bg-elevated)', color: 'var(--text-primary)',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4,
  color: 'var(--text-secondary)',
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
  const [settings, setSettings] = useState<AppSettings>({ model: '', api_key: '', base_url: '', temperature: '0.7', theme: 'dark' })
  const [provider, setProvider] = useState<Provider>('openai')
  const { setTheme } = useTheme()
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
      setTheme(settings.theme)
      setMsg('保存成功')
    } catch {
      setMsg('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleThemeChange = (t: string) => {
    setSettings({ ...settings, theme: t })
    setTheme(t)
  }

  if (loading) return <div style={{ color: 'var(--text-muted)' }}>加载中...</div>

  return (
    <div style={{ maxWidth: 520, color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <a href="/" style={{ color: 'var(--color-primary-light)', textDecoration: 'none', fontSize: 14 }}>← 返回列表</a>
        <span style={{ fontSize: 18, fontWeight: 600 }}>全局设置</span>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
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

        <div style={fieldStyle}>
          <label style={labelStyle}>主题</label>
          <select
            value={settings.theme || 'dark'}
            onChange={e => handleThemeChange(e.target.value)}
            style={selectStyle}
          >
            <option value="dark">深色</option>
            <option value="light">浅色</option>
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 24px', fontSize: 14, border: 'none', borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer', background: 'var(--color-primary)', color: '#fff',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
          {msg && <span style={{ fontSize: 13, color: msg === '保存成功' ? 'var(--color-success)' : 'var(--color-danger-text)' }}>{msg}</span>}
        </div>
      </div>
    </div>
  )
}

export default Settings
