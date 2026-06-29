import type { AgentNode } from '../api/client'
import NodeCard from './NodeCard'

interface EdgeDef {
  sourceIdx: number
  targetIdx: number
}

interface NodePanelProps {
  nodes: AgentNode[]
  edges: EdgeDef[]
  onNodesChange: (nodes: AgentNode[]) => void
  onEdgesChange: (edges: EdgeDef[]) => void
  onAddNode: () => void
  onEditNode: (idx: number) => void
}

function NodePanel({ nodes, edges, onNodesChange, onEdgesChange, onAddNode, onEditNode }: NodePanelProps) {
  const handleDelete = (idx: number) => {
    const newNodes = nodes.filter((_, i) => i !== idx)
    const newEdges = edges.filter((e) => e.sourceIdx !== idx && e.targetIdx !== idx)
      .map((e) => ({
        sourceIdx: e.sourceIdx > idx ? e.sourceIdx - 1 : e.sourceIdx,
        targetIdx: e.targetIdx > idx ? e.targetIdx - 1 : e.targetIdx,
      }))
    onNodesChange(newNodes)
    onEdgesChange(newEdges)
  }

  const handleAddEdge = (sourceIdx: number, targetIdx: number) => {
    if (edges.some((e) => e.sourceIdx === sourceIdx && e.targetIdx === targetIdx)) return
    onEdgesChange([...edges, { sourceIdx, targetIdx }])
  }

  const handleRemoveEdge = (sourceIdx: number, targetIdx: number) => {
    onEdgesChange(edges.filter((e) => !(e.sourceIdx === sourceIdx && e.targetIdx === targetIdx)))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>节点列表</h3>
        <button
          onClick={onAddNode}
          style={{
            padding: '6px 16px',
            fontSize: 13,
            background: '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          + 添加节点
        </button>
      </div>

      {nodes.length === 0 && (
        <div style={{ color: '#888', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
          暂无节点，点击「+ 添加节点」开始
        </div>
      )}

      {nodes.map((node, idx) => (
        <NodeCard
          key={idx}
          node={node}
          index={idx}
          nodes={nodes}
          edges={edges}
          onEdit={onEditNode}
          onDelete={handleDelete}
          onAddEdge={handleAddEdge}
          onRemoveEdge={handleRemoveEdge}
        />
      ))}
    </div>
  )
}

export default NodePanel
