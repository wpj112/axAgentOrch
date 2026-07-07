import Editor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-json'
import 'prismjs/themes/prism-tomorrow.css'

const style: React.CSSProperties = {
  minHeight: 320,
  fontSize: 13,
  fontFamily: '"Fira Code", "JetBrains Mono", "Cascadia Code", Consolas, monospace',
  border: '1px solid var(--border)',
  borderRadius: 8,
  lineHeight: 1.6,
}

interface JsonEditorProps {
  value: string
  onChange: (value: string) => void
}

export default function JsonEditor({ value, onChange }: JsonEditorProps) {
  return (
    <Editor
      value={value}
      onValueChange={onChange}
      highlight={(code) => Prism.highlight(code, Prism.languages.json!, 'json')}
      padding={10}
      textareaClassName="json-editor-textarea"
      preClassName="json-editor-pre"
      style={style}
    />
  )
}
