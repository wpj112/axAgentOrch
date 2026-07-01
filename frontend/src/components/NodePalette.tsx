import { NodeIcon, NODE_CONFIG } from './nodeIcons'

interface NodePaletteProps {
  onDragStart?: (event: React.DragEvent, nodeType: string) => void
}

function NodePalette({ onDragStart }: NodePaletteProps) {
  return (
    <div
      style={{
        background: '#1a1d29',
        border: '1px solid #2e3345',
        borderRadius: 8,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#60a5fa', marginBottom: 2 }}>节点类型</div>
      {Object.entries(NODE_CONFIG).map(([type, cfg]) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/reactflow-type', type)
            e.dataTransfer.effectAllowed = 'move'
            onDragStart?.(e, type)
          }}
          style={{
            padding: '4px 8px',
            borderRadius: 5,
            border: '1px solid #2e3345',
            cursor: 'grab',
            fontSize: 12,
            textAlign: 'left',
            background: '#252836',
            color: '#e0e0e0',
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            justifyContent: 'flex-start',
          }}
        >
          <NodeIcon type={type} size={14} color={cfg.color} />
          {cfg.label}
        </div>
      ))}
    </div>
  )
}

export default NodePalette
