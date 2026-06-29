import { useState, useEffect, useCallback } from 'react'
import { fetchAgents, deleteAgent as apiDeleteAgent, type Agent } from '../api/client'
import AgentCard from '../components/AgentCard'

function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const loadAgents = useCallback(async () => {
    setLoading(true)
    const data = await fetchAgents(search || undefined)
    setAgents(data.items)
    setLoading(false)
  }, [search])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除此智能体？')) return
    await apiDeleteAgent(id)
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <input
          placeholder="搜索智能体..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            border: '1px solid #2a3a5c',
            borderRadius: 6,
            width: 260,
            background: '#0f1a30',
            color: '#e0e0e0',
          }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
        <a href="/settings" style={{ padding: '8px 16px', background: '#1e2a4a', color: '#b0bec5', border: '1px solid #2a3a5c', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>⚙ 设置</a>
        <a
          href="/agents/new"
          style={{
            padding: '8px 20px',
            background: '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          + 新建智能体
        </a>
        </div>
      </div>

      {loading ? <div style={{ color: '#b0bec5' }}>加载中...</div> : null}

      {!loading && agents.length === 0 ? (
        <div style={{             color: '#6a7a8a', marginTop: 40, textAlign: 'center' }}>
          暂无智能体，点击「+ 新建智能体」创建
        </div>
      ) : null}

      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} onDelete={handleDelete} />
      ))}
    </div>
  )
}

export default AgentList
