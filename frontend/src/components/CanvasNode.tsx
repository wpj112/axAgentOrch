import { Handle, Position, type NodeProps } from 'reactflow'
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
      style={{
        padding: isLoop ? '14px 16px 18px' : '10px 16px',
        borderRadius: isLoop ? 18 : 10,
        border: `2px solid ${isActive ? '#ffd54f' : si?.color || '#2a3a5c'}`,
        background: isLoop ? 'linear-gradient(180deg, #14303d 0%, #102231 100%)' : '#1e2a4a',
        minWidth: isLoop ? 280 : 120,
        minHeight: isLoop ? 180 : undefined,
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
        <div style={{ marginTop: 10, fontSize: 12, color: '#b7d7e5', lineHeight: 1.7 }}>
          <div>{data.loopSummary || '循环容器'}</div>
          <div>循环体节点: {data.childCount || 0}</div>
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, border: `1px dashed ${isActive ? 'rgba(255,213,79,0.55)' : 'rgba(144,202,249,0.35)'}`, color: isActive ? '#ffe082' : '#7fa8bb', background: 'rgba(7,18,28,0.28)' }}>
            把节点拖进这里，或在右侧把节点加入此循环体。
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
