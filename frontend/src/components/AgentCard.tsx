import { type Agent, exportAgent } from '../api/client'

interface AgentCardProps {
  agent: Agent
  onDelete: (id: string) => void
}

function AgentCard({ agent, onDelete }: AgentCardProps) {
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

  return (
    <div style={{
      border: '1px solid #2e3345',
      borderRadius: 8,
      padding: '14px 16px',
      background: '#1a1d29',
      color: '#e0e0e0',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{agent.name}</div>
        <span style={{ fontSize: 11, color: '#8b8fa3', flexShrink: 0, marginLeft: 8 }}>· {agent.nodes.length}</span>
      </div>
      <div style={{ fontSize: 13, color: '#8b8fa3', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {agent.description || '暂无描述'}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
        <button onClick={handleExport} title="导出" style={{ padding: '4px 8px', fontSize: 13, background: '#1a1d29', color: '#8b8fa3', border: '1px solid #2e3345', borderRadius: 4, cursor: 'pointer', lineHeight: 1 }}>⬇</button>
        <a href={`/agents/${agent.id}`} style={{ padding: '4px 12px', fontSize: 13, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, textDecoration: 'none', lineHeight: '20px' }}>编辑</a>
        <button onClick={() => onDelete(agent.id)} style={{ padding: '4px 12px', fontSize: 13, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', lineHeight: '20px' }}>删除</button>
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
