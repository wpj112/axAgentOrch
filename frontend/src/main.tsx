import React from 'react'
import ReactDOM from 'react-dom/client'
import 'reactflow/dist/style.css'
import './themes.css'
import { ThemeProvider } from './ThemeContext'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
