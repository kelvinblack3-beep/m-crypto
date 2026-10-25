import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { corsMiddleware } from '../../src/middleware/cors'
import { errorHandler } from '../../src/middleware/error'
import { loggerMiddleware } from '../../src/middleware/logger'
import type { HonoEnv } from '../../src/env'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Mirror src/index.ts wiring (logger + cors + onError), then mount two
// test-only routes: one that succeeds and one that throws a non-HTTPException
// so we can deterministically exercise the success-log and error-log paths
// in the same pipeline. We call app.fetch directly (NOT SELF) so we control
// LOG_LEVEL per test.
function buildApp(logLevel: string) {
  const app = new Hono<HonoEnv>()
  app.use('*', loggerMiddleware)
  app.use('*', corsMiddleware)
  app.onError(errorHandler)

  app.get('/__test/ok', (c) => c.json({ ok: true }))
  app.get('/__test/throw', () => {
    throw new Error('database is on fire')
  })

  const bindings = { LOG_LEVEL: logLevel } as HonoEnv['Bindings']
  return {
    fetch: (path: string, init?: RequestInit) =>
      app.fetch(new Request(`http://localhost${path}`, init), bindings),
  }
}

describe('observability pipeline (logger + error middleware)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  describe('successful request', () => {
    it('produces exactly one structured log line on console.log', async () => {
      const app = buildApp('info')
      const res = await app.fetch('/__test/ok')

      expect(res.status).toBe(200)
      expect(errorSpy).not.toHaveBeenCalled()
      expect(logSpy).toHaveBeenCalledTimes(1)

      const [payload] = logSpy.mock.calls[0] as [string]
      expect(typeof payload).toBe('string')

      const parsed = JSON.parse(payload) as Record<string, unknown>
      expect(parsed.method).toBe('GET')
      expect(parsed.path).toBe('/__test/ok')
      expect(parsed.status).toBe(200)
      expect(typeof parsed.duration_ms).toBe('number')
      expect(parsed.duration_ms as number).toBeGreaterThanOrEqual(0)
      expect(typeof parsed.request_id).toBe('string')
      expect(parsed.request_id).toMatch(UUID_RE)
      expect(parsed.request_id).toBe(res.headers.get('X-Request-Id'))
      expect(typeof parsed.ts).toBe('string')
      expect(parsed.ts).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      )
    })
  })

  describe('errored request', () => {
    it('produces one error log via console.error with the same request_id', async () => {
      const app = buildApp('info')
      const res = await app.fetch('/__test/throw')

      expect(res.status).toBe(500)
      const headerRequestId = res.headers.get('X-Request-Id')
      expect(headerRequestId).toMatch(UUID_RE)

      // Error middleware emits exactly one console.error JSON line.
      expect(errorSpy).toHaveBeenCalledTimes(1)
      const [errPayload] = errorSpy.mock.calls[0] as [string]
      const errParsed = JSON.parse(errPayload) as Record<string, unknown>
      expect(errParsed.level).toBe('error')
      expect(errParsed.msg).toBe('unhandled_error')
      expect(errParsed.error).toBe('database is on fire')
      expect(errParsed.request_id).toBe(headerRequestId)

      // Logger middleware still emits its access log line; it must carry the
      // same request_id so success and error sides correlate.
      expect(logSpy).toHaveBeenCalledTimes(1)
      const [logPayload] = logSpy.mock.calls[0] as [string]
      const logParsed = JSON.parse(logPayload) as Record<string, unknown>
      expect(logParsed.status).toBe(500)
      expect(logParsed.path).toBe('/__test/throw')
      expect(logParsed.request_id).toBe(headerRequestId)

      // Same request_id across access log and error log.
      expect(errParsed.request_id).toBe(logParsed.request_id)
    })
  })

  describe('LOG_LEVEL="silent"', () => {
    it('suppresses both the access log and the error log', async () => {
      const app = buildApp('silent')

      const okRes = await app.fetch('/__test/ok')
      expect(okRes.status).toBe(200)

      const errRes = await app.fetch('/__test/throw')
      expect(errRes.status).toBe(500)

      expect(logSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })
})
