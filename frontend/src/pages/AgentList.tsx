import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { fetchAgents, fetchAgent, createAgent, deleteAgent as apiDeleteAgent, importAgent, type Agent } from '../api/client'
import AgentCard, { apiUrl, copyApiUrl, type CopyCardInfo } from '../components/AgentCard'

const btnStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 15, border: '1px solid var(--border)',
  borderRadius: 6, cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-secondary)',
}

const btnActive: React.CSSProperties = { ...btnStyle, background: 'var(--color-primary)', color: '#fff', border: '1px solid var(--color-primary)' }

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px', fontSize: 12,
  fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--border)',
  color: 'var(--text-primary)',
}

const actionBtn: React.CSSProperties = {
  padding: '4px 12px', fontSize: 12, border: 'none', borderRadius: 4,
  cursor: 'pointer', color: '#fff', textDecoration: 'none', display: 'inline-block',
}

function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'card' | 'list'>('card')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copyCard, setCopyCard] = useState<CopyCardInfo | null>(null)
  const [copyName, setCopyName] = useState('')
  const [copying, setCopying] = useState(false)

  const loadAgents = useCallback(async () => {
    setLoading(true)
    const data = await fetchAgents(search || undefined)
    setAgents(data.items)
    setLoading(false)
  }, [search])

  useEffect(() => { loadAgents() }, [loadAgents])

  const handleCopy = (id: string) => {
    copyApiUrl(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除此智能体？')) return
    await apiDeleteAgent(id)
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }

  const handleOpenCopyCard = (info: CopyCardInfo) => {
    setCopyCard(info)
    setCopyName(info.defaultName)
  }

  const handleCopyCard = async () => {
    if (!copyCard || !copyName.trim()) return
    setCopying(true)
    try {
      const source = await fetchAgent(copyCard.agent.id)
      await createAgent({
        name: copyName.trim(),
        description: source.description,
        llm_model: source.llm_model,
        llm_temperature: source.llm_temperature,
        nodes: source.nodes.map(n => ({
          id: n.id,
          type: n.type,
          label: n.label,
          config: n.config,
          parent_id: n.parent_id || null,
          position_x: n.position_x,
          position_y: n.position_y,
        })),
        edges: source.edges.map(e => ({
          source_node_id: e.source_node_id,
          target_node_id: e.target_node_id,
          source_handle: e.source_handle,
          condition: e.condition,
        })),
      })
      setCopyCard(null)
      loadAgents()
    } catch {
      alert('复制失败')
    } finally {
      setCopying(false)
    }
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const json = JSON.parse(text)
        await importAgent(json)
        loadAgents()
        alert('导入成功')
      } catch (err) {
        if (err instanceof SyntaxError) {
          alert('导入失败：文件不是合法 JSON')
          return
        }
        const detail = axios.isAxiosError(err) ? err.response?.data?.detail : null
        const message = Array.isArray(detail)
          ? detail.map((item) => item?.msg || JSON.stringify(item)).join('；')
          : typeof detail === 'string'
            ? detail
            : '请检查文件是否为智能体导出文件'
        alert(`导入失败：${message}`)
      }
    }
    input.click()
  }

  return (
    <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="搜索智能体..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 6, width: 260, background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
          />
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <button style={view === 'card' ? btnActive : btnStyle} onClick={() => setView('card')} title="卡片">▦</button>
            <button style={view === 'list' ? btnActive : btnStyle} onClick={() => setView('list')} title="列表">☰</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleImport} style={{ padding: '8px 14px', background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>📥 导入</button>
          <a href="/settings" style={{ padding: '8px 16px', background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>⚙ 设置</a>
          <a href="/agents/new" style={{ padding: '8px 20px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 6, textDecoration: 'none', fontSize: 14 }}>+ 新建智能体</a>
        </div>
      </div>

      {loading ? <div style={{ color: 'var(--text-secondary)' }}>加载中...</div> : null}

      {!loading && agents.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', marginTop: 40, textAlign: 'center' }}>暂无智能体，点击「+ 新建智能体」创建</div>
      ) : null}

      {view === 'card' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onDelete={handleDelete} onRefresh={loadAgents} onCopyCard={handleOpenCopyCard} />
          ))}
        </div>
      )}

      {view === 'list' && agents.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>名称</th>
                <th style={thStyle}>API</th>
                <th style={thStyle}>描述</th>
                <th style={{ ...thStyle, textAlign: 'center', width: 60 }}>节点</th>
                <th style={thStyle}>创建时间</th>
                <th style={thStyle}>编辑时间</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} style={{ transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{agent.name}</div>
                    {agent.llm_model && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{agent.llm_model}</div>}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <code style={{ fontSize: 11, color: 'var(--color-success)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                        POST {apiUrl(agent.id)}
                      </code>
                      <button
                        onClick={() => handleCopy(agent.id)}
                        style={{ padding: '2px 8px', fontSize: 10, border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', background: copiedId === agent.id ? 'var(--bg-success-btn)' : 'transparent', color: copiedId === agent.id ? 'var(--color-success)' : 'var(--text-muted)', flexShrink: 0 }}
                      >
                        {copiedId === agent.id ? '✓' : '复制'}
                      </button>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agent.description || '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{agent.nodes.length}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12 }}>
                    {new Date(agent.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12 }}>
                    {new Date(agent.updated_at).toLocaleString('zh-CN', { hour12: false })}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <a href={`/agents/${agent.id}`} style={{ ...actionBtn, background: 'var(--color-primary)', marginRight: 6 }}>编辑</a>
                    <button onClick={() => handleDelete(agent.id)} style={{ ...actionBtn, background: 'var(--color-danger)' }}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

      {copyCard && (
        <>
          <div onClick={() => setCopyCard(null)} style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 9999 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--bg-card)', borderRadius: 12, padding: 24, zIndex: 10000,
            width: 380, boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>复制卡片</h3>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>新名称</label>
            <input
              value={copyName}
              onChange={e => setCopyName(e.target.value)}
              autoFocus
              style={{
                width: '100%', padding: '8px 12px', fontSize: 14, boxSizing: 'border-box',
                border: '1px solid var(--border)', borderRadius: 6,
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setCopyCard(null)}
                style={{
                  padding: '8px 20px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 6,
                  cursor: 'pointer', background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                }}
              >取消</button>
              <button
                onClick={handleCopyCard}
                disabled={copying}
                style={{
                  padding: '8px 20px', fontSize: 14, border: 'none', borderRadius: 6,
                  cursor: copying ? 'not-allowed' : 'pointer',
                  background: 'var(--color-primary)', color: '#fff', opacity: copying ? 0.6 : 1,
                }}
              >{copying ? '复制中...' : '确认'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default AgentList
