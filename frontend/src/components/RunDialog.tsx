import { useState, useRef, useCallback } from 'react'
import type { RunResponse, Execution } from '../api/client'

interface RunDialogProps {
  onRun: (input: Record<string, unknown>, mode: 'sync' | 'async') => Promise<RunResponse>
  onPoll: (executionId: string) => Promise<Execution>
  onClose: () => void
}

const darkInput: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontFamily: 'monospace', fontSize: 13,
  border: '1px solid #2a3a5c', borderRadius: 6, boxSizing: 'border-box',
  resize: 'vertical', background: '#0f1a30', color: '#e0e0e0',
}

function RunDialog({ onRun, onPoll, onClose }: RunDialogProps) {
  const [inputText, setInputText] = useState('{\n  \n}')
  const [mode, setMode] = useState<'sync' | 'async'>('sync')
  const [result, setResult] = useState<RunResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  const handleRun = async () => {
    setError(null)
    setResult(null)
    setRunning(true)
    try {
      const input = JSON.parse(inputText)
      const res = await onRun(input, mode)

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
      if (e instanceof SyntaxError) setError('输入不是有效的 JSON')
      else setError(String(e))
      setRunning(false)
    }
  }

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div style={{ background: '#1e2a4a', borderRadius: 12, padding: 24, width: 520, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.6)', color: '#e0e0e0' }}>
        <h3 style={{ marginTop: 0 }}>运行智能体</h3>

        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
          <label style={{ cursor: 'pointer', color: mode === 'sync' ? '#90caf9' : '#6a7a8a' }}>
            <input type="radio" checked={mode === 'sync'} onChange={() => setMode('sync')} /> 同步
          </label>
          <label style={{ cursor: 'pointer', color: mode === 'async' ? '#90caf9' : '#6a7a8a' }}>
            <input type="radio" checked={mode === 'async'} onChange={() => setMode('async')} /> 异步
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#b0bec5' }}>输入 (JSON)</label>
          <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} rows={5} style={darkInput} />
        </div>

        {error && <div style={{ color: '#ef9a9a', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={handleClose} style={{ padding: '8px 20px', fontSize: 14, border: '1px solid #2a3a5c', borderRadius: 6, cursor: 'pointer', background: '#0f1a30', color: '#e0e0e0' }}>
            关闭
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            style={{ padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6, cursor: running ? 'not-allowed' : 'pointer', background: '#1565c0', color: '#fff', opacity: running ? 0.6 : 1 }}
          >
            {running ? (mode === 'async' ? '轮询中...' : '执行中...') : '运行'}
          </button>
        </div>

        {result && (
          <div>
            <div style={{ padding: '4px 12px', borderRadius: 4, fontSize: 13, fontWeight: 600, display: 'inline-block', background: result.status === 'success' ? '#1b3a1e' : result.status === 'failed' ? '#3a1b1b' : '#3a301b', color: result.status === 'success' ? '#81c784' : result.status === 'failed' ? '#ef9a9a' : '#ffb74d' }}>
              {result.status}
            </div>
            {result.error_message && <div style={{ marginTop: 8, color: '#ef9a9a', fontSize: 13 }}>{result.error_message}</div>}
            {result.output && (
              <pre style={{ marginTop: 8, padding: 10, background: '#0f1a30', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto', color: '#e0e0e0' }}>
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
