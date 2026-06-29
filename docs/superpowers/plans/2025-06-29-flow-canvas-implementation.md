# Flow Canvas 拖拽式可视化编排 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-based NodePanel/NodeCard with a React Flow drag-and-drop canvas for visual agent workflow editing, including conditional edge routing.

**Architecture:** React Flow canvas replaces NodePanel in the right panel of AgentEditor. Four new components (FlowCanvas, CanvasNode, NodePalette, ConfigPanel) plus backend builder.py conditional routing support.

**Tech Stack:** React Flow v11, dagre v0.8, existing React 18 + TypeScript + Vite

## Global Constraints

- Keep existing AgentForm and NodeForm components unchanged
- Existing NodePanel.tsx and NodeCard.tsx are abandoned (no import references remain)
- Condition routing uses string-inclusion matching (`"success" in content`), not full expression evaluation
- No authentication (matches Phase 1 scope)
- React Flow canvas occupies right panel with `flex: 1` (responsive)
- Canvas node positions persisted via existing `position_x` / `position_y` DB columns

---

### Task 1: Install React Flow + Dagre Dependencies

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `reactflow`, `dagre`, `@types/dagre` available for import

- [ ] **Step 1: Add dependencies to package.json**

Edit `frontend/package.json`, add to dependencies:
```json
"reactflow": "^11.11.0",
"dagre": "^0.8.5"
```
Add to devDependencies:
```json
"@types/dagre": "^0.7.52"
```

- [ ] **Step 2: Install**

```bash
cd frontend && npm install && cd ..
```

- [ ] **Step 3: Verify import works**

```bash
cd frontend && node -e "require('reactflow'); require('dagre'); console.log('OK')" && cd ..
```

- [ ] **Step 4: Import React Flow CSS**

In `frontend/src/main.tsx`, add before the `ReactDOM.createRoot` call:
```tsx
import 'reactflow/dist/style.css'
```

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/main.tsx
git commit -m "feat: add reactflow + dagre dependencies for flow canvas"
```

---

### Task 2: CanvasNode — Custom React Flow Node

**Files:**
- Create: `frontend/src/components/CanvasNode.tsx`

**Interfaces:**
- Consumes: `NodeProps` from `reactflow` (built-in React Flow prop type)
- Produces: `CanvasNode` — registered as `nodeTypes: { custom: CanvasNode }` in FlowCanvas
- Renders: colored rounded card with type badge, label, top Handle (target), bottom Handle (source)

- [ ] **Step 1: Write CanvasNode.tsx**

```tsx
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
        background: '#fff',
        minWidth: 120,
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        fontSize: 13,
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit src/components/CanvasNode.tsx && cd ..
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CanvasNode.tsx
git commit -m "feat: add CanvasNode custom React Flow node component"
```

---

### Task 3: NodePalette — Draggable Node Type Panel

**Files:**
- Create: `frontend/src/components/NodePalette.tsx`

**Interfaces:**
- Produces: `NodePalette` — renders 6 draggable node type items
- Uses: HTML5 drag API `onDragStart` to transfer node type string (not React Flow dnd — simpler for inserting into canvas)

- [ ] **Step 1: Write NodePalette.tsx**

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit src/components/NodePalette.tsx && cd ..
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/NodePalette.tsx
git commit -m "feat: add NodePalette draggable node type panel"
```

---

### Task 4: ConfigPanel — Slide-Out Config Panel

**Files:**
- Create: `frontend/src/components/ConfigPanel.tsx`

**Interfaces:**
- Consumes: `selectedNode` (AgentNode | null), `onSave` callback, `onClose` callback
- Uses: `NodeForm` from existing component (the modal config form used in Phase 1)

Note: We adapt NodeForm for side-panel use. The existing `NodeForm` is designed for modal display with Cancel/Confirm buttons. We reuse it inside the panel.

- [ ] **Step 1: Write ConfigPanel.tsx**

```tsx
import { useEffect } from 'react'
import type { AgentNode } from '../api/client'
import NodeForm from './NodeForm'

interface ConfigPanelProps {
  node: AgentNode | null
  onSave: (node: AgentNode) => void
  onClose: () => void
}

function ConfigPanel({ node, onSave, onClose }: ConfigPanelProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (node) window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [node, onClose])

  if (!node) return null

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0,
          width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.15)',
          zIndex: 100,
        }}
      />
      <div
        style={{
          position: 'fixed', top: 0, right: 0,
          width: 380, height: '100vh',
          background: '#fff',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.1)',
          zIndex: 200,
          overflow: 'auto',
          transition: 'right 0.3s ease',
        }}
      >
        <NodeForm
          initial={node}
          onSave={(updated) => {
            onSave(updated)
            onClose()
          }}
          onCancel={onClose}
        />
      </div>
    </>
  )
}

export default ConfigPanel
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit src/components/ConfigPanel.tsx && cd ..
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ConfigPanel.tsx
git commit -m "feat: add ConfigPanel slide-out panel for node editing"
```

---

### Task 5: FlowCanvas — React Flow Canvas Wrapper

**Files:**
- Create: `frontend/src/components/FlowCanvas.tsx`

**Interfaces:**
- Consumes: `AgentNode[]`, `EdgeDef[]`, `onNodesChange`, `onEdgesChange`
- Produces: Full React Flow canvas with NodePalette overlay, MiniMap, drag-drop support, connect support, auto-layout
- Imports: `CanvasNode` for custom node types, `dagre` for auto-layout

- [ ] **Step 1: Write FlowCanvas.tsx**

```tsx
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
    <div ref={reactFlowWrapper} style={{ width: '100%', height: 400, border: '1px solid #e0e0e0', borderRadius: 8 }}>
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit src/components/FlowCanvas.tsx && cd ..
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FlowCanvas.tsx
git commit -m "feat: add FlowCanvas React Flow wrapper with drag-drop and auto-layout"
```

---

### Task 6: Update AgentEditor — Replace NodePanel with FlowCanvas + ConfigPanel

**Files:**
- Modify: `frontend/src/pages/AgentEditor.tsx`

**Interfaces:**
- Consumes: `FlowCanvas`, `ConfigPanel` (new components)
- Removes: `NodePanel`, `NodeCard` imports (no longer used)
- Produces: Full visual editor page with canvas in right panel

- [ ] **Step 1: Modify AgentEditor.tsx**

Replace the import section (lines 1-7):

```tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchAgent, createAgent, updateAgent, runAgent as apiRunAgent, type AgentNode, type AgentEdge } from '../api/client'
import AgentForm from '../components/AgentForm'
import FlowCanvas from '../components/FlowCanvas'
import ConfigPanel from '../components/ConfigPanel'
import RunDialog from '../components/RunDialog'
```

Remove `NodePanel` and `NodeForm` from imports.

Keep the `EdgeDef` interface (line 9-12) unchanged.

In the state section, remove:
```tsx
const [showNodeForm, setShowNodeForm] = useState(false)
const [editingNodeIdx, setEditingNodeIdx] = useState<number | null>(null)
```
Add:
```tsx
const [selectedNodeIdx, setSelectedNodeIdx] = useState<number | null>(null)
```

The `handleAddNode` function is no longer needed (node addition happens via drag-drop in FlowCanvas). Remove it. Instead add:
```tsx
const handleSaveNodeConfig = (node: AgentNode) => {
  if (selectedNodeIdx !== null) {
    const newNodes = [...nodes]
    newNodes[selectedNodeIdx] = { ...newNodes[selectedNodeIdx], ...node }
    setNodes(newNodes)
  }
}
```

Replace the right-panel section in JSX (lines 163-182). The current:
```tsx
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
  <div>
    <AgentForm ... />
  </div>
  <div>
    <NodePanel ... />
  </div>
</div>
```

Replace with:
```tsx
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
  <div>
    <AgentForm
      name={name}
      description={description}
      onChangeName={setName}
      onChangeDescription={setDescription}
    />
  </div>

  <FlowCanvas
    nodes={nodes}
    edges={edges}
    onNodesChange={setNodes}
    onEdgesChange={setEdges}
    onDoubleClickNode={(idx) => setSelectedNodeIdx(idx)}
  />
</div>
```

Remove the `showNodeForm` modal JSX block (lines 184-208). Replace with:
```tsx
<ConfigPanel
  node={selectedNodeIdx !== null ? nodes[selectedNodeIdx] : null}
  onSave={handleSaveNodeConfig}
  onClose={() => setSelectedNodeIdx(null)}
/>
```

The RunDialog section (lines 210-220) remains unchanged.

- [ ] **Step 2: Verify full build**

```bash
cd frontend && npm run build && cd ..
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AgentEditor.tsx
git commit -m "feat: replace NodePanel with FlowCanvas + ConfigPanel in AgentEditor"
```

---

### Task 7: Backend — Builder Conditional Routing

**Files:**
- Modify: `backend/app/engine/builder.py`

**Interfaces:**
- Consumes: Edge objects with optional `condition` field
- Produces: LangGraph StateGraph with `add_conditional_edges` for conditional edges

- [ ] **Step 1: Modify builder.py**

Replace the end of `build_graph()` function. Current code (lines 38-54) creates `graph.add_edge`. The new logic:

In `build_graph()`, after creating `graph.add_node` for all nodes, add the edge logic:

```python
def build_graph(nodes: list, edges: list) -> StateGraph:
    # ... existing setup code (llm, tools, graph, call_model, route_tools) ...
    # ... existing graph.add_node calls ...

    node_id_map = {str(n.id): str(n.id) for n in nodes}

    # Separate unconditional and conditional edges
    normal_edges = [e for e in edges if not e.condition]
    cond_edges = [e for e in edges if e.condition]

    for e in normal_edges:
        src = str(e.source_node_id)
        tgt = str(e.target_node_id)
        if src in node_id_map and tgt in node_id_map:
            graph.add_edge(src, tgt)

    for e in cond_edges:
        src = str(e.source_node_id)
        tgt = str(e.target_node_id)
        cond_str = e.condition

        if src not in node_id_map or tgt not in node_id_map:
            continue

        def make_route_fn(target_id, condition):
            def route(state):
                messages = state.get("messages", [])
                if not messages:
                    return END
                last = messages[-1]
                content = str(getattr(last, 'content', ''))
                if condition and condition in content:
                    return target_id
                return END
            return route

        route_fn = make_route_fn(tgt, cond_str)
        path_map = {tgt: tgt, END: END}
        graph.add_conditional_edges(src, route_fn, path_map)

    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", route_tools, {"tools": "tools", "end": END})
    graph.add_edge("tools", "agent")

    return graph.compile()
```

- [ ] **Step 2: Verify import**

```bash
cd backend && python -c "from app.engine.builder import build_graph; print('Builder OK')" && cd ..
```

- [ ] **Step 3: Run backend tests**

```bash
cd backend && python -m pytest tests/ -v && cd ..
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/engine/builder.py
git commit -m "feat: add conditional edge routing to LangGraph builder"
```

---

### Task 8: Final Integration Verification

**Files:**
- Verify: frontend build passes
- Verify: backend tests pass
- Verify: TypeScript no errors

- [ ] **Step 1: Full frontend build**

```bash
cd frontend && npm run build && cd ..
```

- [ ] **Step 2: Full backend tests**

```bash
cd backend && python -m pytest tests/ -v && cd ..
```

- [ ] **Step 3: Docker rebuild and health check**

```bash
docker compose build backend && docker compose up -d && sleep 15 && curl -s http://localhost:8888/api/health
```

- [ ] **Step 4: Verify frontend serves**

```bash
curl -s http://localhost:8888/ | head -c 100
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: complete flow canvas integration — all builds and tests pass"
```
