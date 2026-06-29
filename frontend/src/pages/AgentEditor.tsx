import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchAgent, createAgent, updateAgent, runAgent as apiRunAgent, type AgentNode, type AgentEdge } from '../api/client'
import AgentForm from '../components/AgentForm'
import FlowCanvas from '../components/FlowCanvas'
import ConfigPanel from '../components/ConfigPanel'

interface EdgeDef {
  sourceIdx: number
  targetIdx: number
  condition?: string | null
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
  const [executionSteps, setExecutionSteps] = useState<{ node_id: string; status: string }[] | null>(null)
  const [runText, setRunText] = useState('')
  const [runMode, setRunMode] = useState<'sync' | 'async'>('sync')
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<{ status: string; text: string } | null>(null)

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
          position_x: n.position_x,
          position_y: n.position_y,
        }))
        setNodes(nodeList)
        const edgeList: EdgeDef[] = agent.edges.map((e) => {
          const srcIdx = nodeList.findIndex((n) => n.id === e.source_node_id)
          const tgtIdx = nodeList.findIndex((n) => n.id === e.target_node_id)
          return { sourceIdx: srcIdx, targetIdx: tgtIdx }
        }).filter((e) => e.sourceIdx >= 0 && e.targetIdx >= 0)
        setEdges(edgeList)
        setLoading(false)
      })
    }
  }, [id, isNew])

  const doSave = async (agentName: string, desc: string, curNodes: AgentNode[], curEdges: EdgeDef[], model: string, temp: string) => {
    if (!agentName.trim()) {
      alert('请输入智能体名称')
      return
    }
    setSaving(true)
    const nodeList = curNodes.map((n) => ({
      type: n.type,
      label: n.label,
      config: n.config,
      position_x: n.position_x ?? 0,
      position_y: n.position_y ?? 0,
    }))

    try {
      if (isNew) {
        const agent = await createAgent({
          name: agentName.trim(),
          description: desc.trim() || null,
          llm_model: model.trim() || undefined,
          llm_temperature: temp.trim() || undefined,
          nodes: nodeList,
          edges: curEdges.map((e) => ({
            source_node_id: e.sourceIdx as unknown as string,
            target_node_id: e.targetIdx as unknown as string,
          })),
        })
        navigate(`/agents/${agent.id}`, { replace: true })
      } else if (id) {
        const payload = {
          name: agentName.trim(),
          description: desc.trim() || null,
          llm_model: model.trim() || null,
          llm_temperature: temp.trim() || null,
          nodes: nodeList,
          edges: curEdges.map((e) => ({
            source_node_id: e.sourceIdx,
            target_node_id: e.targetIdx,
          })),
        }
        await updateAgent(id, payload as never)
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      }
    } catch (err) {
      alert('保存失败: ' + String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => doSave(name, description, nodes, edges, llmModel, llmTemperature)

  const handleSaveNodeConfig = (node: AgentNode) => {
    if (selectedNodeIdx === null) return
    const newNodes = [...nodes]
    newNodes[selectedNodeIdx] = { ...newNodes[selectedNodeIdx], ...node }
    setNodes(newNodes)
    doSave(name, description, newNodes, edges, llmModel, llmTemperature)
  }

  if (loading) return <div style={{ color: '#b0bec5' }}>加载中...</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <a href="/" style={{ color: '#90caf9', textDecoration: 'none', fontSize: 14 }}>← 返回列表</a>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#e0e0e0' }}>
          {isNew ? '新建智能体' : `编辑: ${name}`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span style={{ color: '#81c784', fontSize: 12 }}>✓ 已保存</span>}
          {saving && <span style={{ color: '#ffb74d', fontSize: 12 }}>保存中...</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer',
              background: '#1565c0', color: '#fff',
              opacity: saving ? 0.6 : 1,
            }}
          >
            保存
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
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
        </div>

        <FlowCanvas
          nodes={nodes}
          edges={edges}
          executionSteps={executionSteps}
          onNodesChange={setNodes}
          onEdgesChange={setEdges}
          onDoubleClickNode={(idx) => setSelectedNodeIdx(idx)}
        />
      </div>

      <ConfigPanel
        node={selectedNodeIdx !== null ? nodes[selectedNodeIdx] : null}
        onSave={handleSaveNodeConfig}
        onClose={() => setSelectedNodeIdx(null)}
      />

      <div style={{
        marginTop: 12, padding: '10px 14px',
        background: '#1e2a4a', border: '1px solid #2a3a5c', borderRadius: 8,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, marginRight: 8 }}>
          <label style={{ cursor: 'pointer', color: runMode === 'sync' ? '#90caf9' : '#6a7a8a' }}>
            <input type="radio" checked={runMode === 'sync'} onChange={() => setRunMode('sync')} /> 同步
          </label>
          <label style={{ cursor: 'pointer', color: runMode === 'async' ? '#90caf9' : '#6a7a8a' }}>
            <input type="radio" checked={runMode === 'async'} onChange={() => setRunMode('async')} /> 异步
          </label>
        </div>
        <input
          value={runText}
          onChange={e => setRunText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !running && runText.trim() && !isNew && id) {
            setRunResult(null); setRunning(true)
            apiRunAgent(id, { message: runText }, runMode).then(res => {
              setRunResult(res.output ? { status: res.status, text: JSON.stringify(res.output, null, 2) } : { status: res.status, text: res.error_message || '' })
              if (res.output) {
                const steps = (res.output as Record<string, unknown>).execution_steps as { node_id: string; status: string }[] | undefined
                if (steps) { setExecutionSteps(steps); setTimeout(() => setExecutionSteps(null), 5000) }
              }
              setRunning(false)
            }).catch(err => { setRunResult({ status: 'failed', text: String(err) }); setRunning(false) })
          }}}
          placeholder="输入 message，按 Enter 运行..."
          style={{ flex: 1, padding: '8px 14px', fontSize: 14, border: '1px solid #2a3a5c', borderRadius: 6, background: '#0f1a30', color: '#e0e0e0' }}
          disabled={isNew}
        />
        <button
          onClick={async () => {
            if (!runText.trim() || isNew || !id) return
            setRunResult(null); setRunning(true)
            try {
              const res = await apiRunAgent(id, { message: runText }, runMode)
              setRunResult(res.output ? { status: res.status, text: JSON.stringify(res.output, null, 2) } : { status: res.status, text: res.error_message || '' })
              if (res.output) {
                const steps = (res.output as Record<string, unknown>).execution_steps as { node_id: string; status: string }[] | undefined
                if (steps) { setExecutionSteps(steps); setTimeout(() => setExecutionSteps(null), 5000) }
              }
            } catch (err) { setRunResult({ status: 'failed', text: String(err) }) }
            finally { setRunning(false) }
          }}
          disabled={running || isNew}
          style={{ padding: '8px 20px', fontSize: 14, border: '1px solid #4caf50', borderRadius: 6, cursor: running ? 'not-allowed' : 'pointer', background: '#1b3a1e', color: '#81c784', opacity: running ? 0.5 : 1, whiteSpace: 'nowrap' }}
        >
          {running ? '⏳' : '运行'}
        </button>
        {runResult && (
          <div style={{ fontSize: 12, maxWidth: 260, overflow: 'hidden' }}>
            <span style={{ color: runResult.status === 'success' ? '#81c784' : '#ef9a9a' }}>
              {runResult.status === 'success' ? '✓ ' : '✗ '}
            </span>
            <span style={{ color: '#b0bec5' }}>{runResult.text.slice(0, 100)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default AgentEditor
