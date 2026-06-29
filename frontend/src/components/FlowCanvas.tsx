import { useCallback, useRef } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Connection, type Node, type Edge,
  type OnNodesChange, type OnEdgesChange,
} from 'reactflow'
import dagre from 'dagre'
import type { AgentNode } from '../api/client'
import CanvasNode from './CanvasNode'
import NodePalette from './NodePalette'

const nodeTypes = { custom: CanvasNode }

interface EdgeDef {
  sourceIdx: number
  targetIdx: number
  condition?: string | null
}

interface FlowCanvasProps {
  nodes: AgentNode[]
  edges: EdgeDef[]
  onNodesChange: (nodes: AgentNode[]) => void
  onEdgesChange: (edges: EdgeDef[]) => void
  onDoubleClickNode: (idx: number) => void
}

function toRFNode(n: AgentNode, idx: number): Node {
  return {
    id: n.id || String(idx),
    type: 'custom',
    position: { x: n.position_x || 0, y: n.position_y || idx * 120 },
    data: { type: n.type, label: n.label, config: n.config },
  }
}

function toRFEdge(e: EdgeDef, nodes: AgentNode[]): Edge {
  return {
    id: `${e.sourceIdx}-${e.targetIdx}`,
    source: nodes[e.sourceIdx]?.id || String(e.sourceIdx),
    target: nodes[e.targetIdx]?.id || String(e.targetIdx),
    label: e.condition || undefined,
    style: e.condition ? { strokeDasharray: '5 5' } : {},
    data: { condition: e.condition || null },
  }
}

function autoLayout(rfNodes: Node[], rfEdges: Edge[]) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100 })
  rfNodes.forEach(n => g.setNode(n.id, { width: 150, height: 60 }))
  rfEdges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return rfNodes.map(n => {
    const { x, y } = g.node(n.id)
    return { ...n, position: { x, y } }
  })
}

function FlowCanvas({
  nodes, edges, onNodesChange, onEdgesChange, onDoubleClickNode,
}: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState(
    nodes.map((n, i) => toRFNode(n, i))
  )
  const [rfEdges, setRfEdges, onRfEdgesChange] = useEdgesState(
    edges.map(e => toRFEdge(e, nodes))
  )

  const syncToParent = useCallback((nextRfNodes: Node[], nextRfEdges: Edge[]) => {
    const idxMap = new Map(nodes.map((n, i) => [n.id || String(i), i]))
    const agentNodes: AgentNode[] = nextRfNodes.map(n => ({
      id: n.id,
      type: (n.data?.type as AgentNode['type']) || 'start',
      label: n.data?.label || '',
      config: n.data?.config || {},
      position_x: n.position.x,
      position_y: n.position.y,
    }))
    const agentEdges: EdgeDef[] = nextRfEdges.map(e => ({
      sourceIdx: idxMap.get(e.source) ?? 0,
      targetIdx: idxMap.get(e.target) ?? 0,
      condition: e.data?.condition || null,
    }))
    onNodesChange(agentNodes)
    onEdgesChange(agentEdges)
  }, [nodes, onNodesChange, onEdgesChange])

  const onConnect = useCallback((params: Connection) => {
    setRfEdges(eds => {
      const next = addEdge({
        ...params, style: {}, data: { condition: null },
      }, eds)
      syncToParent(rfNodes, next)
      return next
    })
  }, [rfNodes, setRfEdges, syncToParent])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const nodeType = event.dataTransfer.getData('application/reactflow-type')
    if (!nodeType || !reactFlowWrapper.current) return

    const rect = reactFlowWrapper.current.getBoundingClientRect()
    const position = { x: event.clientX - rect.left - 75, y: event.clientY - rect.top - 30 }

    const newId = `node_${Date.now()}`
    const newNode: Node = {
      id: newId,
      type: 'custom',
      position,
      data: { type: nodeType, label: `新${nodeType}节点`, config: {} },
    }

    setRfNodes(nds => {
      const next = [...nds, newNode]
      syncToParent(next, rfEdges)
      return next
    })
  }, [rfEdges, setRfNodes, syncToParent])

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const idx = nodes.findIndex(n => (n.id || '') === node.id)
    if (idx >= 0) onDoubleClickNode(idx)
  }, [nodes, onDoubleClickNode])

  const handleNodesChange: OnNodesChange = useCallback(changes => {
    onRfNodesChange(changes)
    setRfNodes(nds => {
      syncToParent(nds, rfEdges)
      return nds
    })
  }, [rfEdges, onRfNodesChange, setRfNodes, syncToParent])

  const handleEdgesChange: OnEdgesChange = useCallback(changes => {
    onRfEdgesChange(changes)
    setRfEdges(eds => {
      syncToParent(rfNodes, eds)
      return eds
    })
  }, [rfNodes, onRfEdgesChange, setRfEdges, syncToParent])

  const handleAutoLayout = () => {
    const laidOut = autoLayout(rfNodes, rfEdges)
    setRfNodes(laidOut)
    syncToParent(laidOut, rfEdges)
  }

  return (
    <div ref={reactFlowWrapper} style={{ width: '100%', height: 400, border: '1px solid #e0e0e0', borderRadius: 8, position: 'relative' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background color="#f0f0f0" gap={20} />
        <Controls />
        <MiniMap nodeColor={(n) => {
          const colorMap: Record<string, string> = {
            start: '#4caf50', llm: '#9c27b0', http: '#2196f3',
            db: '#ff9800', code: '#795548', end: '#f44336',
          }
          return colorMap[n.data?.type] || '#999'
        }} />
      </ReactFlow>

      <NodePalette />

      <button
        onClick={handleAutoLayout}
        style={{
          position: 'absolute', bottom: 10, right: 10, zIndex: 10,
          padding: '6px 14px', fontSize: 12, border: '1px solid #ccc',
          borderRadius: 6, background: '#fff', cursor: 'pointer',
        }}
      >
        自动布局
      </button>
    </div>
  )
}

export default FlowCanvas
