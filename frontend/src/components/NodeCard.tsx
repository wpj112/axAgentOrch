import type { AgentNode } from '../api/client'

const TYPE_LABELS: Record<string, string> = {
  start: '开始',
  llm: 'LLM',
  http: 'HTTP',
  db: '数据库',
  code: '代码',
  end: '结束',
}

const TYPE_COLORS: Record<string, string> = {
  start: '#4caf50',
  llm: '#9c27b0',
  http: '#2196f3',
  db: '#ff9800',
  code: '#795548',
  end: '#f44336',
}

interface NodeCardProps {
  node: AgentNode
  index: number
  nodes: AgentNode[]
  edges: { sourceIdx: number; targetIdx: number }[]
  onEdit: (idx: number) => void
  onDelete: (idx: number) => void
  onAddEdge: (sourceIdx: number, targetIdx: number) => void
  onRemoveEdge: (sourceIdx: number, targetIdx: number) => void
}

function NodeCard({ node, index, nodes, edges, onEdit, onDelete, onAddEdge, onRemoveEdge }: NodeCardProps) {
  const connectedTo = edges.filter((e) => e.sourceIdx === index).map((e) => e.targetIdx)

  const addConnection = () => {
    const target = window.prompt(
      `为「${node.label}」选择目标节点 (0-${nodes.length - 1}):\n${nodes.map((n, i) => `${i}: ${n.label} (${TYPE_LABELS[n.type] || n.type})`).join('\n')}`
    )
    if (target === null) return
    const targetIdx = parseInt(target, 10)
    if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= nodes.length || targetIdx === index) return
    onAddEdge(index, targetIdx)
  }

  return (
    <div
      style={{
        border: `2px solid ${TYPE_COLORS[node.type] || '#ccc'}`,
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 8,
        background: '#fafafa',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span
            style={{
              display: 'inline-block',
              background: TYPE_COLORS[node.type] || '#ccc',
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 11,
              marginRight: 8,
            }}
          >
            {TYPE_LABELS[node.type] || node.type}
          </span>
          <strong>{node.label}</strong>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => onEdit(index)}
            style={{ padding: '2px 10px', fontSize: 12, border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff' }}
          >
            编辑
          </button>
          <button
            onClick={() => addConnection()}
            style={{ padding: '2px 10px', fontSize: 12, border: '1px solid #1976d2', borderRadius: 4, cursor: 'pointer', background: '#e3f2fd', color: '#1976d2' }}
          >
            → 连线
          </button>
          <button
            onClick={() => onDelete(index)}
            style={{ padding: '2px 10px', fontSize: 12, border: '1px solid #d32f2f', borderRadius: 4, cursor: 'pointer', background: '#ffebee', color: '#d32f2f' }}
          >
            删除
          </button>
        </div>
      </div>
      {connectedTo.length > 0 && (
        <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>
          → {connectedTo.map((ti) => nodes[ti]?.label).join(', ')}
        </div>
      )}
    </div>
  )
}

export default NodeCard
