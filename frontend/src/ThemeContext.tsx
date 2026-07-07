import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchSettings, updateSettings } from './api/client'

interface ThemeContextValue {
  theme: string
  setTheme: (t: string) => void
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', setTheme: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    fetchSettings().then(s => {
      const t = s.theme || 'dark'
      setThemeState(t)
    }).catch(() => {})
  }, [])

  const setTheme = (t: string) => {
    setThemeState(t)
    updateSettings({ theme: t } as any).catch(() => {})
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
