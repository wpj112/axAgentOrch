import type { AgentNode } from '../api/client'
import { NODE_CONFIG } from './nodeIcons'

export type VariableSelectorValue = {
  nodeId: string
  field: string
}

interface VariableSelectorProps {
  nodes: AgentNode[]
  currentNodeId?: string | null
  value: VariableSelectorValue
  onChange: (value: VariableSelectorValue) => void
  disabled?: boolean
  allowDirectUpstream?: boolean
  directUpstreamLabel?: string
  fieldPlaceholder?: string
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #2e3345',
  borderRadius: 6, boxSizing: 'border-box', background: '#252836', color: '#e0e0e0',
}

const fieldHints: Record<AgentNode['type'], Array<{ path: string; label: string }>> = {
  start: [{ path: 'status', label: '状态' }],
  end: [{ path: 'status', label: '状态' }],
  llm: [{ path: 'text', label: '文本结果' }],
  http: [
    { path: 'result', label: '文本结果' },
    { path: 'data', label: '返回数据' },
  ],
  db: [
    { path: 'result', label: '查询结果' },
    { path: 'rows', label: '结果行' },
  ],
  code: [{ path: 'result', label: '执行结果' }],
  if_else: [
    { path: 'matched_case', label: '命中分支' },
    { path: 'matched_case_key', label: '命中分支Key' },
  ],
  loop: [{ path: 'iterations', label: '循环次数' }],
}

export function getRecommendedOutputField(nodeType?: AgentNode['type']) {
  if (!nodeType) return 'text'
  return fieldHints[nodeType]?.[0]?.path || 'text'
}

function isCommonField(field: string) {
  return ['', 'text', 'result', 'data', 'status', 'matched_case', 'matched_case_key', 'iterations'].includes(field)
}

function VariableSelector({
  nodes,
  currentNodeId,
  value,
  onChange,
  disabled,
  allowDirectUpstream,
  directUpstreamLabel = '使用直接上游输出',
  fieldPlaceholder = 'text / result / data.score',
}: VariableSelectorProps) {
  const availableNodes = nodes.filter((node) => node.id && node.id !== currentNodeId)
  const selectedNode = availableNodes.find((node) => node.id === value.nodeId)
  const hints = selectedNode ? fieldHints[selectedNode.type] || [] : []

  const handleNodeChange = (nodeId: string) => {
    const node = availableNodes.find((item) => item.id === nodeId)
    const recommendedField = getRecommendedOutputField(node?.type)
    onChange({
      nodeId,
      field: isCommonField(value.field) ? recommendedField : value.field,
    })
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <select value={value.nodeId} onChange={(e) => handleNodeChange(e.target.value)} style={inputStyle} disabled={disabled}>
        {allowDirectUpstream && <option value="">{directUpstreamLabel}</option>}
        {!allowDirectUpstream && <option value="">请选择来源节点</option>}
        {availableNodes.map((node) => (
          <option key={node.id} value={node.id}>{node.label} ({NODE_CONFIG[node.type]?.label || node.type})</option>
        ))}
      </select>
      <div style={{ display: 'grid', gridTemplateColumns: hints.length ? 'minmax(0, 1fr) 112px' : 'minmax(0, 1fr)', gap: 8 }}>
        <input
          value={value.field}
          onChange={(e) => onChange({ ...value, field: e.target.value })}
          placeholder={fieldPlaceholder}
          style={inputStyle}
          disabled={disabled || (!allowDirectUpstream && !value.nodeId)}
        />
        {hints.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && onChange({ ...value, field: e.target.value })}
            style={inputStyle}
            disabled={disabled}
            title="插入推荐字段"
          >
            <option value="">推荐字段</option>
            {hints.map((hint) => (
              <option key={hint.path} value={hint.path}>{hint.path}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

export default VariableSelector
