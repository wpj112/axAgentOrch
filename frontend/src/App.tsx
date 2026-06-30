import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AgentList from './pages/AgentList'
import AgentEditor from './pages/AgentEditor'
import Settings from './pages/Settings'

function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: 16, minHeight: '100vh', background: '#121220', color: '#e0e0e0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 16px' }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="9" cy="9" r="4.5" stroke="#90caf9" strokeWidth="1.8" fill="none"/>
            <circle cx="19" cy="9" r="4.5" stroke="#90caf9" strokeWidth="1.8" fill="none"/>
            <circle cx="14" cy="21" r="4.5" stroke="#90caf9" strokeWidth="1.8" fill="none"/>
            <line x1="12.5" y1="10.8" x2="10.5" y2="17.2" stroke="#90caf9" strokeWidth="1.4" opacity="0.7"/>
            <line x1="15.5" y1="10.8" x2="17.5" y2="17.2" stroke="#90caf9" strokeWidth="1.4" opacity="0.7"/>
            <line x1="13.5" y1="9" x2="18.5" y2="9" stroke="#90caf9" strokeWidth="1.4" opacity="0.5"/>
          </svg>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#e0e0e0', letterSpacing: 1 }}>AnXunAgentOrch</h1>
        </div>
        <Routes>
          <Route path="/" element={<AgentList />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/agents/new" element={<AgentEditor />} />
          <Route path="/agents/:id" element={<AgentEditor />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
