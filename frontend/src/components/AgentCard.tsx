import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { type Agent, exportAgent } from '../api/client'

export interface CopyCardInfo {
  agent: Agent
  defaultName: string
}

interface AgentCardProps {
  agent: Agent
  onDelete: (id: string) => void
  onRefresh?: () => void
  onCopyCard?: (info: CopyCardInfo) => void
}

function AgentCard({ agent, onDelete, onRefresh, onCopyCard }: AgentCardProps) {
  const navigate = useNavigate()
  const [hover, setHover] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleExport = async () => {
    setMenuOpen(false)
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
    setMenuOpen(false)
    const ok = await copyApiUrl(agent.id)
    if (!ok) {
      alert('复制失败，请检查浏览器剪贴板权限')
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const openCopyCard = () => {
    setMenuOpen(false)
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const suffix = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    onCopyCard?.({ agent, defaultName: `${agent.name}_${suffix}` })
  }

  const handleDelete = () => {
    setMenuOpen(false)
    onDelete(agent.id)
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
    <>
      <div
        onDoubleClick={() => navigate(`/agents/${agent.id}`)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'relative',
          zIndex: menuOpen ? 30 : hover ? 1 : 0,
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '16px 18px',
          paddingTop: 19,
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          transition: 'box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease',
          boxShadow: hover
            ? '0 8px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(59,130,246,0.08)'
            : '0 2px 6px rgba(0,0,0,0.12)',
          transform: hover ? 'translateY(-1px)' : 'none',
          borderColor: hover ? 'var(--color-primary)' : 'var(--border)',
          cursor: 'default',
          overflow: 'visible',
        }}
      >
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, var(--color-primary), var(--color-primary-light))',
          opacity: hover ? 1 : 0.7,
          transition: 'opacity 0.25s ease',
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {agent.description || '暂无描述'}
            </div>
          </div>

          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0, marginLeft: 12 }}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                width: 28, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: menuOpen ? 'var(--bg-elevated)' : (hover ? 'var(--bg-elevated)' : 'transparent'),
                color: 'var(--text-muted)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="8" cy="13" r="1.5" />
              </svg>
            </button>

            {menuOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
                minWidth: 150, borderRadius: 8, padding: '4px 0',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              }}>
                <MenuItem icon="⬇" label="导出" onClick={handleExport} />
                <MenuItem icon={<CopySvg />} label="复制 API" onClick={handleCopyApi} />
                <MenuItem icon={<DuplicateSvg />} label="复制卡片" onClick={openCopyCard} />
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
                <div
                  onClick={handleDelete}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 14px', fontSize: 13, cursor: 'pointer',
                    color: 'var(--color-danger)',
                  }}
                >
                  ✕ 删除
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: 'var(--color-primary)',
            }} />
            {agent.nodes.length} 个节点
          </span>
          {agent.llm_model && (
            <span style={{
              fontFamily: 'ui-monospace, monospace', fontSize: 10,
              padding: '1px 6px', borderRadius: 4,
              background: 'var(--bg-elevated)',
            }}>
              {agent.llm_model}
            </span>
          )}
          <span style={{ marginLeft: 'auto' }}>{timeAgo(agent.updated_at)}</span>
        </div>

        {copied && (
          <div style={{
            position: 'absolute', top: '50%', right: 48, transform: 'translateY(-50%)',
            padding: '3px 8px', borderRadius: 999, background: 'var(--bg-success)', border: '1px solid var(--border-success)',
            color: 'var(--color-success)', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
          }}>已复制</div>
        )}
      </div>

    </>
  )
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', fontSize: 13, cursor: 'pointer',
        color: 'var(--text-primary)',
      }}
    >
      <span style={{ fontSize: 14, width: 16, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      {label}
    </div>
  )
}

function CopySvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M7.5 5.5l.7-.7a2 2 0 0 1 2.8 0l1.4 1.4a2 2 0 0 1 0 2.8l-1.4 1.4" />
      <path d="M8.5 10.5l-.7.7a2 2 0 0 1-2.8 0l-1.4-1.4a2 2 0 0 1 0-2.8l1.4-1.4" />
    </svg>
  )
}

function DuplicateSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="5.5" y="3.5" width="7" height="9" rx="1.5" />
      <path d="M3.5 12V5.8a2.3 2.3 0 0 1 2.3-2.3H10" />
    </svg>
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
