interface AgentFormProps {
  name: string
  description: string
  llmModel: string
  llmTemperature: string
  onChangeName: (v: string) => void
  onChangeDescription: (v: string) => void
  onChangeLlmModel: (v: string) => void
  onChangeLlmTemperature: (v: string) => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 14,
  border: '1px solid #2e3345', borderRadius: 6, boxSizing: 'border-box',
  background: '#252836', color: '#e0e0e0',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4,
  color: '#9ca3af',
}

function AgentForm({ name, description, llmModel, llmTemperature, onChangeName, onChangeDescription, onChangeLlmModel, onChangeLlmTemperature }: AgentFormProps) {
  return (
    <div style={{ border: '1px solid #2e3345', borderRadius: 10, padding: '16px 18px', background: '#1a1d29' }}>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>名称</label>
        <input value={name} onChange={(e) => onChangeName(e.target.value)} placeholder="智能体名称" style={inputStyle} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>描述</label>
        <textarea value={description} onChange={(e) => onChangeDescription(e.target.value)} placeholder="智能体描述（可选）" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      <details style={{ borderTop: '1px solid #2e3345', paddingTop: 12, fontSize: 12, color: '#8b8fa3' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 8, color: '#9ca3af' }}>LLM 覆盖（可选）</summary>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Model</label>
          <input value={llmModel} onChange={(e) => onChangeLlmModel(e.target.value)} placeholder="留空使用全局" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Temperature</label>
          <input value={llmTemperature} onChange={(e) => onChangeLlmTemperature(e.target.value)} placeholder="留空使用全局" style={inputStyle} />
        </div>
      </details>
    </div>
  )
}

export default AgentForm
