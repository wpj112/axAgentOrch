import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchAgent, createAgent, updateAgent, runAgent as apiRunAgent, fetchExecution, type AgentNode, type AgentEdge } from '../api/client'
import AgentForm from '../components/AgentForm'
import FlowCanvas from '../components/FlowCanvas'
import ConfigPanel from '../components/ConfigPanel'
import RunDialog from '../components/RunDialog'

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
  const [showRunDialog, setShowRunDialog] = useState(false)
  const [saved, setSaved] = useState(false)

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
            onClick={() => setShowRunDialog(true)}
            disabled={nodes.length === 0}
            style={{
              padding: '8px 20px', fontSize: 14, border: '1px solid #4caf50', borderRadius: 6,
              cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
              background: '#1b3a1e', color: '#81c784',
              opacity: nodes.length === 0 ? 0.5 : 1,
            }}
          >
            运行
          </button>
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

      {showRunDialog && (
        <RunDialog
          onRun={async (text, mode) => {
            if (!isNew && id) {
              return await apiRunAgent(id, { message: text }, mode)
            }
            throw new Error('请先保存智能体再运行')
          }}
          onPoll={async (executionId) => {
            return await fetchExecution(executionId)
          }}
          onClose={() => setShowRunDialog(false)}
        />
      )}
    </div>
  )
}

export default AgentEditor
