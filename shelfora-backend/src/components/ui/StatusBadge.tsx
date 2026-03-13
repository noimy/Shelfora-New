// src/components/ui/StatusBadge.tsx
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    red: ['badge badge-red', 'Critical'],
    amber: ['badge badge-amber', 'Low Stock'],
    green: ['badge badge-green', 'Healthy'],
    ACTIVE: ['badge badge-green', 'Active'],
    ARCHIVED: ['badge badge-gray', 'Archived'],
    LOW_STOCK: ['badge badge-amber', 'Low Stock'],
    OUT_OF_STOCK: ['badge badge-red', 'Out of Stock'],
  }
  const [cls, label] = map[status] || ['badge badge-gray', status]
  return <span className={cls}>{label}</span>
}

// src/components/ui/DaysBar.tsx — inline below
export function DaysBar({ days, max = 30, status }: { days: number; max?: number; status: string }) {
  const pct = Math.min(100, (days / max) * 100)
  const color = status === 'red' ? 'var(--red)' : status === 'amber' ? 'var(--amber)' : 'var(--accent-light)'
  return (
    <div className="days-bar">
      <div className="days-bar-track">
        <div className="days-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="days-bar-num" style={{ color }}>{days}d</span>
    </div>
  )
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, border: '2px solid var(--gray-100)',
      borderTop: '2px solid var(--gray-400)', borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}
