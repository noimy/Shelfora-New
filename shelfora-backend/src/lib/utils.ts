// src/lib/utils.ts
// Shared utility functions used across pages and components.

export function fmtDate(d: Date | string | null): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function fmtDateTime(d: Date | string | null): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatCurrency(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

export function greetingFor(name: string): string {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return `Good ${part}, ${name.split(' ')[0]} 👋`
}

// Tailwind class merge utility (minimal version — use clsx + tailwind-merge in production)
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function daysBetween(a: Date | string, b: Date | string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

export function getReorderLabel(reorderDate: Date | null): string {
  if (!reorderDate) return '—'
  const diff = daysBetween(new Date(), reorderDate)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return fmtDate(reorderDate)
}
