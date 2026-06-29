import { useState } from 'react'
import type { RunResponse } from '../api/client'

interface RunDialogProps {
  onRun: (input: Record<string, unknown>) => Promise<RunResponse>
  onClose: () => void
}

function RunDialog({ onRun, onClose }: RunDialogProps) {
  const [inputText, setInputText] = useState('{\n  \n}')
  const [result, setResult] = useState<RunResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRun = async () => {
    setError(null)
    setRunning(true)
    try {
      const input = JSON.parse(inputText)
      const res = await onRun(input)
      setResult(res)
    } catch (e) {
      if (e instanceof SyntaxError) {
        setError('输入不是有效的 JSON')
      } else {
        setError(String(e))
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          width: 520,
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ marginTop: 0 }}>运行智能体</h3>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>输入 (JSON)</label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={5}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontFamily: 'monospace',
              fontSize: 13,
              border: '1px solid #ccc',
              borderRadius: 6,
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </div>

        {error && (
          <div style={{ color: '#d32f2f', fontSize: 13, marginBottom: 10 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 20px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', background: '#fff' }}
          >
            关闭
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            style={{ padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6, cursor: running ? 'not-allowed' : 'pointer', background: '#1976d2', color: '#fff', opacity: running ? 0.6 : 1 }}
          >
            {running ? '执行中...' : '运行'}
          </button>
        </div>

        {result && (
          <div>
            <div
              style={{
                padding: '4px 12px',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 600,
                display: 'inline-block',
                background: result.status === 'success' ? '#e8f5e9' : result.status === 'failed' ? '#ffebee' : '#fff3e0',
                color: result.status === 'success' ? '#2e7d32' : result.status === 'failed' ? '#c62828' : '#e65100',
              }}
            >
              {result.status}
            </div>
            {result.error_message && (
              <div style={{ marginTop: 8, color: '#c62828', fontSize: 13 }}>{result.error_message}</div>
            )}
            {result.output && (
              <pre style={{ marginTop: 8, padding: 10, background: '#f5f5f5', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}>
                {JSON.stringify(result.output, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default RunDialog
