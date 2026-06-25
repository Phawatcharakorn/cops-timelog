'use client'
import { useState, useCallback, useEffect, useRef } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'
type ToastItem = { id: number; message: string; type: ToastType; exiting: boolean }

const BORDER: Record<ToastType, string> = {
  success: '#22c55e',
  error:   '#ef4444',
  info:    '#6366f1',
  warning: '#f59e0b',
}
const ICON: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warning: '⚠',
}

let _add: ((msg: string, type: ToastType) => void) | null = null

export function showToast(message: string, type: ToastType = 'info') {
  _add?.(message, type)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = ++nextId.current
    setToasts(prev => [...prev, { id, message, type, exiting: false }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 230)
    }, 3500)
  }, [])

  useEffect(() => {
    _add = addToast
    return () => { _add = null }
  }, [addToast])

  if (!toasts.length) return null
  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(24px + env(safe-area-inset-bottom))',
      right: 24,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column-reverse',
      gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: '#ffffff',
          border: '0.5px solid #e5e7eb',
          borderLeft: `3px solid ${BORDER[t.type]}`,
          borderRadius: 10,
          padding: '12px 16px',
          minWidth: 240,
          maxWidth: 320,
          fontSize: 14,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: 'var(--font-sarabun, sans-serif)',
          pointerEvents: 'auto',
          animation: t.exiting ? 'toastOut 0.22s ease forwards' : 'toastIn 0.28s ease forwards',
        }}>
          <span style={{ color: BORDER[t.type], fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
            {ICON[t.type]}
          </span>
          <span style={{ color: '#111827', lineHeight: 1.45 }}>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
