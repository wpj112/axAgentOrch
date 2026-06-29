import { useCallback, useRef, useEffect } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  ReactFlowProvider, useReactFlow,
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

function FlowCanvasInner({
  nodes, edges, onNodesChange, onEdgesChange, onDoubleClickNode,
}: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()
  const initializedRef = useRef(false)
  const syncLockRef = useRef(false)

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState([])
  const [rfEdges, setRfEdges, onRfEdgesChange] = useEdgesState([])

  const rfNodesRef = useRef(rfNodes)
  const rfEdgesRef = useRef(rfEdges)
  useEffect(() => { rfNodesRef.current = rfNodes; rfEdgesRef.current = rfEdges }, [rfNodes, rfEdges])

  const syncToParent = useCallback((nextRfNodes: Node[], nextRfEdges: Edge[]) => {
    const idxMap = new Map(nextRfNodes.map((n, i) => [n.id, i]))
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
    syncLockRef.current = true
    onNodesChange(agentNodes)
    onEdgesChange(agentEdges)
  }, [onNodesChange, onEdgesChange])

  // Initialize from props once
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      setRfNodes(nodes.map((n, i) => toRFNode(n, i)))
      setRfEdges(edges.map(e => toRFEdge(e, nodes)))
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from parent only when the node ID order changes (new agent loaded)
  const nodeIdKey = nodes.map(n => n.id).join(',')
  const prevIdKeyRef = useRef(nodeIdKey)
  useEffect(() => {
    if (prevIdKeyRef.current !== nodeIdKey) {
      prevIdKeyRef.current = nodeIdKey
      if (syncLockRef.current) {
        syncLockRef.current = false
        return
      }
      if (nodes.length > 0) {
        setRfNodes(nodes.map((n, i) => toRFNode(n, i)))
        setRfEdges(edges.map(e => toRFEdge(e, nodes)))
      }
    }
  })  // intentionally runs every render

  const onConnect = useCallback((params: Connection) => {
    setRfEdges(eds => {
      const next = addEdge({
        ...params, style: {}, data: { condition: null },
      }, eds)
      syncToParent(rfNodesRef.current, next)
      return next
    })
  }, [setRfEdges, syncToParent])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const nodeType = event.dataTransfer.getData('application/reactflow-type')
    if (!nodeType) return

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })

    const newId = `node_${Date.now()}`
    const newNode: Node = {
      id: newId,
      type: 'custom',
      position,
      data: { type: nodeType, label: `新${nodeType}节点`, config: {} },
    }

    setRfNodes(nds => {
      const next = [...nds, newNode]
      syncToParent(next, rfEdgesRef.current)
      return next
    })
  }, [screenToFlowPosition, setRfNodes, syncToParent])

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const idx = rfNodesRef.current.findIndex(n => n.id === node.id)
    if (idx >= 0) onDoubleClickNode(idx)
  }, [onDoubleClickNode])

  const handleNodesChange: OnNodesChange = useCallback(changes => {
    onRfNodesChange(changes)
    setRfNodes(nds => {
      syncToParent(nds, rfEdgesRef.current)
      return nds
    })
  }, [onRfNodesChange, setRfNodes, syncToParent])

  const handleEdgesChange: OnEdgesChange = useCallback(changes => {
    onRfEdgesChange(changes)
    setRfEdges(eds => {
      syncToParent(rfNodesRef.current, eds)
      return eds
    })
  }, [onRfEdgesChange, setRfEdges, syncToParent])

  const handleAutoLayout = () => {
    const laidOut = autoLayout(rfNodesRef.current, rfEdgesRef.current)
    setRfNodes(laidOut)
    syncToParent(laidOut, rfEdgesRef.current)
  }

  return (
    <div ref={reactFlowWrapper} style={{ width: '100%', height: 'calc(100vh - 110px)', border: '1px solid #2a3a5c', borderRadius: 8, position: 'relative', background: '#1a1a2e' }}>
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
        <Background color="#2a3a5c" gap={20} />
        <Controls style={{ background: '#1e2a4a', border: '1px solid #2a3a5c' }} />
        <MiniMap nodeColor={(n) => {
          const colorMap: Record<string, string> = {
            start: '#4caf50', llm: '#9c27b0', http: '#2196f3',
            db: '#ff9800', code: '#795548', end: '#f44336',
          }
          return colorMap[n.data?.type] || '#999'
        }} style={{ background: '#1e2a4a' }} />
      </ReactFlow>

      <NodePalette />

      <button
        onClick={handleAutoLayout}
        style={{
          position: 'absolute', bottom: 10, right: 10, zIndex: 10,
          padding: '6px 14px', fontSize: 12, border: '1px solid #2a3a5c',
          borderRadius: 6, background: '#1e2a4a', cursor: 'pointer', color: '#e0e0e0',
        }}
      >
        自动布局
      </button>
    </div>
  )
}

function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

export default FlowCanvas
