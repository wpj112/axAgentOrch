import type { AgentNode } from '../api/client'
import { NodeIcon, NODE_CONFIG } from './nodeIcons'

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
  const cfg = NODE_CONFIG[node.type] || { label: node.type, color: '#ccc' }
  const connectedTo = edges.filter((e) => e.sourceIdx === index).map((e) => e.targetIdx)

  const addConnection = () => {
    const target = window.prompt(
      `为「${node.label}」选择目标节点 (0-${nodes.length - 1}):\n${nodes.map((n, i) => `${i}: ${n.label} (${NODE_CONFIG[n.type]?.label || n.type})`).join('\n')}`
    )
    if (target === null) return
    const targetIdx = parseInt(target, 10)
    if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= nodes.length || targetIdx === index) return
    onAddEdge(index, targetIdx)
  }

  return (
    <div
      style={{
        border: '2px solid var(--border)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 8,
        background: 'var(--bg-card)',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: cfg.color,
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 11,
              marginRight: 8,
            }}
          >
            <NodeIcon type={node.type} size={11} color="#fff" />
            {cfg.label}
          </span>
          <strong>{node.label}</strong>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => onEdit(index)}
            style={{ padding: '2px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-elevated)' }}
          >
            编辑
          </button>
          <button
            onClick={() => addConnection()}
            style={{ padding: '2px 10px', fontSize: 12, border: '1px solid var(--color-primary)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-selected)', color: 'var(--color-primary)' }}
          >
            → 连线
          </button>
          <button
            onClick={() => onDelete(index)}
            style={{ padding: '2px 10px', fontSize: 12, border: '1px solid var(--color-danger)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-danger)', color: 'var(--color-danger)' }}
          >
            删除
          </button>
        </div>
      </div>
      {connectedTo.length > 0 && (
        <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 12 }}>
          → {connectedTo.map((ti) => nodes[ti]?.label).join(', ')}
        </div>
      )}
    </div>
  )
}

export default NodeCard
