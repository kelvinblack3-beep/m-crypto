import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logEvent } from '../../src/observability'

describe('observability/logEvent', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  function parseSingleCall(spy: ReturnType<typeof vi.spyOn>) {
    expect(spy).toHaveBeenCalledTimes(1)
    const args = spy.mock.calls[0]!
    expect(args).toHaveLength(1)
    const payload = args[0]
    expect(typeof payload).toBe('string')
    return JSON.parse(payload as string)
  }

  describe('level routing', () => {
    it('routes level=info to console.log', () => {
      logEvent({ level: 'info', msg: 'hello' })
      expect(logSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('routes level=warn to console.warn', () => {
      logEvent({ level: 'warn', msg: 'careful' })
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(logSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('routes level=error to console.error', () => {
      logEvent({ level: 'error', msg: 'boom' })
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(logSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  describe('output format', () => {
    it('emits valid JSON with an ISO-format ts on info', () => {
      logEvent({ level: 'info', msg: 'hello' })
      const parsed = parseSingleCall(logSpy)
      expect(parsed.level).toBe('info')
      expect(parsed.msg).toBe('hello')
      expect(typeof parsed.ts).toBe('string')
      // ISO 8601 with milliseconds: 2024-01-02T03:04:05.678Z
      expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      // Round-trips through Date and serializes back to the same string.
      expect(new Date(parsed.ts).toISOString()).toBe(parsed.ts)
    })

    it('emits valid JSON with an ISO-format ts on warn', () => {
      logEvent({ level: 'warn', msg: 'careful' })
      const parsed = parseSingleCall(warnSpy)
      expect(parsed.level).toBe('warn')
      expect(parsed.msg).toBe('careful')
      expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('emits valid JSON with an ISO-format ts on error', () => {
      logEvent({ level: 'error', msg: 'boom' })
      const parsed = parseSingleCall(errorSpy)
      expect(parsed.level).toBe('error')
      expect(parsed.msg).toBe('boom')
      expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('uses the current time for ts', () => {
      const before = Date.now()
      logEvent({ level: 'info', msg: 'now' })
      const after = Date.now()
      const parsed = parseSingleCall(logSpy)
      const tsMs = new Date(parsed.ts).getTime()
      expect(tsMs).toBeGreaterThanOrEqual(before)
      expect(tsMs).toBeLessThanOrEqual(after)
    })
  })

  describe('optional fields', () => {
    it('includes request_id when provided', () => {
      logEvent({ level: 'info', msg: 'req', request_id: 'req-abc-123' })
      const parsed = parseSingleCall(logSpy)
      expect(parsed.request_id).toBe('req-abc-123')
    })

    it('includes duration_ms when provided', () => {
      logEvent({ level: 'info', msg: 'timed', duration_ms: 42 })
      const parsed = parseSingleCall(logSpy)
      expect(parsed.duration_ms).toBe(42)
    })

    it('includes meta when provided', () => {
      const meta = { user_id: 'u_1', path: '/widgets', count: 7 }
      logEvent({ level: 'info', msg: 'with meta', meta })
      const parsed = parseSingleCall(logSpy)
      expect(parsed.meta).toEqual(meta)
    })

    it('includes request_id, duration_ms, and meta together', () => {
      logEvent({
        level: 'error',
        msg: 'full payload',
        request_id: 'req-xyz',
        duration_ms: 1234,
        meta: { code: 500, route: '/boom' },
      })
      const parsed = parseSingleCall(errorSpy)
      expect(parsed).toMatchObject({
        level: 'error',
        msg: 'full payload',
        request_id: 'req-xyz',
        duration_ms: 1234,
        meta: { code: 500, route: '/boom' },
      })
      expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('omits optional fields when not provided', () => {
      logEvent({ level: 'info', msg: 'bare' })
      const parsed = parseSingleCall(logSpy)
      expect(parsed).not.toHaveProperty('request_id')
      expect(parsed).not.toHaveProperty('duration_ms')
      expect(parsed).not.toHaveProperty('meta')
    })
  })
})
