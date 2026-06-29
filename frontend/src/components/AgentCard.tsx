import { useState } from 'react'
import type { Agent } from '../api/client'

const apiUrl = (id: string) => `${window.location.origin}/api/agents/${id}/run`

function copyApiUrl(id: string) {
  const url = apiUrl(id)
  navigator.clipboard.writeText(`curl -X POST "${url}" -H "Content-Type: application/json" -d '{"input":{"message":"hello"}}'`).catch(() => {})
}

interface AgentCardProps {
  agent: Agent
  onDelete: (id: string) => void
}

function AgentCard({ agent, onDelete }: AgentCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    copyApiUrl(agent.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      style={{
        border: '1px solid #2a3a5c',
        borderRadius: 8,
        padding: '16px 20px',
        background: '#1e2a4a',
        color: '#e0e0e0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{agent.name}</div>
          <div style={{ fontSize: 13, color: '#6a7a8a', marginTop: 4 }}>
            {agent.description || '暂无描述'} · {agent.nodes.length} 个节点
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
          <a href={`/agents/${agent.id}`} style={{ padding: '6px 14px', fontSize: 13, background: '#1565c0', color: '#fff', border: 'none', borderRadius: 4, textDecoration: 'none' }}>编辑</a>
          <button onClick={() => onDelete(agent.id)} style={{ padding: '6px 14px', fontSize: 13, background: '#c62828', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>删除</button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 10px', background: '#0f1a30', borderRadius: 6 }}>
        <span style={{ fontSize: 11, color: '#6a7a8a', flexShrink: 0 }}>API</span>
        <code style={{ fontSize: 12, color: '#81c784', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          POST {apiUrl(agent.id)}
        </code>
        <button
          onClick={handleCopy}
          style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #2a3a5c', borderRadius: 4, cursor: 'pointer', background: copied ? '#1b3a1e' : 'transparent', color: copied ? '#81c784' : '#6a7a8a', flexShrink: 0 }}
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
    </div>
  )
}

export { apiUrl, copyApiUrl }
export default AgentCard
