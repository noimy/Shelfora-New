// src/lib/sms.ts
// Twilio SMS for critical stockout alerts.
// Pro/Enterprise plans only.

import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const fromNumber = process.env.TWILIO_FROM_NUMBER

export async function sendCriticalAlertSms(opts: {
  to: string
  businessName: string
  criticalCount: number
  lowCount: number
}) {
  if (!accountSid || !authToken || !fromNumber) {
    console.warn('[SMS] Twilio not configured — skipping SMS alert')
    return
  }

  const client = twilio(accountSid, authToken)

  const message = [
    `[Shelfora] ${opts.businessName}`,
    `🔴 ${opts.criticalCount} critical stock alert${opts.criticalCount !== 1 ? 's' : ''}`,
    opts.lowCount > 0 ? `🟡 ${opts.lowCount} low stock` : null,
    `View dashboard: ${process.env.NEXT_PUBLIC_URL}/reorders`,
  ]
    .filter(Boolean)
    .join('\n')

  return client.messages.create({
    body: message,
    from: fromNumber,
    to: opts.to,
  })
}

export async function sendTestSms(to: string) {
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio not configured')
  }
  const client = twilio(accountSid, authToken)
  return client.messages.create({
    body: '[Shelfora] Test SMS — your alerts are set up correctly!',
    from: fromNumber,
    to,
  })
}
