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
          background: '#1e2a4a',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.5)',
          color: '#e0e0e0',
          zIndex: 200,
          overflow: 'auto',
          transition: 'right 0.3s ease',
        }}
      >
        <NodeForm
          key={node.id || node.label}
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
