import { NodeIcon, NODE_CONFIG } from './nodeIcons'

interface NodePaletteProps {
  onDragStart?: (event: React.DragEvent, nodeType: string) => void
}

function NodePalette({ onDragStart }: NodePaletteProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 10,
        background: '#1e2a4a',
        borderRadius: 8,
        padding: '6px 8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 72,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#90caf9', marginBottom: 2 }}>节点类型</div>
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
            border: '1px solid #2a3a5c',
            cursor: 'grab',
            fontSize: 12,
            textAlign: 'left',
            background: '#0f1a30',
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
