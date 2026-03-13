'use client'
import { useEffect, useState } from 'react'

type ToastItem = { id: number; msg: string; type: 'success' | 'error' | 'warn' | 'info' }

let _push: ((msg: string, type?: ToastItem['type']) => void) | null = null

export function toast(msg: string, type: ToastItem['type'] = 'info') {
  _push?.(msg, type)
}

export default function Toast() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    _push = (msg, type = 'info') => {
      const id = Date.now()
      setItems(p => [...p, { id, msg, type }])
      setTimeout(() => setItems(p => p.filter(t => t.id !== id)), 3500)
    }
    return () => { _push = null }
  }, [])

  if (!items.length) return null

  return (
    <div className="toast-container">
      {items.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
