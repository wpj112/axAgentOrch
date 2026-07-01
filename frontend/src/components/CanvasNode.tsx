import {
  Handle,
  NodeResizeControl,
  Position,
  ResizeControlVariant,
  type NodeProps,
} from 'reactflow'
import { NodeIcon, NODE_CONFIG } from './nodeIcons'

const STATUS_ICONS: Record<string, { text: string; color: string }> = {
  running: { text: '⏳', color: '#60a5fa' },
  success: { text: '✓', color: '#22c55e' },
  failed: { text: '✗', color: '#ef9a9a' },
  pending: { text: '○', color: '#8b8fa3' },
}

export interface CanvasNodeData {
  type: string
  label: string
  config: Record<string, unknown>
  status?: string | null
  childCount?: number
  parentLabel?: string | null
  loopSummary?: string | null
  loopMinWidth?: number
  loopMinHeight?: number
  activeState?: 'active' | 'muted' | null
}

function getFlowHandleStyle(color: string, position: 'top' | 'bottom'): React.CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: color,
    border: '1px solid #0f172a',
    left: '50%',
    transform: position === 'top' ? 'translate(-50%, -140%)' : 'translate(-50%, 140%)',
    [position]: 0,
    zIndex: 3,
  }
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
  const isEmptyLoop = isLoop && !data.childCount
  const flowHandleColor = isActive ? '#ffd54f' : si?.color || '#2e3345'

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: isLoop ? '10px 12px 14px' : '6px 10px',
        borderRadius: isLoop ? 18 : 10,
        border: `2px solid ${flowHandleColor}`,
        background: isLoop ? 'linear-gradient(180deg, #14303d 0%, #102231 100%)' : '#1a1d29',
        minWidth: isLoop ? 160 : 70,
        minHeight: isLoop ? 120 : undefined,
        boxShadow: isActive ? '0 0 0 2px rgba(255,213,79,0.2), 0 10px 24px rgba(0,0,0,0.45)' : '0 2px 6px rgba(0,0,0,0.4)',
        fontSize: 13,
        color: '#e0e0e0',
        transition: 'border-color 0.3s, opacity 0.2s, box-shadow 0.2s',
        overflow: 'visible',
        opacity: isMuted ? 0.42 : 1,
      }}
    >
      {isLoop && (
        <NodeResizeControl
          position="bottom-right"
          variant={ResizeControlVariant.Handle}
          minWidth={data.loopMinWidth || 160}
          minHeight={data.loopMinHeight || 120}
          style={{
            width: 16,
            height: 16,
            right: 4,
            bottom: 4,
            borderRadius: 4,
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M4 10L10 4" stroke={isActive ? '#ffe082' : '#8fc4dc'} strokeWidth="1.3" strokeLinecap="round" />
            <path d="M7 10L10 7" stroke={isActive ? '#ffe082' : '#8fc4dc'} strokeWidth="1.3" strokeLinecap="round" />
            <path d="M9.5 10L10 9.5" stroke={isActive ? '#ffe082' : '#8fc4dc'} strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </NodeResizeControl>
      )}

      <Handle type="target" position={Position.Top} style={getFlowHandleStyle(flowHandleColor, 'top')} />

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
        <div style={{ marginTop: 6, fontSize: 10, color: '#b7d7e5', lineHeight: 1.5 }}>
          <div>{data.loopSummary || '循环容器'}</div>
          {isEmptyLoop ? (
            <div style={{ marginTop: 4, color: isActive ? '#ffe082' : '#8fc4dc' }}>
              拖入节点到容器内，或拖右下角手柄调整大小
            </div>
          ) : null}
        </div>
      ) : data.parentLabel ? (
        <div style={{ marginTop: 8, fontSize: 11, color: isActive ? '#ffe082' : '#60a5fa' }}>
          属于循环体: {data.parentLabel}
        </div>
      ) : null}

      <Handle type="source" position={Position.Bottom} style={getFlowHandleStyle(flowHandleColor, 'bottom')} />
    </div>
  )
}

export default CanvasNode
