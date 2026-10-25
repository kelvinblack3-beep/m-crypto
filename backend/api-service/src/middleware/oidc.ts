import type { MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { HonoEnv } from '../env'
import { rejectToken } from './auth'

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null

function googleJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJwks) return cachedJwks
  cachedJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), {
    cacheMaxAge: 600_000,
    cooldownDuration: 30_000,
  })
  return cachedJwks
}

export function _resetGoogleJwksCacheForTests(): void {
  cachedJwks = null
}

/**
 * Bearer-token middleware that verifies a Google OIDC id_token signed
 * by Google's JWKS and matched against the allowed service-account
 * emails (NEWLY_SCHEDULER_SA, NEWLY_TASKS_SA). When NEWLY_API_BASE is
 * set, the token's `aud` claim must match it.
 *
 * On success, sets `c.var.userId` to the verified email. A token that
 * fails verification gets a flat 401 with no detail: the caller is always
 * a service account, so detailed errors here would only leak to whoever
 * is probing. Failing to fetch Google's keys is a retryable 503.
 *
 * Used by the internal cron / task dispatch routes, both of which accept
 * calls from Newly-managed scheduler and task workers.
 */
export const oidcMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401)
  const token = auth.slice(7).trim()
  if (!token) return c.json({ error: 'unauthorized' }, 401)

  const env = c.env as HonoEnv['Bindings'] & {
    NEWLY_API_BASE?: string
    NEWLY_SCHEDULER_SA?: string
    NEWLY_TASKS_SA?: string
  }
  const allowed = [env.NEWLY_SCHEDULER_SA, env.NEWLY_TASKS_SA].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  )
  if (allowed.length === 0) return c.json({ error: 'unauthorized' }, 401)

  try {
    const verifyOpts: Parameters<typeof jwtVerify>[2] = {}
    if (env.NEWLY_API_BASE) verifyOpts.audience = env.NEWLY_API_BASE
    const { payload } = await jwtVerify(token, googleJwks(), verifyOpts)
    if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss as string)) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    const email = typeof payload.email === 'string' ? payload.email : null
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true'
    if (!email || !emailVerified) return c.json({ error: 'unauthorized' }, 401)
    if (!allowed.includes(email)) return c.json({ error: 'unauthorized' }, 401)
    c.set('userId', email)
  } catch (err) {
    return rejectToken(c, err, 'oidc')
  }
  await next()
}
