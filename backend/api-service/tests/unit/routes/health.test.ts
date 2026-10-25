import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { healthRoutes } from '../../../src/routes/health'
import type { HonoEnv } from '../../../src/env'

function buildApp(bindings: Partial<HonoEnv['Bindings']> = {}) {
  const app = new Hono<HonoEnv>()
  app.route('/', healthRoutes)
  return {
    request: (path: string, init?: RequestInit) =>
      app.request(path, init, bindings as HonoEnv['Bindings']),
  }
}

describe('healthRoutes', () => {
  it('GET /health returns 200', async () => {
    const app = buildApp()
    const res = await app.request('/health')

    expect(res.status).toBe(200)
  })

  it('GET /health returns JSON with status "ok"', async () => {
    const app = buildApp()
    const res = await app.request('/health')

    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.status).toBe('ok')
  })

  it('does not require any auth header', async () => {
    const app = buildApp()
    const res = await app.request('/health')

    expect(res.status).toBe(200)
    // Sanity check: the same request without an Authorization header succeeds.
    const body = (await res.json()) as Record<string, unknown>
    expect(body.status).toBe('ok')
  })

  it('echoes NEWLY_PROJECT_ID and NEWLY_ENV from bindings when set', async () => {
    const app = buildApp({
      NEWLY_ENV: 'dev',
      // NEWLY_PROJECT_ID is not part of the typed Bindings but the route reads it.
      ...({ NEWLY_PROJECT_ID: 'proj_123' } as Partial<HonoEnv['Bindings']>),
    })
    const res = await app.request('/health')

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.status).toBe('ok')
    expect(body.project_id).toBe('proj_123')
    expect(body.env).toBe('dev')
  })

  it('falls back to empty strings when project_id and env bindings are absent', async () => {
    const app = buildApp()
    const res = await app.request('/health')

    const body = (await res.json()) as Record<string, unknown>
    expect(body.project_id).toBe('')
    expect(body.env).toBe('')
  })
})
