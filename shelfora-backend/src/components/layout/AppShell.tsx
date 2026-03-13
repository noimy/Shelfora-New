'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import Toast from '../ui/Toast'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [business, setBusiness] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => {
        if (!r.ok) { router.push('/login'); return null }
        return r.json()
      })
      .then(d => {
        if (d) { setUser(d.user); setBusiness(d.business) }
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false))
  }, [router])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ fontFamily: 'var(--font-d)', fontSize: 24, color: 'var(--gray-400)' }}>Loading…</div>
    </div>
  )

  if (!user) return null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--gray-50)' }}>
      <Sidebar user={user} business={business} />
      <main style={{ flex: 1, padding: '36px 40px', overflowY: 'auto', minWidth: 0 }}>
        {children}
      </main>
      <Toast />
    </div>
  )
}
