import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { type Agent, exportAgent } from '../api/client'

interface AgentCardProps {
  agent: Agent
  onDelete: (id: string) => void
}

const iconButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  transition: 'all 0.15s',
}

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 8.2l2.5 2.5 6-6" />
      </svg>
    )
  }

  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="8" height="10" rx="1.8" />
      <path d="M3 11V5.8C3 4.8 3.8 4 4.8 4H10" />
    </svg>
  )
}

function AgentCard({ agent, onDelete }: AgentCardProps) {
  const navigate = useNavigate()
  const [hover, setHover] = useState(false)
  const [delHover, setDelHover] = useState(false)
  const [copied, setCopied] = useState(false)

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

  const handleCopyApi = async () => {
    const ok = await copyApiUrl(agent.id)
    if (!ok) {
      alert('复制失败，请检查浏览器剪贴板权限')
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const timeAgo = (value: string) => {
    const timestamp = new Date(value).getTime()
    if (Number.isNaN(timestamp)) return value

    const diff = Math.max(0, Date.now() - timestamp)
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`

    const days = Math.floor(diff / 86400000)
    if (days <= 30) return `${days} 天前`

    return new Date(timestamp).toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
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
          <div style={{ position: 'relative' }}>
            <button onClick={handleCopyApi} title={copied ? "已复制 API 调用命令" : "复制 API 调用命令"} aria-label={copied ? "已复制 API 调用命令" : "复制 API 调用命令"} style={{
              ...iconButtonStyle,
              background: copied ? '#16301d' : hover ? '#252836' : 'transparent', color: copied ? '#22c55e' : '#8b8fa3',
              boxShadow: copied ? '0 0 0 1px rgba(34,197,94,0.28)' : 'none',
              transform: copied ? 'scale(1.05)' : 'none',
            }}><CopyIcon copied={copied} /></button>
            {copied && (
              <div style={{
                position: 'absolute', top: '50%', right: 'calc(100% + 8px)', transform: 'translateY(-50%)',
                padding: '3px 8px', borderRadius: 999, background: '#16301d', border: '1px solid rgba(34,197,94,0.35)',
                color: '#86efac', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none',
                boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
              }}>已复制</div>
            )}
          </div>
          <button onClick={handleExport} title="导出" style={{
            ...iconButtonStyle,
            background: hover ? '#252836' : 'transparent', color: '#8b8fa3',
          }}>⬇</button>
          <a href={`/agents/${agent.id}`} title="编辑" style={{
            ...iconButtonStyle,
            background: hover ? '#252836' : 'transparent', color: hover ? '#60a5fa' : '#8b8fa3', textDecoration: 'none',
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
              ...iconButtonStyle,
              background: delHover ? 'rgba(239,68,68,0.12)' : 'transparent',
              color: delHover ? '#ef4444' : '#8b8fa3',
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

function buildApiCommand(id: string) {
  return `curl -X POST "${apiUrl(id)}" -H "Content-Type: application/json" -d '{"input":{"message":"hello"}}'`
}

function fallbackCopyText(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }

  document.body.removeChild(textarea)
  return ok
}

async function copyApiUrl(id: string) {
  const text = buildApiCommand(id)

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return fallbackCopyText(text)
    }
  }

  return fallbackCopyText(text)
}

export { apiUrl, copyApiUrl }
export default AgentCard
