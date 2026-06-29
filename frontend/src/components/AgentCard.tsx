import type { Agent } from '../api/client'

interface AgentCardProps {
  agent: Agent
  onDelete: (id: string) => void
}

function AgentCard({ agent, onDelete }: AgentCardProps) {
  return (
    <div
      style={{
        border: '1px solid #2a3a5c',
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#1e2a4a',
        color: '#e0e0e0',
      }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{agent.name}</div>
        <div style={{ fontSize: 13, color: '#6a7a8a', marginTop: 4 }}>
          {agent.description || '暂无描述'} · {agent.nodes.length} 个节点
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <a
          href={`/agents/${agent.id}`}
          style={{
            padding: '6px 14px',
            fontSize: 13,
            background: '#1565c0',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            textDecoration: 'none',
          }}
        >
          编辑
        </a>
        <button
          onClick={() => onDelete(agent.id)}
          style={{
            padding: '6px 14px',
            fontSize: 13,
            background: '#c62828',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          删除
        </button>
      </div>
    </div>
  )
}

export default AgentCard
