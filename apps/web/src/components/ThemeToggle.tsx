'use client'

import { useEffect, useState } from 'react'

type Mode = 'dark' | 'light' | 'system'

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('system')

  useEffect(() => {
    const stored = localStorage.getItem('poe2-theme')
    if (stored === 'light' || stored === 'dark') setMode(stored)
  }, [])

  function apply(next: Mode) {
    setMode(next)
    if (next === 'system') {
      localStorage.removeItem('poe2-theme')
      document.documentElement.removeAttribute('data-theme')
    } else {
      localStorage.setItem('poe2-theme', next)
      document.documentElement.setAttribute('data-theme', next)
    }
  }

  const next: Mode = mode === 'dark' ? 'light' : mode === 'light' ? 'system' : 'dark'
  const label = mode === 'system' ? 'System theme' : mode === 'dark' ? 'Dark theme' : 'Light theme'

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      title={`${label} — click for ${next}`}
      aria-label={`${label}. Switch to ${next}.`}
      className="fixed top-3 right-3 z-40 rounded-full border border-line bg-surface-raised/80 px-3 py-1.5 text-xs text-ink-dim backdrop-blur transition-colors hover:text-ink"
    >
      {mode === 'system' ? 'Auto' : mode === 'dark' ? 'Dark' : 'Light'}
    </button>
  )
}
