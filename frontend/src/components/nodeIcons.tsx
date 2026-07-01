export const NODE_CONFIG: Record<string, { label: string; color: string }> = {
  start:   { label: '开始',   color: '#4caf50' },
  llm:     { label: 'LLM',    color: '#9c27b0' },
  http:    { label: 'HTTP',   color: '#2196f3' },
  db:      { label: '数据库', color: '#ff9800' },
  code:    { label: '代码',   color: '#795548' },
  if_else: { label: '条件',   color: '#e91e63' },
  loop:    { label: '循环',   color: '#00bcd4' },
  end:     { label: '结束',   color: '#f44336' },
}

interface NodeIconProps {
  type: string
  size?: number
  color?: string
}

export function NodeIcon({ type, size = 14, color }: NodeIconProps) {
  const s = size
  const c = color || 'currentColor'
  switch (type) {
    case 'start':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill={c}>
          <polygon points="3,1 14,8 3,15" />
        </svg>
      )
    case 'llm':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2.5c-2 0-3 1-3 2.5 0 1.5 1 2.5 2 3 0 1 .2 1.5-.5 2C5.5 11 4 10.5 3.5 9.5c-.5-1-1.5-2-2.5-1.5s-1 2 0 3c1 1 2 2 3.5 2.5s3 .5 3.5 1 .5 1 .5 1" />
          <path d="M8 2.5c2 0 3 1 3 2.5 0 1.5-1 2.5-2 3 0 1-.2 1.5.5 2C10.5 11 12 10.5 12.5 9.5c.5-1 1.5-2 2.5-1.5s1 2 0 3c-1 1-2 2-3.5 2.5s-3 .5-3.5 1-.5 1-.5 1" />
        </svg>
      )
    case 'http':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.3">
          <circle cx="8" cy="8" r="5.5" />
          <path d="M2.5 8h11M8 2.5c2 0 3.5 2.5 3.5 5.5S10 13.5 8 13.5 4.5 11 4.5 8 6 2.5 8 2.5z" />
        </svg>
      )
    case 'db':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.3">
          <ellipse cx="8" cy="3.5" rx="5.5" ry="1.8" />
          <path d="M2.5 3.5v7c0 1 2.5 1.8 5.5 1.8s5.5-.8 5.5-1.8v-7" />
          <line x1="2.5" y1="7" x2="13.5" y2="7" />
        </svg>
      )
    case 'code':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5" />
        </svg>
      )
    case 'if_else':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.3">
          <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" />
          <line x1="5" y1="8" x2="11" y2="8" strokeWidth="1" />
          <line x1="8" y1="5" x2="8" y2="11" strokeWidth="1" />
        </svg>
      )
    case 'loop':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.3">
          <path d="M11.5 3.5A5.5 5.5 0 1 0 11.5 12" />
          <polygon points="11.5,1.5 14,5 9,5" fill={c} stroke="none" />
        </svg>
      )
    case 'end':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.3" strokeLinecap="round">
          <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
          <line x1="5.5" y1="8" x2="10.5" y2="8" />
        </svg>
      )
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.3">
          <circle cx="8" cy="8" r="5.5" />
        </svg>
      )
  }
}
