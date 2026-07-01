import { useState } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from 'reactflow'
import { NodeIcon, NODE_CONFIG } from './nodeIcons'

const STATUS_ICONS: Record<string, { text: string; color: string }> = {
  running: { text: '⏳', color: '#90caf9' },
  success: { text: '✓', color: '#81c784' },
  failed: { text: '✗', color: '#ef9a9a' },
  pending: { text: '○', color: '#6a7a8a' },
}

export interface CanvasNodeData {
  type: string
  label: string
  config: Record<string, unknown>
  status?: string | null
  childCount?: number
  parentLabel?: string | null
  loopSummary?: string | null
  activeState?: 'active' | 'muted' | null
}

function CanvasNode({ data }: NodeProps<CanvasNodeData>) {
  const [resizing, setResizing] = useState(false)
  const [hover, setHover] = useState(false)
  const nodeType = data.type || 'start'
  const cfg = NODE_CONFIG[nodeType] || { label: nodeType, color: '#999' }
  const color = cfg.color
  const status = data.status
  const si = status ? STATUS_ICONS[status] : null
  const isLoop = nodeType === 'loop'
  const isActive = data.activeState === 'active'
  const isMuted = data.activeState === 'muted'

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: isLoop ? '10px 12px 14px' : '6px 10px',
        borderRadius: isLoop ? 18 : 10,
        border: `2px solid ${isActive ? '#ffd54f' : si?.color || '#2a3a5c'}`,
        background: isLoop ? 'linear-gradient(180deg, #14303d 0%, #102231 100%)' : '#1e2a4a',
        minWidth: isLoop ? 160 : 70,
        minHeight: isLoop ? 120 : undefined,
        boxShadow: isActive ? '0 0 0 2px rgba(255,213,79,0.2), 0 10px 24px rgba(0,0,0,0.45)' : '0 2px 6px rgba(0,0,0,0.4)',
        fontSize: 13,
        color: '#e0e0e0',
        transition: 'border-color 0.3s, opacity 0.2s, box-shadow 0.2s',
        overflow: 'hidden',
        opacity: isMuted ? 0.42 : 1,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: isActive ? '#ffd54f' : si?.color || '#2a3a5c' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {si && (
          <span style={{
            fontSize: 14, fontWeight: 700, color: si.color,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 18,
          }}>
            {si.text}
          </span>
        )}
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: isActive ? '#ffd54f' : color,
            color: isActive ? '#0f172a' : '#fff',
            width: 22, height: 22,
            borderRadius: 6,
          }}
        >
          <NodeIcon type={nodeType} size={13} color="#fff" />
        </span>
        <span style={{ fontWeight: 600 }}>{data.label}</span>
      </div>

      {isLoop ? (
        <div style={{ position: 'relative', marginTop: 6 }}>
          <div style={{ fontSize: 10, color: '#b7d7e5', lineHeight: 1.5 }}>
            <div>{data.loopSummary || '循环容器'}</div>
            <div>{!data.childCount ? '暂无节点 — 拖入节点或从右侧加入循环体' : null}</div>
          </div>
          {resizing && <NodeResizer minWidth={160} minHeight={120} onResizeEnd={() => setResizing(false)} />}
          <div
            onClick={() => setResizing((v) => !v)}
            style={{
              position: 'absolute', bottom: 2, right: 2,
              width: 14, height: 14, borderRadius: 2,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: resizing ? '1px solid #6a7a8a' : '1px solid transparent',
              color: '#6a7a8a',
              opacity: resizing || hover ? 0.6 : 0,
              transition: 'opacity 0.15s',
            }}
            title="调整大小"
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <line x1="4" y1="9.5" x2="9.5" y2="9.5" />
              <line x1="4" y1="6" x2="9.5" y2="6" />
            </svg>
          </div>
        </div>
      ) : data.parentLabel ? (
        <div style={{ marginTop: 8, fontSize: 11, color: isActive ? '#ffe082' : '#90caf9' }}>
          属于循环体: {data.parentLabel}
        </div>
      ) : null}

      <Handle type="source" position={Position.Bottom} style={{ background: isActive ? '#ffd54f' : si?.color || '#2a3a5c' }} />
    </div>
  )
}

export default CanvasNode
