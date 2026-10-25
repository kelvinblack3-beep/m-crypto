import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendNewlyEmail } from '../../src/email'

afterEach(() => vi.unstubAllGlobals())

describe('sendNewlyEmail', () => {
  it('posts to the Newly mailer with the project token', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'm1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await sendNewlyEmail(
      { NEWLY_EMAIL_URL: 'https://api.newly.app', NEWLY_EMAIL_TOKEN: 'nem_p.x' },
      { to: 'u@x.com', subject: 'Hi', text: 'Hello' },
    )
    expect(out).toEqual({ id: 'm1' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.newly.app/email/v1/send')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer nem_p.x')
    expect(JSON.parse(init.body as string)).toEqual({ to: 'u@x.com', subject: 'Hi', text: 'Hello' })
  })

  it('throws the mailer error code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'daily_email_limit_reached', message: 'x' }), { status: 429 })))
    await expect(
      sendNewlyEmail({ NEWLY_EMAIL_URL: 'u', NEWLY_EMAIL_TOKEN: 't' }, { to: 'a@b.co', subject: 's', text: 't' }),
    ).rejects.toThrow('daily_email_limit_reached')
  })

  it('throws email_not_configured when the platform has not injected email', async () => {
    await expect(sendNewlyEmail({}, { to: 'a@b.co', subject: 's', text: 't' })).rejects.toThrow('email_not_configured')
  })

  it('strips trailing slashes from the base URL', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'm1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await sendNewlyEmail({ NEWLY_EMAIL_URL: 'https://api.newly.app/', NEWLY_EMAIL_TOKEN: 't' }, { to: 'a@b.co', subject: 's', text: 't' })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://api.newly.app/email/v1/send')
  })

  it('includes the mailer message but never the token in the error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'sending_paused', message: 'paused by admin' }), { status: 403 })))
    const err = await sendNewlyEmail({ NEWLY_EMAIL_URL: 'u', NEWLY_EMAIL_TOKEN: 'sekret' }, { to: 'a@b.co', subject: 's', text: 't' }).catch((e) => e)
    expect(err.message).toBe('sending_paused: paused by admin')
    expect(err.message).not.toContain('sekret')
  })

  it('sends with a timeout signal and maps a timeout to email_unavailable', async () => {
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) => {
      throw new DOMException('timed out', 'TimeoutError')
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      sendNewlyEmail({ NEWLY_EMAIL_URL: 'u', NEWLY_EMAIL_TOKEN: 't' }, { to: 'a@b.co', subject: 's', text: 't' }),
    ).rejects.toThrow('email_unavailable')
    expect(fetchMock.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal)
  })

  it('maps a body-phase timeout to email_unavailable', async () => {
    const res = { ok: true, status: 200, json: async () => { throw new DOMException('t', 'TimeoutError') } }
    vi.stubGlobal('fetch', vi.fn(async () => res))
    await expect(
      sendNewlyEmail({ NEWLY_EMAIL_URL: 'u', NEWLY_EMAIL_TOKEN: 't' }, { to: 'a@b.co', subject: 's', text: 't' }),
    ).rejects.toThrow('email_unavailable')
  })

  it('keeps the original network error as cause', async () => {
    const cause = new TypeError('fetch failed')
    vi.stubGlobal('fetch', vi.fn(async () => { throw cause }))
    const err = await sendNewlyEmail({ NEWLY_EMAIL_URL: 'u', NEWLY_EMAIL_TOKEN: 't' }, { to: 'a@b.co', subject: 's', text: 't' }).catch((e) => e)
    expect(err.message).toBe('email_unavailable')
    expect(err.cause).toBe(cause)
  })
})
