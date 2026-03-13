// src/lib/email.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.EMAIL_FROM || 'Shelfora <alerts@shelfora.com>'

export async function sendReorderAlert(opts: {
  to: string
  businessName: string
  alerts: Array<{ productName: string; daysLeft: number; reorderQty: number; reorderBy: string }>
}) {
  const critical = opts.alerts.filter((a) => a.daysLeft <= 3)
  const low = opts.alerts.filter((a) => a.daysLeft > 3 && a.daysLeft <= 10)

  const html = `
  <!DOCTYPE html>
  <html>
  <head><meta charset="UTF-8"><style>
    body { font-family: -apple-system, sans-serif; background: #f5f5f3; margin: 0; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; max-width: 560px; margin: 0 auto; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    .header { background: #0a0a0a; color: white; padding: 28px 32px; }
    .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 4px; }
    .logo span { color: #4ade80; }
    .header p { color: #9a9a93; font-size: 13px; margin: 0; }
    .body { padding: 28px 32px; }
    h2 { font-size: 18px; margin: 0 0 20px; color: #0a0a0a; }
    .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
    .critical { color: #c0392b; }
    .low { color: #d4820a; }
    .item { padding: 12px 16px; border-radius: 8px; margin-bottom: 8px; font-size: 14px; }
    .item-critical { background: #fdf0ee; border-left: 3px solid #c0392b; }
    .item-low { background: #fef8ed; border-left: 3px solid #d4820a; }
    .item strong { display: block; font-weight: 600; color: #0a0a0a; margin-bottom: 2px; }
    .item span { color: #5c5c56; font-size: 13px; }
    .cta { display: block; background: #0a0a0a; color: white; text-decoration: none; text-align: center; padding: 14px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 24px; }
    .footer { padding: 20px 32px; border-top: 1px solid #f5f5f3; font-size: 12px; color: #9a9a93; }
  </style></head>
  <body>
    <div class="card">
      <div class="header">
        <div class="logo">Shelf<span>ora</span></div>
        <p>Inventory alert for ${opts.businessName}</p>
      </div>
      <div class="body">
        <h2>⚠️ Reorder alert — action needed</h2>
        ${critical.length > 0 ? `
        <div class="section-label critical">🔴 Critical — reorder immediately</div>
        ${critical.map((a) => `
        <div class="item item-critical">
          <strong>${a.productName}</strong>
          <span>Runs out in ${a.daysLeft} day(s) · Order ${a.reorderQty} units · Reorder by ${a.reorderBy}</span>
        </div>`).join('')}
        ` : ''}
        ${low.length > 0 ? `
        <div class="section-label low" style="margin-top:16px">🟡 Low stock — reorder soon</div>
        ${low.map((a) => `
        <div class="item item-low">
          <strong>${a.productName}</strong>
          <span>Runs out in ${a.daysLeft} day(s) · Order ${a.reorderQty} units · Reorder by ${a.reorderBy}</span>
        </div>`).join('')}
        ` : ''}
        <a class="cta" href="${process.env.NEXT_PUBLIC_URL}/dashboard">View dashboard →</a>
      </div>
      <div class="footer">
        You're receiving this because alerts are enabled for ${opts.businessName}.
        <a href="${process.env.NEXT_PUBLIC_URL}/settings">Manage alerts</a>
      </div>
    </div>
  </body>
  </html>`

  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `[Shelfora] ${critical.length > 0 ? '🔴 Critical stock alert' : '🟡 Low stock alert'} — ${opts.businessName}`,
    html,
  })
}

export async function sendVerificationEmail(opts: { to: string; name: string; token: string }) {
  const url = `${process.env.NEXT_PUBLIC_URL}/verify-email?token=${opts.token}`
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: 'Verify your Shelfora account',
    html: `
    <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:40px auto;padding:32px;background:#fff;border-radius:12px;border:1px solid #e8e8e4">
      <div style="font-size:22px;font-weight:700;margin-bottom:24px">Shelf<span style="color:#2d7a47">ora</span></div>
      <h2 style="font-size:20px;margin-bottom:8px">Verify your email</h2>
      <p style="color:#5c5c56;font-size:15px">Hi ${opts.name}, click below to verify your email address and activate your Shelfora account.</p>
      <a href="${url}" style="display:inline-block;background:#0a0a0a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:20px 0">Verify email →</a>
      <p style="color:#9a9a93;font-size:12px">Link expires in 24 hours. If you didn't sign up, ignore this email.</p>
    </div>`,
  })
}

export async function sendPasswordResetEmail(opts: { to: string; name: string; token: string }) {
  const url = `${process.env.NEXT_PUBLIC_URL}/reset-password?token=${opts.token}`
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: 'Reset your Shelfora password',
    html: `
    <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:40px auto;padding:32px;background:#fff;border-radius:12px;border:1px solid #e8e8e4">
      <div style="font-size:22px;font-weight:700;margin-bottom:24px">Shelf<span style="color:#2d7a47">ora</span></div>
      <h2 style="font-size:20px;margin-bottom:8px">Reset your password</h2>
      <p style="color:#5c5c56;font-size:15px">Hi ${opts.name}, we received a request to reset your password.</p>
      <a href="${url}" style="display:inline-block;background:#0a0a0a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:20px 0">Reset password →</a>
      <p style="color:#9a9a93;font-size:12px">Link expires in 1 hour. If you didn't request this, ignore this email.</p>
    </div>`,
  })
}

export async function sendWeeklyDigest(opts: {
  to: string
  businessName: string
  totalSales: number
  topProduct: string
  criticalCount: number
  lowCount: number
}) {
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `[Shelfora] Weekly digest — ${opts.businessName}`,
    html: `
    <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:40px auto;padding:32px;background:#fff;border-radius:12px;border:1px solid #e8e8e4">
      <div style="font-size:22px;font-weight:700;margin-bottom:24px">Shelf<span style="color:#2d7a47">ora</span></div>
      <h2>Your weekly inventory summary</h2>
      <div style="display:grid;gap:12px;margin:20px 0">
        <div style="background:#f5f5f3;padding:16px;border-radius:8px"><div style="font-size:12px;color:#9a9a93;text-transform:uppercase;font-weight:700;letter-spacing:.8px">Total units sold this week</div><div style="font-size:28px;font-weight:700;margin-top:4px">${opts.totalSales}</div></div>
        <div style="background:#f5f5f3;padding:16px;border-radius:8px"><div style="font-size:12px;color:#9a9a93;text-transform:uppercase;font-weight:700;letter-spacing:.8px">Top selling product</div><div style="font-size:18px;font-weight:700;margin-top:4px">${opts.topProduct}</div></div>
        <div style="background:#fdf0ee;padding:16px;border-radius:8px"><div style="font-size:12px;color:#c0392b;text-transform:uppercase;font-weight:700">Critical alerts</div><div style="font-size:24px;font-weight:700;color:#c0392b;margin-top:4px">${opts.criticalCount}</div></div>
      </div>
      <a href="${process.env.NEXT_PUBLIC_URL}/dashboard" style="display:inline-block;background:#0a0a0a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Open dashboard →</a>
    </div>`,
  })
}
