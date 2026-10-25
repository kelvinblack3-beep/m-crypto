import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Tests for the GET /me route: it answers with the identity the verified token
 * carries (user id and email), with no database read. The auth middleware is
 * mocked so each test drives the claims directly.
 */

let nextUserId: string | null = 'user_123'
let nextEmail: string | undefined = 'alice@example.test'

vi.mock('../../../src/middleware/auth', () => {
  return {
    authMiddleware: async (
      c: {
        json: (body: unknown, status?: number) => Response
        set: (key: 'userId' | 'email', value: string) => void
      },
      next: () => Promise<void>,
    ) => {
      if (!nextUserId) return c.json({ error: 'unauthorized' }, 401)
      c.set('userId', nextUserId)
      if (nextEmail !== undefined) c.set('email', nextEmail)
      await next()
    },
  }
})

import { meRoutes } from '../../../src/routes/me'
import type { HonoEnv } from '../../../src/env'

const BINDINGS = {
  NEWLY_ENV: 'test',
  LOG_LEVEL: 'silent',
} as unknown as HonoEnv['Bindings']

function request(init?: RequestInit) {
  const app = new Hono<HonoEnv>()
  app.route('/', meRoutes)
  return app.request('/me', init, BINDINGS)
}

describe('GET /me', () => {
  beforeEach(() => {
    nextUserId = 'user_123'
    nextEmail = 'alice@example.test'
  })

  it('returns 401 when the middleware rejects the token', async () => {
    nextUserId = null

    const res = await request()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('returns the user id and email from the verified token', async () => {
    const res = await request({ headers: { Authorization: 'Bearer good-token' } })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user_id: 'user_123', email: 'alice@example.test' })
  })

  it('omits email when the token carries none', async () => {
    nextEmail = undefined

    const res = await request({ headers: { Authorization: 'Bearer good-token' } })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user_id: 'user_123' })
  })
})
