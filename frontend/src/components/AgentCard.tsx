import { useState } from 'react'
import { type Agent, exportAgent } from '../api/client'

const apiUrl = (id: string) => `${window.location.origin}/api/agents/${id}/run`

function copyApiUrl(id: string) {
  const url = apiUrl(id)
  navigator.clipboard.writeText(`curl -X POST "${url}" -H "Content-Type: application/json" -d '{"input":{"message":"hello"}}'`).catch(() => {})
}

interface AgentCardProps {
  agent: Agent
  onDelete: (id: string) => void
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function AgentCard({ agent, onDelete }: AgentCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    copyApiUrl(agent.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

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
          <button onClick={handleExport} style={{ padding: '6px 10px', fontSize: 13, background: '#1e2a4a', color: '#b0bec5', border: '1px solid #2a3a5c', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>导出</button>
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
      <div style={{ marginTop: 12, fontSize: 12, color: '#6a7a8a', display: 'grid', gap: 4 }}>
        <div>创建：{new Date(agent.created_at).toLocaleDateString('zh-CN')}</div>
        <div>编辑：{formatDateTime(agent.updated_at)}</div>
      </div>
    </div>
  )
}

export { apiUrl, copyApiUrl }
export default AgentCard
