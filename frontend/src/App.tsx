import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AgentList from './pages/AgentList'
import AgentEditor from './pages/AgentEditor'

function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: 16, minHeight: '100vh', background: '#121220', color: '#e0e0e0' }}>
        <h1 style={{ margin: '0 0 16px', fontSize: 24, color: '#90caf9' }}>AgentOrch</h1>
        <Routes>
          <Route path="/" element={<AgentList />} />
          <Route path="/agents/new" element={<AgentEditor />} />
          <Route path="/agents/:id" element={<AgentEditor />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
