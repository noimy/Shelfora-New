// src/lib/rateLimit.ts
// Simple in-memory rate limiter.
// For production, replace with Upstash Redis: https://upstash.com

interface RateLimitEntry {
  count: number
  resetAt: number
}

function createLimiter(max: number, windowMs: number) {
  const store = new Map<string, RateLimitEntry>()

  return {
    check(ip: string): { success: boolean; remaining: number } {
      const now = Date.now()
      const entry = store.get(ip)

      if (!entry || entry.resetAt < now) {
        store.set(ip, { count: 1, resetAt: now + windowMs })
        return { success: true, remaining: max - 1 }
      }

      if (entry.count >= max) {
        return { success: false, remaining: 0 }
      }

      entry.count++
      return { success: true, remaining: max - entry.count }
    },
    reset(ip: string) {
      store.delete(ip)
    },
  }
}

// 10 login attempts per 15 minutes per IP
export const authLimiter = createLimiter(10, 15 * 60 * 1000)

// 5 signups per hour per IP
export const signupLimiter = createLimiter(5, 60 * 60 * 1000)

// 5 password reset requests per hour per IP
export const forgotPasswordLimiter = createLimiter(5, 60 * 60 * 1000)

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}
