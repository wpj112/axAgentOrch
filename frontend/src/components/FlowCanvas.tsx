import { useCallback, useEffect, useMemo, useRef } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
} from 'reactflow'
import dagre from 'dagre'
import type { AgentNode } from '../api/client'
import CanvasNode from './CanvasNode'
import NodePalette from './NodePalette'

const nodeTypes = { custom: CanvasNode }
const LOOP_DEFAULT_WIDTH = 340
const LOOP_DEFAULT_HEIGHT = 220
const LOOP_INSET_X = 28
const LOOP_INSET_TOP = 94
const LOOP_INSET_BOTTOM = 26

type LoopBounds = {
  x: number
  y: number
  width: number
  height: number
  minWidth: number
  minHeight: number
}

interface EdgeDef {
  sourceIdx: number
  targetIdx: number
  sourceHandle?: string | null
  condition?: string | null
}

interface FlowCanvasProps {
  nodes: AgentNode[]
  edges: EdgeDef[]
  executionSteps?: { node_id: string; status: string }[] | null
  selectedNodeId?: string | null
  onNodesChange: (nodes: AgentNode[]) => void
  onEdgesChange: (edges: EdgeDef[]) => void
  onDoubleClickNode: (idx: number) => void
}

function summarizeLoopConfig(config: Record<string, unknown>) {
  const maxIterations = Number(config.max_iterations || 5)
  const hasCondition = Boolean(config.condition && Object.keys(config.condition as Record<string, unknown>).length > 0)
  return hasCondition ? `最多 ${maxIterations} 轮，按条件退出` : `固定循环，最多 ${maxIterations} 轮`
}

function readLoopDimension(config: Record<string, unknown>, key: 'loop_width' | 'loop_height') {
  const value = Number(config[key])
  return Number.isFinite(value) && value > 0 ? value : 0
}

function computeLoopBounds(loopNode: AgentNode, childNodes: AgentNode[]): LoopBounds {
  const configuredWidth = readLoopDimension(loopNode.config || {}, 'loop_width')
  const configuredHeight = readLoopDimension(loopNode.config || {}, 'loop_height')

  if (!childNodes.length) {
    return {
      x: loopNode.position_x || 0,
      y: loopNode.position_y || 0,
      width: Math.max(LOOP_DEFAULT_WIDTH, configuredWidth),
      height: Math.max(LOOP_DEFAULT_HEIGHT, configuredHeight),
      minWidth: LOOP_DEFAULT_WIDTH,
      minHeight: LOOP_DEFAULT_HEIGHT,
    }
  }

  const left = Math.min(...childNodes.map((child) => child.position_x || 0)) - LOOP_INSET_X
  const top = Math.min(...childNodes.map((child) => child.position_y || 0)) - LOOP_INSET_TOP
  const anchorX = Math.min(loopNode.position_x || left, left)
  const anchorY = Math.min(loopNode.position_y || top, top)
  const right = Math.max(...childNodes.map((child) => (child.position_x || 0) + 220)) + LOOP_INSET_X
  const bottom = Math.max(...childNodes.map((child) => (child.position_y || 0) + 90)) + LOOP_INSET_BOTTOM
  const minWidth = Math.max(LOOP_DEFAULT_WIDTH, right - anchorX)
  const minHeight = Math.max(LOOP_DEFAULT_HEIGHT, bottom - anchorY)

  return {
    x: anchorX,
    y: anchorY,
    width: Math.max(minWidth, configuredWidth),
    height: Math.max(minHeight, configuredHeight),
    minWidth,
    minHeight,
  }
}

function buildLoopBounds(nodes: AgentNode[]) {
  const bounds = new Map<string, LoopBounds>()
  const loopNodes = nodes.filter((node) => node.type === 'loop' && node.id)
  loopNodes.forEach((loopNode) => {
    const childNodes = nodes.filter((node) => node.parent_id === loopNode.id)
    bounds.set(loopNode.id!, computeLoopBounds(loopNode, childNodes))
  })
  return bounds
}

function buildActiveLoopInfo(nodes: AgentNode[], selectedNodeId?: string | null) {
  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) : null
  const activeLoopId = selectedNode?.type === 'loop' ? selectedNode.id || null : selectedNode?.parent_id || null
  const activeNodeIds = new Set<string>()
  if (activeLoopId) {
    activeNodeIds.add(activeLoopId)
    nodes.forEach((node) => {
      if (node.parent_id === activeLoopId && node.id) activeNodeIds.add(node.id)
    })
  }
  return { activeLoopId, activeNodeIds }
}

function getNodePixelWidth(node: Node) {
  const styleWidth = Number((node.style as { width?: number } | undefined)?.width)
  const width = Number(node.width)
  if (Number.isFinite(styleWidth) && styleWidth > 0) return styleWidth
  if (Number.isFinite(width) && width > 0) return width
  return LOOP_DEFAULT_WIDTH
}

function getNodePixelHeight(node: Node) {
  const styleHeight = Number((node.style as { height?: number } | undefined)?.height)
  const height = Number(node.height)
  if (Number.isFinite(styleHeight) && styleHeight > 0) return styleHeight
  if (Number.isFinite(height) && height > 0) return height
  return LOOP_DEFAULT_HEIGHT
}

function toRFNode(
  n: AgentNode,
  idx: number,
  steps: { node_id: string; status: string }[] | null | undefined,
  allNodes: AgentNode[],
  loopBounds: Map<string, LoopBounds>,
  activeLoopId: string | null,
): Node {
  const step = steps?.find((s) => s.node_id === n.id)
  const parentNode = n.parent_id || undefined
  const parent = parentNode ? allNodes.find((candidate) => candidate.id === parentNode) : null
  const parentBound = parentNode ? loopBounds.get(parentNode) : null
  const childCount = n.id ? allNodes.filter((candidate) => candidate.parent_id === n.id).length : 0
  const isLoop = n.type === 'loop'
  const isInActiveLoop = activeLoopId ? n.id === activeLoopId || n.parent_id === activeLoopId : false
  const isMuted = Boolean(activeLoopId) && !isInActiveLoop
  const loopBound = isLoop ? loopBounds.get(n.id || '') : null

  const position = parentBound
    ? {
        x: (n.position_x || 0) - parentBound.x - 18,
        y: (n.position_y || 0) - parentBound.y - 72,
      }
    : { x: n.position_x || 0, y: n.position_y || idx * 120 }

  return {
    id: n.id || String(idx),
    type: 'custom',
    position,
    parentNode,
    extent: parentNode ? 'parent' : undefined,
    draggable: true,
    style: isLoop
      ? {
          width: loopBound?.width || LOOP_DEFAULT_WIDTH,
          height: loopBound?.height || LOOP_DEFAULT_HEIGHT,
          zIndex: -1,
        }
      : undefined,
    data: {
      type: n.type,
      label: n.label,
      config: n.config,
      status: step?.status || null,
      childCount,
      parentLabel: parent?.label || null,
      loopSummary: isLoop ? summarizeLoopConfig(n.config) : null,
      loopMinWidth: loopBound?.minWidth || LOOP_DEFAULT_WIDTH,
      loopMinHeight: loopBound?.minHeight || LOOP_DEFAULT_HEIGHT,
      activeState: activeLoopId ? (isMuted ? 'muted' : 'active') : null,
    },
  }
}

function toRFEdge(e: EdgeDef, nodes: AgentNode[], activeNodeIds: Set<string>): Edge {
  const sourceNode = nodes[e.sourceIdx]
  const targetNode = nodes[e.targetIdx]
  const isLoopInternal = Boolean(sourceNode?.parent_id && sourceNode.parent_id === targetNode?.parent_id)
  const isActive = !activeNodeIds.size || activeNodeIds.has(sourceNode?.id || '') || activeNodeIds.has(targetNode?.id || '')
  return {
    id: `${e.sourceIdx}-${e.targetIdx}-${e.sourceHandle || 'default'}`,
    source: sourceNode?.id || String(e.sourceIdx),
    target: targetNode?.id || String(e.targetIdx),
    sourceHandle: e.sourceHandle || undefined,
    label: e.condition || undefined,
    style: e.condition
      ? { strokeDasharray: '5 5', opacity: isActive ? 1 : 0.2 }
      : isLoopInternal
        ? { stroke: isActive ? '#ffd54f' : '#7db5c7', strokeWidth: isActive ? 2.2 : 1.4, opacity: isActive ? 1 : 0.2 }
        : { opacity: isActive ? 1 : 0.2 },
    data: { condition: e.condition || null, sourceHandle: e.sourceHandle || null },
  }
}

function syncLoopChildCounts(rfNodes: Node[]) {
  return rfNodes.map((node) => {
    if (node.data?.type !== 'loop') return node
    const childCount = rfNodes.filter((candidate) => candidate.parentNode === node.id).length
    return {
      ...node,
      data: {
        ...node.data,
        childCount,
      },
    }
  })
}

function autoLayout(rfNodes: Node[], rfEdges: Edge[]) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100 })
  rfNodes.filter((node) => !node.parentNode).forEach((n) => {
    const width = n.data?.type === 'loop' ? getNodePixelWidth(n) : 150
    const height = n.data?.type === 'loop' ? getNodePixelHeight(n) : 60
    g.setNode(n.id, { width, height })
  })
  rfEdges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return rfNodes.map((n) => {
    if (n.parentNode) return n
    const point = g.node(n.id)
    if (!point) return n
    return { ...n, position: { x: point.x, y: point.y } }
  })
}

function FlowCanvasInner({
  nodes, edges, executionSteps, selectedNodeId, onNodesChange, onEdgesChange, onDoubleClickNode,
}: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()
  const initializedRef = useRef(false)
  const syncLockRef = useRef(false)

  const [rfNodes, setRfNodes] = useNodesState([])
  const [rfEdges, setRfEdges] = useEdgesState([])

  const rfNodesRef = useRef(rfNodes)
  const rfEdgesRef = useRef(rfEdges)
  const nodesPropRef = useRef(nodes)
  useEffect(() => { rfNodesRef.current = rfNodes; rfEdgesRef.current = rfEdges; nodesPropRef.current = nodes }, [rfNodes, rfEdges, nodes])

  const { activeLoopId, activeNodeIds } = useMemo(() => buildActiveLoopInfo(nodes, selectedNodeId), [nodes, selectedNodeId])

  const syncToParent = useCallback((nextRfNodes: Node[], nextRfEdges: Edge[]) => {
    const idxMap = new Map(nextRfNodes.map((n, i) => [n.id, i]))
    const rfNodeMap = new Map(nextRfNodes.map((n) => [n.id, n]))
    const agentNodes: AgentNode[] = nextRfNodes.map((n) => {
      const sourceNode = nodesPropRef.current.find((pn) => (pn.id || '') === n.id)
      const parentNodeId = typeof n.parentNode === 'string' ? n.parentNode : sourceNode?.parent_id || null
      const parentRfNode = parentNodeId ? rfNodeMap.get(parentNodeId) : null
      const absPosition = parentRfNode
        ? {
            x: (parentRfNode.position.x || 0) + (n.position.x || 0) + 18,
            y: (parentRfNode.position.y || 0) + (n.position.y || 0) + 72,
          }
        : { x: n.position.x, y: n.position.y }
      const baseConfig = { ...(sourceNode?.config || (n.data?.config as Record<string, unknown>) || {}) }

      if ((n.data?.type as AgentNode['type']) === 'loop') {
        baseConfig.loop_width = Math.round(getNodePixelWidth(n))
        baseConfig.loop_height = Math.round(getNodePixelHeight(n))
      }

      return {
        id: n.id,
        type: (n.data?.type as AgentNode['type']) || 'start',
        label: n.data?.label || '',
        config: baseConfig,
        parent_id: parentNodeId,
        position_x: absPosition.x,
        position_y: absPosition.y,
      }
    })
    const agentEdges: EdgeDef[] = nextRfEdges.map((e) => ({
      sourceIdx: idxMap.get(e.source) ?? 0,
      targetIdx: idxMap.get(e.target) ?? 0,
      sourceHandle: e.sourceHandle || e.data?.sourceHandle || null,
      condition: e.data?.condition || null,
    }))
    syncLockRef.current = true
    onNodesChange(agentNodes)
    onEdgesChange(agentEdges)
  }, [onNodesChange, onEdgesChange])

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      const bounds = buildLoopBounds(nodes)
      setRfNodes(nodes.map((n, i) => toRFNode(n, i, executionSteps, nodes, bounds, activeLoopId)))
      setRfEdges(edges.map((e) => toRFEdge(e, nodes, activeNodeIds)))
    }
  }, [])

  const nodeIdKey = nodes.map((n) => `${n.id}:${n.parent_id || ''}:${n.position_x || 0}:${n.position_y || 0}:${readLoopDimension(n.config || {}, 'loop_width')}:${readLoopDimension(n.config || {}, 'loop_height')}`).join(',')
  const edgeKey = edges.map((e) => `${e.sourceIdx}-${e.targetIdx}-${e.sourceHandle || ''}-${e.condition || ''}`).join('|')
  const prevSyncKeyRef = useRef(`${nodeIdKey}::${edgeKey}`)
  useEffect(() => {
    const nextKey = `${nodeIdKey}::${edgeKey}::${selectedNodeId || ''}::${executionSteps?.length || 0}`
    if (prevSyncKeyRef.current !== nextKey) {
      prevSyncKeyRef.current = nextKey
      if (syncLockRef.current) {
        syncLockRef.current = false
        return
      }
      if (nodes.length > 0) {
        const bounds = buildLoopBounds(nodes)
        setRfNodes(nodes.map((n, i) => toRFNode(n, i, executionSteps, nodes, bounds, activeLoopId)))
        setRfEdges(edges.map((e) => toRFEdge(e, nodes, activeNodeIds)))
      }
    }
  })

  useEffect(() => {
    if (!executionSteps?.length) return
    setRfNodes((nds) => nds.map((n) => {
      const step = executionSteps.find((s) => s.node_id === n.id)
      return step ? { ...n, data: { ...n.data, status: step.status } } : n
    }))
  }, [executionSteps, setRfNodes])

  const onConnect = useCallback((params: Connection) => {
    const { source, target, sourceHandle, targetHandle } = params
    if (!source || !target) return
    setRfEdges((eds) => {
      const next = addEdge({
        id: `${source}-${sourceHandle || 'default'}-${target}-${targetHandle || 'default'}`,
        source,
        target,
        sourceHandle: sourceHandle || undefined,
        targetHandle: targetHandle || undefined,
        style: {},
        data: { condition: null, sourceHandle: sourceHandle || null },
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
    const loopBounds = buildLoopBounds(nodesPropRef.current)
    const loopParent = nodesPropRef.current.find((candidate) => {
      if (candidate.type !== 'loop' || !candidate.id) return false
      const bound = loopBounds.get(candidate.id)
      if (!bound) return false
      return position.x >= bound.x && position.x <= bound.x + bound.width && position.y >= bound.y && position.y <= bound.y + bound.height
    })

    const newId = `node_${Date.now()}`
    const newNode: Node = {
      id: newId,
      type: 'custom',
      position: loopParent?.id
        ? { x: position.x - (loopBounds.get(loopParent.id)?.x || 0) - 18, y: position.y - (loopBounds.get(loopParent.id)?.y || 0) - 72 }
        : position,
      parentNode: loopParent?.id,
      extent: loopParent?.id ? 'parent' : undefined,
      data: { type: nodeType, label: `新${nodeType}节点`, config: {} },
    }

    setRfNodes((nds) => {
      const next = syncLoopChildCounts([...nds, newNode])
      syncToParent(next, rfEdgesRef.current)
      return next
    })
  }, [screenToFlowPosition, setRfNodes, syncToParent])

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const idx = rfNodesRef.current.findIndex((n) => n.id === node.id)
    if (idx >= 0) onDoubleClickNode(idx)
  }, [onDoubleClickNode])

  const onEdgeDoubleClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    const current = edge.data?.sourceHandle || ''
    const val = prompt('sourceHandle（条件分支用 case_id，循环出口用 loop_exit）:', current)
    if (val === null) return
    setRfEdges((eds) => {
      const next = eds.map((e) => {
        if (e.id === edge.id) {
          return { ...e, sourceHandle: val.trim() || undefined, data: { ...e.data, sourceHandle: val.trim() || null } }
        }
        return e
      })
      syncToParent(rfNodesRef.current, next)
      return next
    })
  }, [setRfEdges, syncToParent])

  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    setRfNodes((nds) => {
      const next = syncLoopChildCounts(applyNodeChanges(changes, nds))
      syncToParent(next, rfEdgesRef.current)
      return next
    })
  }, [setRfNodes, syncToParent])

  const handleEdgesChange: OnEdgesChange = useCallback((changes) => {
    setRfEdges((eds) => {
      const next = applyEdgeChanges(changes, eds)
      syncToParent(rfNodesRef.current, next)
      return next
    })
  }, [setRfEdges, syncToParent])

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
        onEdgeDoubleClick={onEdgeDoubleClick}
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
            if_else: '#e91e63', loop: '#00bcd4',
          }
          return colorMap[n.data?.type] || '#999'
        }} style={{ background: '#1e2a4a' }} />
      </ReactFlow>

      <NodePalette />

      <button
        onClick={handleAutoLayout}
        style={{
          position: 'absolute', top: 14, right: 14, zIndex: 10,
          background: '#1565c0', color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 12px', cursor: 'pointer', fontSize: 12,
        }}
      >
        自动布局
      </button>
    </div>
  )
}

export default function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
