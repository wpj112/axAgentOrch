import { useEffect } from 'react'
import type { AgentNode } from '../api/client'
import NodeForm from './NodeForm'

interface EdgeLike {
  sourceIdx: number
  targetIdx: number
  sourceHandle?: string | null
  condition?: string | null
}

interface ConfigPanelProps {
  node: AgentNode | null
  allNodes: AgentNode[]
  edges: EdgeLike[]
  onSave: (node: AgentNode, edgeUpdates?: EdgeLike[]) => void
  onClose: () => void
}

function ConfigPanel({ node, allNodes, edges, onSave, onClose }: ConfigPanelProps) {
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
          background: 'var(--bg-overlay-light)',
          zIndex: 100,
        }}
      />
      <div
        style={{
          position: 'fixed', top: 0, right: 0,
          width: 380, height: '100vh',
          background: 'var(--bg-card)',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.5)',
          color: 'var(--text-primary)',
          zIndex: 200,
          overflow: 'auto',
          transition: 'right 0.3s ease',
        }}
      >
        <NodeForm
          key={node.id || node.label}
          initial={node}
          allNodes={allNodes}
          edges={edges}
          onSave={(updated, edgeUpdates) => {
            onSave(updated, edgeUpdates)
            onClose()
          }}
          onCancel={onClose}
        />
      </div>
    </>
  )
}

export default ConfigPanel
