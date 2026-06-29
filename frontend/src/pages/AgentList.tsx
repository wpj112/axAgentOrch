import { useState, useEffect, useCallback } from 'react'
import { fetchAgents, deleteAgent as apiDeleteAgent, type Agent } from '../api/client'
import AgentCard, { apiUrl, copyApiUrl } from '../components/AgentCard'

const btnStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 15, border: '1px solid #2a3a5c',
  borderRadius: 6, cursor: 'pointer', background: '#1e2a4a', color: '#b0bec5',
}

const btnActive: React.CSSProperties = { ...btnStyle, background: '#1565c0', color: '#fff', border: '1px solid #1565c0' }

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px', fontSize: 12,
  fontWeight: 600, color: '#6a7a8a', borderBottom: '1px solid #2a3a5c',
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
    await apiDeleteAgent(id)
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="搜索智能体..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 14px', fontSize: 14, border: '1px solid #2a3a5c', borderRadius: 6, width: 260, background: '#0f1a30', color: '#e0e0e0' }}
          />
          <div style={{ display: 'flex', border: '1px solid #2a3a5c', borderRadius: 6, overflow: 'hidden' }}>
            <button style={view === 'card' ? btnActive : btnStyle} onClick={() => setView('card')} title="卡片">▦</button>
            <button style={view === 'list' ? btnActive : btnStyle} onClick={() => setView('list')} title="列表">☰</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/settings" style={{ padding: '8px 16px', background: '#1e2a4a', color: '#b0bec5', border: '1px solid #2a3a5c', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>⚙ 设置</a>
          <a href="/agents/new" style={{ padding: '8px 20px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, textDecoration: 'none', fontSize: 14 }}>+ 新建智能体</a>
        </div>
      </div>

      {loading ? <div style={{ color: '#b0bec5' }}>加载中...</div> : null}

      {!loading && agents.length === 0 ? (
        <div style={{ color: '#6a7a8a', marginTop: 40, textAlign: 'center' }}>暂无智能体，点击「+ 新建智能体」创建</div>
      ) : null}

      {view === 'card' && agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} onDelete={handleDelete} />
      ))}

      {view === 'list' && agents.length > 0 && (
        <div style={{ background: '#1e2a4a', border: '1px solid #2a3a5c', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>名称</th>
                <th style={thStyle}>API</th>
                <th style={thStyle}>描述</th>
                <th style={{ ...thStyle, textAlign: 'center', width: 60 }}>节点</th>
                <th style={thStyle}>创建时间</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} style={{ transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = '#0f1a30')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{agent.name}</div>
                    {agent.llm_model && <div style={{ fontSize: 11, color: '#6a7a8a', marginTop: 2 }}>{agent.llm_model}</div>}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <code style={{ fontSize: 11, color: '#81c784', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                        POST {apiUrl(agent.id)}
                      </code>
                      <button
                        onClick={() => handleCopy(agent.id)}
                        style={{ padding: '2px 8px', fontSize: 10, border: '1px solid #2a3a5c', borderRadius: 3, cursor: 'pointer', background: copiedId === agent.id ? '#1b3a1e' : 'transparent', color: copiedId === agent.id ? '#81c784' : '#6a7a8a', flexShrink: 0 }}
                      >
                        {copiedId === agent.id ? '✓' : '复制'}
                      </button>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: '#6a7a8a', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agent.description || '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{agent.nodes.length}</td>
                  <td style={{ ...tdStyle, color: '#6a7a8a', fontSize: 12 }}>
                    {new Date(agent.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <a href={`/agents/${agent.id}`} style={{ ...actionBtn, background: '#1565c0', marginRight: 6 }}>编辑</a>
                    <button onClick={() => handleDelete(agent.id)} style={{ ...actionBtn, background: '#c62828' }}>删除</button>
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
