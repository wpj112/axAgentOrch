import { BrowserRouter, Routes, Route } from 'react-router-dom'
import BrandMark from './components/BrandMark'
import AgentList from './pages/AgentList'
import AgentEditor from './pages/AgentEditor'
import Settings from './pages/Settings'

function App() {
  return (
    <BrowserRouter>
      <div style={{ width: '100%', margin: 0, padding: 16, minHeight: '100vh', background: '#0f1117', color: '#e0e0e0', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 16px' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'linear-gradient(180deg, rgba(96,165,250,0.16) 0%, rgba(96,165,250,0.08) 100%)',
              border: '1px solid rgba(96,165,250,0.16)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 22px rgba(0,0,0,0.22)',
            }}
          >
            <BrandMark size={30} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#e0e0e0', letterSpacing: 0.8 }}>AnXunAgentOrch</h1>
            <div style={{ marginTop: 2, fontSize: 11, color: '#60a5fa', letterSpacing: 0.6 }}>Agent Workflow Orchestration</div>
          </div>
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
