import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { fetchAgent, createAgent, updateAgent, exportAgent, type AgentNode } from '../api/client'
import AgentForm from '../components/AgentForm'
import FlowCanvas from '../components/FlowCanvas'
import ConfigPanel from '../components/ConfigPanel'
import { copyApiUrl } from '../components/AgentCard'

interface EdgeDef {
  sourceIdx: number
  targetIdx: number
  sourceHandle?: string | null
  condition?: string | null
}

interface ExecutionStep {
  node_id: string
  ref_node_id?: string
  type?: string
  label?: string
  status: string
  started_at?: string
  completed_at?: string
  output?: unknown
}

function upsertExecutionStep(prev: ExecutionStep[] | null, nextStep: ExecutionStep): ExecutionStep[] {
  const current = [...(prev || [])]
  const existingIdx = current.findIndex((step) => step.node_id === nextStep.node_id)
  if (existingIdx >= 0) {
    current[existingIdx] = { ...current[existingIdx], ...nextStep }
    return current
  }
  return [...current, nextStep]
}

function AgentEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmTemperature, setLlmTemperature] = useState('')
  const [nodes, setNodes] = useState<AgentNode[]>([])
  const [edges, setEdges] = useState<EdgeDef[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [selectedNodeIdx, setSelectedNodeIdx] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[] | null>(null)
  const [runText, setRunText] = useState('')
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<{ status: string; text: string } | null>(null)
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [copiedApi, setCopiedApi] = useState(false)
  const runAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!isNew && id) {
      fetchAgent(id).then((agent) => {
        setName(agent.name)
        setDescription(agent.description || '')
        setLlmModel(agent.llm_model || '')
        setLlmTemperature(agent.llm_temperature || '')
        const nodeList: AgentNode[] = agent.nodes.map((n) => ({
          type: n.type as AgentNode['type'],
          label: n.label,
          config: n.config as Record<string, unknown>,
          id: n.id,
          parent_id: n.parent_id || null,
          position_x: n.position_x,
          position_y: n.position_y,
        }))
        setNodes(nodeList)
        const edgeList: EdgeDef[] = agent.edges.map((e) => {
          const srcIdx = nodeList.findIndex((n) => n.id === e.source_node_id)
          const tgtIdx = nodeList.findIndex((n) => n.id === e.target_node_id)
          return { sourceIdx: srcIdx, targetIdx: tgtIdx, sourceHandle: e.source_handle || null, condition: e.condition || null }
        }).filter((e) => e.sourceIdx >= 0 && e.targetIdx >= 0)
        setEdges(edgeList)
        setLoading(false)
      })
    }
  }, [id, isNew])

  const buildNodePayload = (curNodes: AgentNode[]) => {
    const nodeIndexById = new Map(curNodes.map((node, idx) => [node.id || String(idx), idx]))
    return curNodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      config: n.config,
      parent_id: n.parent_id ? (nodeIndexById.get(n.parent_id) ?? n.parent_id ?? null) : null,
      position_x: n.position_x ?? 0,
      position_y: n.position_y ?? 0,
    }))
  }

  const buildEdgePayload = (curEdges: EdgeDef[]) => curEdges.map((e) => ({
    source_node_id: e.sourceIdx,
    target_node_id: e.targetIdx,
    source_handle: e.sourceHandle || null,
    condition: e.condition || null,
  }))

  const doSave = async (agentName: string, desc: string, curNodes: AgentNode[], curEdges: EdgeDef[], model: string, temp: string) => {
    if (!agentName.trim()) {
      alert('请输入智能体名称')
      return
    }
    setSaving(true)
    const nodeList = buildNodePayload(curNodes)
    const edgeList = buildEdgePayload(curEdges)

    try {
      if (isNew) {
        const agent = await createAgent({
          name: agentName.trim(),
          description: desc.trim() || null,
          llm_model: model.trim() || undefined,
          llm_temperature: temp.trim() || undefined,
          nodes: nodeList,
          edges: edgeList,
        })
        navigate(`/agents/${agent.id}`, { replace: true })
      } else if (id) {
        const payload = {
          name: agentName.trim(),
          description: desc.trim() || null,
          llm_model: model.trim() || null,
          llm_temperature: temp.trim() || null,
          nodes: nodeList,
          edges: edgeList,
        }
        await updateAgent(id, payload as never)
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const detail = typeof err.response?.data === 'string'
          ? err.response.data
          : JSON.stringify(err.response?.data ?? err.message, null, 2)
        alert(`保存失败:
${detail}`)
      } else {
        alert('保存失败: ' + String(err))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => doSave(name, description, nodes, edges, llmModel, llmTemperature)

  const openRunDialog = () => {
    setRunDialogOpen(true)
  }

  const closeRunDialog = () => {
    setRunDialogOpen(false)
  }

  const stopRun = () => {
    runAbortRef.current?.abort()
    runAbortRef.current = null
    setRunning(false)
    setRunResult({ status: 'stopped', text: '已停止运行' })
  }

  const handleCopyApi = async () => {
    if (!id || isNew) return
    const ok = await copyApiUrl(id)
    if (!ok) {
      alert('复制失败，请检查浏览器剪贴板权限')
      return
    }
    setCopiedApi(true)
    window.setTimeout(() => setCopiedApi(false), 1800)
  }

  const doRun = async () => {
    if (!runText.trim() || isNew || !id) return
    setRunDialogOpen(true)
    setRunResult(null)
    setRunning(true)
    setExecutionSteps([])
    try {
      runAbortRef.current?.abort()
      const controller = new AbortController()
      runAbortRef.current = controller
      const resp = await fetch(`/api/agents/${id}/run?mode=stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { message: runText } }),
        signal: controller.signal,
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No response body')
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const evt = JSON.parse(line.slice(6))
          if (evt.event === 'step') {
            setExecutionSteps((prev) => upsertExecutionStep(prev, {
              node_id: evt.node_id,
              type: evt.type,
              label: evt.label,
              status: evt.status,
              started_at: evt.started_at,
              completed_at: evt.completed_at,
              ref_node_id: evt.ref_node_id,
              output: evt.output,
            }))
          } else if (evt.event === 'done') {
            setExecutionSteps((evt.steps || []) as ExecutionStep[])
            setRunResult({ status: evt.status || 'success', text: evt.result || '' })
          } else if (evt.event === 'error') {
            setRunResult({ status: 'failed', text: evt.message })
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      setRunResult({ status: 'failed', text: String(err) })
    } finally {
      runAbortRef.current = null
      setRunning(false)
    }
  }

  const handleSaveNodeConfig = (node: AgentNode, edgeUpdates?: EdgeDef[]) => {
    if (selectedNodeIdx === null) return
    const newNodes = [...nodes]
    newNodes[selectedNodeIdx] = { ...newNodes[selectedNodeIdx], ...node }
    const nextEdges = edgeUpdates || edges
    setNodes(newNodes)
    if (edgeUpdates) setEdges(edgeUpdates)
    doSave(name, description, newNodes, nextEdges, llmModel, llmTemperature)
  }

  const currentExecutionStep = executionSteps && executionSteps.length > 0
    ? [...executionSteps].reverse().find((step) => step.status === 'running') || executionSteps[executionSteps.length - 1]
    : null

  if (loading) return <div style={{ color: 'var(--text-secondary)' }}>加载中...</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <a href="/" style={{ color: 'var(--color-primary-light)', textDecoration: 'none', fontSize: 14 }}>← 返回列表</a>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          {isNew ? '新建智能体' : `编辑: ${name}`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span style={{ color: 'var(--color-success)', fontSize: 12 }}>✓ 已保存</span>}
          {saving && <span style={{ color: 'var(--color-warning)', fontSize: 12 }}>保存中...</span>}
          <div style={{ position: 'relative' }}>
            <button
              onClick={handleCopyApi}
              disabled={isNew || !id}
              title={copiedApi ? '已复制 API 调用命令' : '复制 API 调用命令'}
              aria-label={copiedApi ? '已复制 API 调用命令' : '复制 API 调用命令'}
              style={{
                width: 36, height: 36, padding: 0, fontSize: 13, border: '1px solid var(--border)', borderRadius: 8,
                cursor: (isNew || !id) ? 'not-allowed' : 'pointer', background: copiedApi ? 'var(--bg-success)' : 'var(--bg-card)', color: copiedApi ? 'var(--color-success)' : 'var(--text-secondary)', opacity: (isNew || !id) ? 0.5 : 1,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: copiedApi ? '0 0 0 1px var(--border-success)' : 'none',
                transform: copiedApi ? 'scale(1.05)' : 'none',
              }}
            >
              {copiedApi ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.2l2.5 2.5 6-6" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="3" width="8" height="10" rx="1.8" />
                  <path d="M3 11V5.8C3 4.8 3.8 4 4.8 4H10" />
                </svg>
              )}
            </button>
            {copiedApi && (
              <div style={{
                position: 'absolute', top: '50%', right: 'calc(100% + 8px)', transform: 'translateY(-50%)',
                padding: '4px 9px', borderRadius: 999, background: 'var(--bg-success)', border: '1px solid var(--border-success)',
                color: 'var(--color-success)', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none',
                boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
              }}>已复制</div>
            )}
          </div>
          <button
            onClick={openRunDialog}
            disabled={isNew}
            style={{
              padding: '8px 16px', fontSize: 13, border: '1px solid var(--color-success)', borderRadius: 6,
              cursor: isNew ? 'not-allowed' : 'pointer', background: 'var(--bg-success)', color: 'var(--color-success)', opacity: isNew ? 0.5 : 1,
            }}
          >
            运行
          </button>
          <button
            onClick={async () => {
              if (!id || isNew) return
              try {
                const data = await exportAgent(id)
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${name}.json`
                a.click()
                URL.revokeObjectURL(url)
              } catch {
                alert('导出失败')
              }
            }}
            disabled={isNew || !id}
            style={{
              padding: '8px 14px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6,
              cursor: (isNew || !id) ? 'not-allowed' : 'pointer', background: 'var(--bg-card)', color: 'var(--text-secondary)', opacity: (isNew || !id) ? 0.5 : 1,
            }}
          >
            导出
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer', background: 'var(--color-primary)', color: '#fff', opacity: saving ? 0.6 : 1,
            }}
          >
            保存
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <AgentForm
            name={name}
            description={description}
            llmModel={llmModel}
            llmTemperature={llmTemperature}
            onChangeName={setName}
            onChangeDescription={setDescription}
            onChangeLlmModel={setLlmModel}
            onChangeLlmTemperature={setLlmTemperature}
          />

          <div style={{
            marginTop: 12, padding: '14px 16px', borderRadius: 10,
            background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8,
          }}>
            💡 <strong style={{ color: 'var(--text-secondary)' }}>拖拽</strong>面板节点到画布 · <strong style={{ color: 'var(--text-secondary)' }}>双击</strong>节点编辑 · 从节点上下链接点拖出即可<strong style={{ color: 'var(--text-secondary)' }}>连线</strong><br />
            🔄 循环体：把节点直接拖进循环容器即可加入；拖右下角斜纹手柄可调整容器大小<br />
            🔀 条件分支：先连线，再<strong style={{ color: 'var(--text-secondary)' }}>双击边</strong>填写 <strong style={{ color: 'var(--text-secondary)' }}>sourceHandle</strong>，并与 case_id 对应<br />
            📥 <strong style={{ color: 'var(--text-secondary)' }}>滚轮</strong>缩放 · <strong style={{ color: 'var(--text-secondary)' }}>Delete</strong> 删除节点或边 · 列表页可导入导出 JSON
          </div>
        </div>

        <FlowCanvas
          nodes={nodes}
          edges={edges}
          executionSteps={executionSteps}
          selectedNodeId={selectedNodeIdx === null ? null : (nodes[selectedNodeIdx]?.id || null)}
          onNodesChange={setNodes}
          onEdgesChange={setEdges}
          onDoubleClickNode={(idx) => setSelectedNodeIdx(idx)}
        />
      </div>

      {runDialogOpen && (
        <>
          <div
            onClick={closeRunDialog}
            style={{
              position: 'fixed', inset: 0, background: 'var(--bg-overlay)', backdropFilter: 'blur(3px)', zIndex: 120,
            }}
          />
          <div style={{
            position: 'fixed', right: 24, top: 24, width: 420, height: 'calc(100vh - 48px)',
            background: 'var(--bg-dialog)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
            zIndex: 130, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px',
              borderBottom: '1px solid var(--border)', background: 'var(--bg-dialog-header)',
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 700 }}>运行调试</div>
                <div style={{ color: 'var(--text-dialog-sub)', fontSize: 12, marginTop: 4 }}>
                  {currentExecutionStep ? `当前节点: ${currentExecutionStep.label || currentExecutionStep.node_id}` : '等待输入后运行'}
                </div>
              </div>
              <button
                onClick={closeRunDialog}
                disabled={false}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)',
                  cursor: running ? 'not-allowed' : 'pointer', fontSize: 16,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 14, overflow: 'auto', display: 'grid', gap: 10, alignContent: 'start' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              }}>
                <span style={{ color: running ? 'var(--color-primary-light)' : runResult?.status === 'success' ? 'var(--color-success)' : runResult?.status === 'failed' ? 'var(--color-danger-text)' : 'var(--text-muted)', fontSize: 14 }}>
                  {running ? '⏳' : runResult?.status === 'success' ? '✓' : runResult?.status === 'failed' ? '✗' : '○'}
                </span>
                <span style={{ color: 'var(--text-light)', fontSize: 13, fontWeight: 600 }}>
                  {running ? '正在执行' : runResult ? '执行完成' : '尚未开始'}
                </span>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                {executionSteps && executionSteps.length > 0 ? executionSteps.map((step, idx) => (
                  <div key={`${step.node_id}-${idx}`} style={{
                    padding: '9px 10px', borderRadius: 8,
                    background: step.status === 'running' ? 'var(--bg-step-running)' : 'var(--bg-step)',
                    border: `1px solid ${step.status === 'running' ? 'var(--color-primary)' : 'var(--border-step)'}`,
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '64px 84px 1fr', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: step.status === 'success' ? 'var(--color-success)' : step.status === 'failed' ? 'var(--color-danger-text)' : 'var(--color-primary-light)' }}>{step.status}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-step-time)' }}>{step.type || '-'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{step.label || step.ref_node_id || step.node_id}</span>
                    </div>
                    {step.output !== undefined && step.output !== null && (
                      <pre style={{
                        margin: '8px 0 0', padding: '8px 10px', borderRadius: 6,
                        background: 'var(--bg-nested)', border: '1px solid var(--border)',
                        fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflow: 'auto',
                      }}>
                        {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                      </pre>
                    )}
                  </div>
                )) : (
                  <div style={{ padding: '12px 10px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px dashed var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
                    运行后，这里会按顺序显示执行流程。
                  </div>
                )}
              </div>

              <div style={{ padding: '12px 10px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>结果输出</div>
                <pre style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto' }}>
                  {runResult?.text || '暂无输出'}
                </pre>
              </div>
            </div>

            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-dialog-header)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={runText}
                onChange={(e) => setRunText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !running && runText.trim()) {
                    e.preventDefault()
                    doRun()
                  }
                }}
                placeholder="输入消息，按 Enter 发送"
                style={{
                  flex: 1, height: 36, padding: '0 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: 'none',
                }}
                disabled={isNew}
              />
              <button
                onClick={running ? stopRun : doRun}
                disabled={isNew || (!running && !runText.trim())}
                style={{
                  height: 36, padding: '0 16px', fontSize: 13, border: '1px solid var(--color-success)', borderRadius: 8,
                  cursor: isNew || (!running && !runText.trim()) ? 'not-allowed' : 'pointer',
                  background: running ? 'var(--bg-danger)' : 'var(--bg-success-btn)', color: running ? 'var(--color-danger-text)' : 'var(--color-success)', opacity: isNew || (!running && !runText.trim()) ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {running ? '停止' : '发送'}
              </button>
            </div>
          </div>
        </>
      )}

      <ConfigPanel
        node={selectedNodeIdx === null ? null : nodes[selectedNodeIdx]}
        allNodes={nodes}
        edges={edges}
        onSave={handleSaveNodeConfig}
        onClose={() => setSelectedNodeIdx(null)}
      />
    </div>
  )
}

export default AgentEditor
