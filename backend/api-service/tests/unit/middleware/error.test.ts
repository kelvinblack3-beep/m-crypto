import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { errorHandler } from '../../../src/middleware/error'
import type { HonoEnv } from '../../../src/env'

const FIXED_REQUEST_ID = '11111111-1111-4111-8111-111111111111'

function buildApp(thrower: () => unknown) {
  const app = new Hono<HonoEnv>()
  app.use('*', async (c, next) => {
    c.set('requestId', FIXED_REQUEST_ID)
    await next()
  })
  app.get('/boom', () => {
    throw thrower()
  })
  app.onError(errorHandler)
  return {
    fetch: (path: string, init?: RequestInit) =>
      app.fetch(
        new Request(`http://localhost${path}`, init),
        { LOG_LEVEL: 'info' } as HonoEnv['Bindings'],
      ),
  }
}

describe('errorHandler', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  describe('HTTPException', () => {
    it('returns the response produced by HTTPException', async () => {
      const app = buildApp(
        () => new HTTPException(418, { message: 'short and stout' }),
      )

      const res = await app.fetch('/boom')

      expect(res.status).toBe(418)
      expect(await res.text()).toBe('short and stout')
    })

    it('honours a custom Response passed to HTTPException', async () => {
      const customRes = new Response(
        JSON.stringify({ error: 'forbidden', code: 'NO_ACCESS' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      )
      const app = buildApp(() => new HTTPException(403, { res: customRes }))

      const res = await app.fetch('/boom')

      expect(res.status).toBe(403)
      expect(res.headers.get('Content-Type')).toBe('application/json')
      expect(await res.json()).toEqual({ error: 'forbidden', code: 'NO_ACCESS' })
    })

    it('does not log via console.error for HTTPException', async () => {
      const app = buildApp(
        () => new HTTPException(404, { message: 'not found' }),
      )

      await app.fetch('/boom')

      expect(errorSpy).not.toHaveBeenCalled()
    })
  })

  describe('generic Error', () => {
    it('returns 500 JSON with error message and request_id', async () => {
      const app = buildApp(() => new Error('database is on fire'))

      const res = await app.fetch('/boom')

      expect(res.status).toBe(500)
      expect(res.headers.get('Content-Type')).toMatch(/application\/json/)
      const body = (await res.json()) as Record<string, unknown>
      expect(body).toEqual({
        error: 'internal server error',
        request_id: FIXED_REQUEST_ID,
      })
    })

    it('logs structured JSON to console.error including the stack trace', async () => {
      const err = new Error('database is on fire')
      err.stack = 'Error: database is on fire\n    at /src/secret/path.ts:42:10'
      const app = buildApp(() => err)

      await app.fetch('/boom')

      expect(errorSpy).toHaveBeenCalledTimes(1)
      const [payload] = errorSpy.mock.calls[0] as [string]
      expect(typeof payload).toBe('string')

      const parsed = JSON.parse(payload) as Record<string, unknown>
      expect(parsed.level).toBe('error')
      expect(parsed.msg).toBe('unhandled_error')
      expect(parsed.request_id).toBe(FIXED_REQUEST_ID)
      expect(parsed.error).toBe('database is on fire')
      expect(parsed.stack).toBe(err.stack)
      expect(typeof parsed.ts).toBe('string')
      expect(() => new Date(parsed.ts as string).toISOString()).not.toThrow()
    })

    it('does NOT leak the stack trace into the response body', async () => {
      const err = new Error('database is on fire')
      err.stack =
        'Error: database is on fire\n    at /src/secret/path.ts:42:10\n    at internalSecret (/src/internals.ts:7:3)'
      const app = buildApp(() => err)

      const res = await app.fetch('/boom')

      const rawBody = await res.text()
      expect(rawBody).not.toContain('Error: database is on fire')
      expect(rawBody).not.toContain('/src/secret/path.ts')
      expect(rawBody).not.toContain('internalSecret')
      expect(rawBody).not.toContain('stack')

      const parsed = JSON.parse(rawBody) as Record<string, unknown>
      expect(parsed).not.toHaveProperty('stack')
      expect(parsed).not.toHaveProperty('error_detail')
      expect(parsed).toEqual({
        error: 'internal server error',
        request_id: FIXED_REQUEST_ID,
      })
    })
  })
})
