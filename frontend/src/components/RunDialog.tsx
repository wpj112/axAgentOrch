import { useState, useRef } from 'react'
import type { RunResponse, Execution } from '../api/client'

interface RunDialogProps {
  onRun: (text: string, mode: 'sync' | 'async') => Promise<RunResponse>
  onPoll: (executionId: string) => Promise<Execution>
  onClose: () => void
}

const textareaStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 14,
  border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box',
  resize: 'vertical', background: 'var(--bg-elevated)', color: 'var(--text-primary)',
}

function RunDialog({ onRun, onPoll, onClose }: RunDialogProps) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'sync' | 'async'>('sync')
  const [result, setResult] = useState<RunResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  const handleRun = async () => {
    if (!text.trim()) return
    setError(null)
    setResult(null)
    setRunning(true)
    try {
      const res = await onRun(text, mode)

      if (mode === 'async' && res.status === 'pending') {
        const execId = res.execution_id
        if (!execId) throw new Error('No execution id returned')
        pollRef.current = setInterval(async () => {
          try {
            const exec = await onPoll(execId)
            if (exec.status === 'success' || exec.status === 'failed') {
              clearInterval(pollRef.current)
              setResult({ execution_id: exec.id, status: exec.status, output: exec.output, error_message: exec.error_message })
              setRunning(false)
            }
          } catch { /* keep polling */ }
        }, 2000)
      } else {
        setResult(res)
        setRunning(false)
      }
    } catch (e) {
      setError(String(e))
      setRunning(false)
    }
  }

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'var(--bg-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 24, width: 520, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.6)', color: 'var(--text-primary)' }}>
        <h3 style={{ marginTop: 0 }}>运行智能体</h3>

        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
          <label style={{ cursor: 'pointer', color: mode === 'sync' ? 'var(--color-primary-light)' : 'var(--text-muted)' }}>
            <input type="radio" checked={mode === 'sync'} onChange={() => setMode('sync')} /> 同步
          </label>
          <label style={{ cursor: 'pointer', color: mode === 'async' ? 'var(--color-primary-light)' : 'var(--text-muted)' }}>
            <input type="radio" checked={mode === 'async'} onChange={() => setMode('async')} /> 异步
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>输入内容</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入你想对智能体说的话..."
            rows={4}
            style={textareaStyle}
            onKeyDown={(e) => {
              if (e.ctrlKey && e.key === 'Enter') handleRun()
            }}
          />
        </div>

        {error && <div style={{ color: 'var(--color-danger-text)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={handleClose} style={{ padding: '8px 20px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
            关闭
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            style={{ padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6, cursor: running ? 'not-allowed' : 'pointer', background: 'var(--color-primary)', color: '#fff', opacity: running ? 0.6 : 1 }}
          >
            {running ? (mode === 'async' ? '轮询中...' : '执行中...') : '运行'}
          </button>
        </div>

        {result && (
          <div>
            <div style={{ padding: '4px 12px', borderRadius: 4, fontSize: 13, fontWeight: 600, display: 'inline-block', background: result.status === 'success' ? 'var(--bg-success-btn)' : result.status === 'failed' ? 'var(--bg-danger)' : 'var(--bg-warning)', color: result.status === 'success' ? 'var(--color-success)' : result.status === 'failed' ? 'var(--color-danger-text)' : 'var(--color-warning)' }}>
              {result.status}
            </div>
            {result.error_message && <div style={{ marginTop: 8, color: 'var(--color-danger-text)', fontSize: 13 }}>{result.error_message}</div>}
            {result.output && (
              <pre style={{ marginTop: 8, padding: 10, background: 'var(--bg-elevated)', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto', color: 'var(--text-primary)' }}>
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
