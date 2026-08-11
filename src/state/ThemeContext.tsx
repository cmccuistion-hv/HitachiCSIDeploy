import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemePalette = 'coe' | 'blue'
export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'hitachi-csi-wizard-theme'

type StoredTheme = {
  palette: ThemePalette
  mode: ThemeMode
}

type ThemeContextValue = {
  palette: ThemePalette
  mode: ThemeMode
  setPalette: (palette: ThemePalette) => void
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void
  /** True when header uses a light surface (needs dark logo / dark ghost buttons) */
  headerLight: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStored(): StoredTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredTheme>
      const palette = parsed.palette === 'blue' ? 'blue' : 'coe'
      const mode = parsed.mode === 'dark' ? 'dark' : 'light'
      return { palette, mode }
    }
  } catch {
    /* ignore */
  }
  return { palette: 'coe', mode: 'light' }
}

function applyDom(palette: ThemePalette, mode: ThemeMode) {
  const root = document.documentElement
  root.dataset.palette = palette
  root.dataset.mode = mode
  root.style.colorScheme = mode
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [{ palette, mode }, setTheme] = useState<StoredTheme>(() => {
    if (typeof window === 'undefined') return { palette: 'coe', mode: 'light' }
    const initial = readStored()
    applyDom(initial.palette, initial.mode)
    return initial
  })

  useEffect(() => {
    applyDom(palette, mode)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ palette, mode }))
  }, [palette, mode])

  const setPalette = useCallback((next: ThemePalette) => {
    setTheme((t) => ({ ...t, palette: next }))
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    setTheme((t) => ({ ...t, mode: next }))
  }, [])

  const toggleMode = useCallback(() => {
    setTheme((t) => ({ ...t, mode: t.mode === 'dark' ? 'light' : 'dark' }))
  }, [])

  const headerLight = mode === 'light' && palette === 'coe'

  const value = useMemo(
    () => ({ palette, mode, setPalette, setMode, toggleMode, headerLight }),
    [palette, mode, setPalette, setMode, toggleMode, headerLight],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
