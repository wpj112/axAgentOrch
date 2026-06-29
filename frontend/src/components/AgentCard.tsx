import type { Agent } from '../api/client'

interface AgentCardProps {
  agent: Agent
  onDelete: (id: string) => void
}

function AgentCard({ agent, onDelete }: AgentCardProps) {
  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fff',
      }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{agent.name}</div>
        <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          {agent.description || '暂无描述'} · {agent.nodes.length} 个节点
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <a
          href={`/agents/${agent.id}`}
          style={{
            padding: '6px 14px',
            fontSize: 13,
            background: '#1976d2',
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
            background: '#d32f2f',
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
