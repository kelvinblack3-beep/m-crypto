import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { corsMiddleware } from '../../src/middleware/cors'
import { errorHandler } from '../../src/middleware/error'
import { loggerMiddleware } from '../../src/middleware/logger'
import type { HonoEnv } from '../../src/env'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SECRET_STACK_FRAME = '/src/secret/internals.ts'

const TEST_BINDINGS = { LOG_LEVEL: 'silent' } as HonoEnv['Bindings']

// Build a real app mirroring src/index.ts wiring (logger + cors + onError),
// then mount a test-only sub-app at /__test/throw so we can deterministically
// exercise the error pipeline. We call app.fetch directly (NOT SELF) so the
// test-only routes are attachable without round-tripping through the worker
// entrypoint.
function buildApp(thrower: () => unknown) {
  const app = new Hono<HonoEnv>()
  app.use('*', loggerMiddleware)
  app.use('*', corsMiddleware)
  app.onError(errorHandler)

  const testRoutes = new Hono<HonoEnv>()
  testRoutes.get('/__test/throw', () => {
    throw thrower()
  })
  app.route('/', testRoutes)

  return {
    fetch: (path: string, init?: RequestInit) =>
      app.fetch(new Request(`http://localhost${path}`, init), TEST_BINDINGS),
  }
}

describe('api-service error paths (app.fetch + side-channel /__test/throw)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
    logSpy.mockRestore()
  })

  describe('non-HTTPException', () => {
    it('returns 500 JSON with request_id', async () => {
      const app = buildApp(() => new Error('database is on fire'))

      const res = await app.fetch('/__test/throw')

      expect(res.status).toBe(500)
      expect(res.headers.get('Content-Type')).toMatch(/application\/json/)

      const requestIdHeader = res.headers.get('x-request-id')
      expect(requestIdHeader).toMatch(UUID_RE)

      const body = (await res.json()) as Record<string, unknown>
      expect(body).toEqual({
        error: 'internal server error',
        request_id: requestIdHeader,
      })
      expect(body.request_id).toMatch(UUID_RE)
    })
  })

  describe('HTTPException(400, "bad input")', () => {
    it('returns 400 with body "bad input"', async () => {
      const app = buildApp(
        () => new HTTPException(400, { message: 'bad input' }),
      )

      const res = await app.fetch('/__test/throw')

      expect(res.status).toBe(400)
      expect(await res.text()).toBe('bad input')
      expect(res.headers.get('x-request-id')).toMatch(UUID_RE)
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })

  describe('stack-trace leakage', () => {
    it('does not leak the stack trace into the response body', async () => {
      const err = new Error('database is on fire')
      err.stack =
        `Error: database is on fire\n    at ${SECRET_STACK_FRAME}:42:10\n` +
        `    at internalSecret (${SECRET_STACK_FRAME}:7:3)`
      const app = buildApp(() => err)

      const res = await app.fetch('/__test/throw')

      const rawBody = await res.text()
      expect(rawBody).not.toContain('Error: database is on fire')
      expect(rawBody).not.toContain(SECRET_STACK_FRAME)
      expect(rawBody).not.toContain('internalSecret')
      expect(rawBody).not.toContain('stack')
      expect(rawBody).not.toContain('database is on fire')

      const parsed = JSON.parse(rawBody) as Record<string, unknown>
      expect(parsed).not.toHaveProperty('stack')
      expect(parsed).not.toHaveProperty('error_detail')
      expect(parsed.error).toBe('internal server error')
      expect(parsed.request_id).toMatch(UUID_RE)
    })
  })
})
