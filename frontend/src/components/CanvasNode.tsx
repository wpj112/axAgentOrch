import { Handle, Position, type NodeProps } from 'reactflow'

const TYPE_LABELS: Record<string, string> = {
  start: '开始', llm: 'LLM', http: 'HTTP',
  db: '数据库', code: '代码', end: '结束',
}

const TYPE_COLORS: Record<string, string> = {
  start: '#4caf50', llm: '#9c27b0', http: '#2196f3',
  db: '#ff9800', code: '#795548', end: '#f44336',
}

export interface CanvasNodeData {
  type: string
  label: string
  config: Record<string, unknown>
}

function CanvasNode({ data }: NodeProps<CanvasNodeData>) {
  const nodeType = data.type || 'start'
  const color = TYPE_COLORS[nodeType] || '#999'

  return (
    <div
      style={{
        padding: '10px 16px',
        borderRadius: 10,
        border: `2px solid ${color}`,
        background: '#1e2a4a',
        minWidth: 120,
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        fontSize: 13,
        color: '#e0e0e0',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-block',
            background: color,
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {TYPE_LABELS[nodeType] || nodeType}
        </span>
        <span style={{ fontWeight: 600 }}>{data.label}</span>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  )
}

export default CanvasNode
