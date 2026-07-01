import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type Agent, exportAgent } from '../api/client'

interface AgentCardProps {
  agent: Agent
  onDelete: (id: string) => void
}

function AgentCard({ agent, onDelete }: AgentCardProps) {
  const navigate = useNavigate()
  const [hover, setHover] = useState(false)
  const [delHover, setDelHover] = useState(false)

  const handleExport = async () => {
    try {
      const data = await exportAgent(agent.id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${agent.name}.json`
      a.click(); URL.revokeObjectURL(url)
    } catch { alert('导出失败') }
  }

  const timeAgo = (value: string) => {
    const diff = Date.now() - new Date(value).getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return `${Math.floor(diff / 86400)} 天前`
  }

  return (
    <div
      onDoubleClick={() => navigate(`/agents/${agent.id}`)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: '1px solid #2e3345',
        borderRadius: 10,
        padding: '16px 18px',
        background: '#1a1d29',
        color: '#e0e0e0',
        transition: 'box-shadow 0.2s, transform 0.2s, border-color 0.2s',
        boxShadow: hover ? '0 8px 24px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.2)',
        transform: hover ? 'translateY(-2px)' : 'none',
        borderColor: hover ? '#3b82f6' : '#2e3345',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
          <div style={{ fontSize: 12, color: '#8b8fa3', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {agent.description || '暂无描述'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 12 }}>
          <button onClick={handleExport} title="导出" style={{
            width: 28, height: 28, padding: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: hover ? '#252836' : 'transparent', color: '#8b8fa3',
            border: 'none', borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
          }}>⬇</button>
          <a href={`/agents/${agent.id}`} title="编辑" style={{
            width: 28, height: 28, padding: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: hover ? '#252836' : 'transparent', color: hover ? '#60a5fa' : '#8b8fa3',
            border: 'none', borderRadius: 6, cursor: 'pointer', textDecoration: 'none', transition: 'all 0.15s',
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M2 13.5l1 2 2-1L14 5.5l-2-2L3.5 12.5z" />
              <line x1="10.5" y1="3.5" x2="13.5" y2="6.5" />
            </svg>
          </a>
          <button
            onClick={() => onDelete(agent.id)}
            title="删除"
            onMouseEnter={() => setDelHover(true)}
            onMouseLeave={() => setDelHover(false)}
            style={{
              width: 28, height: 28, padding: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: delHover ? 'rgba(239,68,68,0.12)' : 'transparent',
              color: delHover ? '#ef4444' : '#8b8fa3',
              border: 'none', borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >✕</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, fontSize: 11, color: '#8b8fa3' }}>
        <span>{agent.nodes.length} 个节点</span>
        {agent.llm_model && <span>· {agent.llm_model}</span>}
        <span style={{ marginLeft: 'auto' }}>{timeAgo(agent.updated_at)}</span>
      </div>
    </div>
  )
}

const apiUrl = (id: string) => `${window.location.origin}/api/agents/${id}/run`

function copyApiUrl(id: string) {
  navigator.clipboard.writeText(`curl -X POST "${apiUrl(id)}" -H "Content-Type: application/json" -d '{"input":{"message":"hello"}}'`).catch(() => {})
}

export { apiUrl, copyApiUrl }
export default AgentCard
