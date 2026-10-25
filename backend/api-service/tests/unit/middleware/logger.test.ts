import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loggerMiddleware } from '../../../src/middleware/logger'
import type { HonoEnv } from '../../../src/env'

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function buildApp(logLevel: string) {
  const app = new Hono<HonoEnv>()
  app.use('*', loggerMiddleware)
  app.get('/hello', (c) => c.text('ok'))
  app.get('/boom', (c) => {
    c.status(500)
    return c.text('boom')
  })
  return {
    fetch: (path: string, init?: RequestInit) =>
      app.fetch(
        new Request(`http://localhost${path}`, init),
        { LOG_LEVEL: logLevel } as HonoEnv['Bindings'],
      ),
  }
}

describe('loggerMiddleware', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    vi.useRealTimers()
  })

  it('sets X-Request-Id response header with a uuid v4', async () => {
    const app = buildApp('silent')
    const res = await app.fetch('/hello')

    const requestId = res.headers.get('X-Request-Id')
    expect(requestId).not.toBeNull()
    expect(requestId).toMatch(UUID_V4_REGEX)
  })

  it('suppresses console.log when LOG_LEVEL="silent"', async () => {
    const app = buildApp('silent')
    const res = await app.fetch('/hello')

    expect(res.status).toBe(200)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('calls console.log with JSON containing method/path/status/duration_ms/request_id when LOG_LEVEL="info"', async () => {
    const app = buildApp('info')
    const res = await app.fetch('/hello')

    expect(res.status).toBe(200)
    expect(logSpy).toHaveBeenCalledTimes(1)

    const [payload] = logSpy.mock.calls[0] as [string]
    expect(typeof payload).toBe('string')

    const parsed = JSON.parse(payload) as Record<string, unknown>
    expect(parsed.method).toBe('GET')
    expect(parsed.path).toBe('/hello')
    expect(parsed.status).toBe(200)
    expect(typeof parsed.duration_ms).toBe('number')
    expect(parsed.duration_ms as number).toBeGreaterThanOrEqual(0)
    expect(typeof parsed.request_id).toBe('string')
    expect(parsed.request_id).toMatch(UUID_V4_REGEX)
    expect(parsed.request_id).toBe(res.headers.get('X-Request-Id'))
  })

  it('logs the actual response status (e.g. 500) under LOG_LEVEL="info"', async () => {
    const app = buildApp('info')
    const res = await app.fetch('/boom')

    expect(res.status).toBe(500)
    expect(logSpy).toHaveBeenCalledTimes(1)

    const [payload] = logSpy.mock.calls[0] as [string]
    const parsed = JSON.parse(payload) as Record<string, unknown>
    expect(parsed.status).toBe(500)
    expect(parsed.path).toBe('/boom')
  })

  it('emits a uuid v4 request id', async () => {
    const app = buildApp('info')
    const res = await app.fetch('/hello')

    const headerId = res.headers.get('X-Request-Id')
    expect(headerId).toMatch(UUID_V4_REGEX)

    const [payload] = logSpy.mock.calls[0] as [string]
    const parsed = JSON.parse(payload) as { request_id: string }
    expect(parsed.request_id).toMatch(UUID_V4_REGEX)
  })

  it('reports duration_ms >= 0 (non-negative)', async () => {
    const app = buildApp('info')
    await app.fetch('/hello')

    const [payload] = logSpy.mock.calls[0] as [string]
    const parsed = JSON.parse(payload) as { duration_ms: number }
    expect(Number.isFinite(parsed.duration_ms)).toBe(true)
    expect(parsed.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('generates a fresh request id per request', async () => {
    const app = buildApp('silent')
    const a = await app.fetch('/hello')
    const b = await app.fetch('/hello')

    const idA = a.headers.get('X-Request-Id')
    const idB = b.headers.get('X-Request-Id')
    expect(idA).toMatch(UUID_V4_REGEX)
    expect(idB).toMatch(UUID_V4_REGEX)
    expect(idA).not.toBe(idB)
  })
})
