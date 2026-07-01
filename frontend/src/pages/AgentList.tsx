import { useState, useEffect, useCallback } from 'react'
import { fetchAgents, deleteAgent as apiDeleteAgent, importAgent, type Agent } from '../api/client'
import AgentCard, { apiUrl, copyApiUrl } from '../components/AgentCard'

const btnStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 15, border: '1px solid #2e3345',
  borderRadius: 6, cursor: 'pointer', background: '#1a1d29', color: '#9ca3af',
}

const btnActive: React.CSSProperties = { ...btnStyle, background: '#3b82f6', color: '#fff', border: '1px solid #3b82f6' }

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px', fontSize: 12,
  fontWeight: 600, color: '#8b8fa3', borderBottom: '1px solid #2e3345',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #1a2a4a',
  color: '#e0e0e0',
}

const actionBtn: React.CSSProperties = {
  padding: '4px 12px', fontSize: 12, border: 'none', borderRadius: 4,
  cursor: 'pointer', color: '#fff', textDecoration: 'none', display: 'inline-block',
}

function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'card' | 'list'>('card')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const loadAgents = useCallback(async () => {
    setLoading(true)
    const data = await fetchAgents(search || undefined)
    setAgents(data.items)
    setLoading(false)
  }, [search])

  useEffect(() => { loadAgents() }, [loadAgents])

  const handleCopy = (id: string) => {
    copyApiUrl(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除此智能体？')) return
    await apiDeleteAgent(id)
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const json = JSON.parse(text)
        await importAgent(json)
        loadAgents()
        alert('导入成功')
      } catch { alert('导入失败，请检查 JSON 格式') }
    }
    input.click()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="搜索智能体..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 14px', fontSize: 14, border: '1px solid #2e3345', borderRadius: 6, width: 260, background: '#252836', color: '#e0e0e0' }}
          />
          <div style={{ display: 'flex', border: '1px solid #2e3345', borderRadius: 6, overflow: 'hidden' }}>
            <button style={view === 'card' ? btnActive : btnStyle} onClick={() => setView('card')} title="卡片">▦</button>
            <button style={view === 'list' ? btnActive : btnStyle} onClick={() => setView('list')} title="列表">☰</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleImport} style={{ padding: '8px 14px', background: '#1a1d29', color: '#9ca3af', border: '1px solid #2e3345', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>📥 导入</button>
          <a href="/settings" style={{ padding: '8px 16px', background: '#1a1d29', color: '#9ca3af', border: '1px solid #2e3345', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>⚙ 设置</a>
          <a href="/agents/new" style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, textDecoration: 'none', fontSize: 14 }}>+ 新建智能体</a>
        </div>
      </div>

      {loading ? <div style={{ color: '#9ca3af' }}>加载中...</div> : null}

      {!loading && agents.length === 0 ? (
        <div style={{ color: '#8b8fa3', marginTop: 40, textAlign: 'center' }}>暂无智能体，点击「+ 新建智能体」创建</div>
      ) : null}

      {view === 'card' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {view === 'list' && agents.length > 0 && (
        <div style={{ background: '#1a1d29', border: '1px solid #2e3345', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>名称</th>
                <th style={thStyle}>API</th>
                <th style={thStyle}>描述</th>
                <th style={{ ...thStyle, textAlign: 'center', width: 60 }}>节点</th>
                <th style={thStyle}>创建时间</th>
                <th style={thStyle}>编辑时间</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} style={{ transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = '#252836')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{agent.name}</div>
                    {agent.llm_model && <div style={{ fontSize: 11, color: '#8b8fa3', marginTop: 2 }}>{agent.llm_model}</div>}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <code style={{ fontSize: 11, color: '#22c55e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                        POST {apiUrl(agent.id)}
                      </code>
                      <button
                        onClick={() => handleCopy(agent.id)}
                        style={{ padding: '2px 8px', fontSize: 10, border: '1px solid #2e3345', borderRadius: 3, cursor: 'pointer', background: copiedId === agent.id ? '#1b3a1e' : 'transparent', color: copiedId === agent.id ? '#22c55e' : '#8b8fa3', flexShrink: 0 }}
                      >
                        {copiedId === agent.id ? '✓' : '复制'}
                      </button>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: '#8b8fa3', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agent.description || '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{agent.nodes.length}</td>
                  <td style={{ ...tdStyle, color: '#8b8fa3', fontSize: 12 }}>
                    {new Date(agent.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td style={{ ...tdStyle, color: '#8b8fa3', fontSize: 12 }}>
                    {new Date(agent.updated_at).toLocaleString('zh-CN', { hour12: false })}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <a href={`/agents/${agent.id}`} style={{ ...actionBtn, background: '#3b82f6', marginRight: 6 }}>编辑</a>
                    <button onClick={() => handleDelete(agent.id)} style={{ ...actionBtn, background: '#ef4444' }}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AgentList
