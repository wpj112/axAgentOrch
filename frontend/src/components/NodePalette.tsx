const NODE_TYPES = [
  { type: 'start', label: '开始' },
  { type: 'llm', label: 'LLM' },
  { type: 'http', label: 'HTTP' },
  { type: 'db', label: '数据库' },
  { type: 'code', label: '代码' },
  { type: 'end', label: '结束' },
]

const TYPE_COLORS: Record<string, string> = {
  start: '#4caf50', llm: '#9c27b0', http: '#2196f3',
  db: '#ff9800', code: '#795548', end: '#f44336',
}

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
        background: '#fff',
        borderRadius: 8,
        padding: '8px 10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 100,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 2 }}>节点类型</div>
      {NODE_TYPES.map(({ type, label }) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/reactflow-type', type)
            e.dataTransfer.effectAllowed = 'move'
            onDragStart?.(e, type)
          }}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: `1px solid ${TYPE_COLORS[type] || '#ccc'}`,
            cursor: 'grab',
            fontSize: 13,
            textAlign: 'center',
            background: '#fafafa',
            userSelect: 'none',
          }}
        >
          {label}
        </div>
      ))}
    </div>
  )
}

export default NodePalette
