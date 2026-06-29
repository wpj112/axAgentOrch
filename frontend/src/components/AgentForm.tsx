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
  border: '1px solid #2a3a5c', borderRadius: 6, boxSizing: 'border-box',
  background: '#0f1a30', color: '#e0e0e0',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4,
  color: '#b0bec5',
}

function AgentForm({ name, description, llmModel, llmTemperature, onChangeName, onChangeDescription, onChangeLlmModel, onChangeLlmTemperature }: AgentFormProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>名称</label>
        <input value={name} onChange={(e) => onChangeName(e.target.value)} placeholder="智能体名称" style={inputStyle} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>描述</label>
        <textarea value={description} onChange={(e) => onChangeDescription(e.target.value)} placeholder="智能体描述（可选）" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #2a3a5c' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#6a7a8a', marginBottom: 10 }}>LLM 覆盖（可选，留空使用全局设置）</div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Model</label>
          <input value={llmModel} onChange={(e) => onChangeLlmModel(e.target.value)} placeholder="留空使用全局" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Temperature</label>
          <input value={llmTemperature} onChange={(e) => onChangeLlmTemperature(e.target.value)} placeholder="留空使用全局" style={inputStyle} />
        </div>
      </div>
    </div>
  )
}

export default AgentForm
