interface AgentFormProps {
  name: string
  description: string
  onChangeName: (v: string) => void
  onChangeDescription: (v: string) => void
}

function AgentForm({ name, description, onChangeName, onChangeDescription }: AgentFormProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>名称</label>
        <input
          value={name}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder="智能体名称"
          style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>描述</label>
        <textarea
          value={description}
          onChange={(e) => onChangeDescription(e.target.value)}
          placeholder="智能体描述（可选）"
          rows={3}
          style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }}
        />
      </div>
    </div>
  )
}

export default AgentForm
