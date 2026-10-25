import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendEmail, subscribeContact, NewlyEmailError } from '../../../src/platform/email'
import { subscribeContact as fromBarrel } from '../../../src/platform'

afterEach(() => vi.unstubAllGlobals())

const env = (o: object = {}) => ({ NEWLY_EMAIL_URL: 'u', NEWLY_EMAIL_TOKEN: 't', ...o }) as any

describe('sendEmail', () => {
  it('posts to the Newly mailer with the project token', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'm1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await sendEmail(env({ NEWLY_EMAIL_URL: 'https://api.newly.app', NEWLY_EMAIL_TOKEN: 'nem_p.x' }), {
      to: 'u@x.com',
      subject: 'Hi',
      text: 'Hello',
    })
    expect(out).toEqual({ id: 'm1' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.newly.app/email/v1/send')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer nem_p.x')
    expect(JSON.parse(init.body as string)).toEqual({ to: 'u@x.com', subject: 'Hi', text: 'Hello' })
  })

  it('throws the mailer error code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'daily_email_limit_reached', message: 'x' }), { status: 429 })))
    await expect(sendEmail(env(), { to: 'a@b.co', subject: 's', text: 't' })).rejects.toThrow('x')
  })

  it('throws email_not_configured when the platform has not injected email', async () => {
    const err = await sendEmail({} as any, { to: 'a@b.co', subject: 's', text: 't' }).catch((e) => e)
    expect(err).toBeInstanceOf(NewlyEmailError)
    expect(err.code).toBe('email_not_configured')
  })

  it('exposes the error code on NewlyEmailError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'sending_paused', message: 'x' }), { status: 403 })))
    const err = await sendEmail(env(), { to: 'a@b.co', subject: 's', text: 't' }).catch((e) => e)
    expect(err).toBeInstanceOf(NewlyEmailError)
    expect(err.code).toBe('sending_paused')
  })

  it('strips trailing slashes from the base URL', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'm1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await sendEmail(env({ NEWLY_EMAIL_URL: 'https://api.newly.app/' }), { to: 'a@b.co', subject: 's', text: 't' })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://api.newly.app/email/v1/send')
  })

  it('sends with a timeout signal and maps a timeout to email_unavailable', async () => {
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) => {
      throw new DOMException('timed out', 'TimeoutError')
    })
    vi.stubGlobal('fetch', fetchMock)
    const err = await sendEmail(env(), { to: 'a@b.co', subject: 's', text: 't' }).catch((e) => e)
    expect(err).toBeInstanceOf(NewlyEmailError)
    expect(err.code).toBe('email_unavailable')
    expect(fetchMock.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal)
  })

  it('maps a body-phase timeout to email_unavailable', async () => {
    const res = { ok: true, status: 200, json: async () => { throw new DOMException('t', 'TimeoutError') } }
    vi.stubGlobal('fetch', vi.fn(async () => res))
    const err = await sendEmail(env(), { to: 'a@b.co', subject: 's', text: 't' }).catch((e) => e)
    expect(err).toBeInstanceOf(NewlyEmailError)
    expect(err.code).toBe('email_unavailable')
    expect(err.message).toBe('The email service did not respond in time.')
  })

  it('uses a neutral message and keeps the cause for non-timeout rejections', async () => {
    const cause = new TypeError('fetch failed')
    vi.stubGlobal('fetch', vi.fn(async () => { throw cause }))
    const err = await sendEmail(env(), { to: 'a@b.co', subject: 's', text: 't' }).catch((e) => e)
    expect(err.code).toBe('email_unavailable')
    expect(err.message).toBe('The email service could not be reached.')
    expect(err.cause).toBe(cause)
  })
})

describe('subscribeContact', () => {
  const ok = () => vi.fn(async (_u: string, _i: RequestInit) => new Response(JSON.stringify({ status: 'pending', confirmation: 'sent' }), { status: 200 }))

  it('posts a prod contact from a prod backend and returns the status', async () => {
    const fetchMock = ok()
    vi.stubGlobal('fetch', fetchMock)
    const out = await subscribeContact(env({ NEWLY_EMAIL_URL: 'https://api.newly.app/', NEWLY_EMAIL_TOKEN: 'nem_p.x', NEWLY_ENV: 'prod' }), {
      email: 'ann@example.com',
      topics: ['updates'],
      source: 'signup_checkbox',
      ip: '203.0.113.9',
    })
    expect(out).toEqual({ status: 'pending', confirmation: 'sent' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.newly.app/email/v1/contacts')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer nem_p.x')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'ann@example.com',
      topics: ['updates'],
      source: 'signup_checkbox',
      ip: '203.0.113.9',
      environment: 'prod',
    })
  })

  it('files contacts from any other environment under test and defaults the source to api', async () => {
    const fetchMock = ok()
    vi.stubGlobal('fetch', fetchMock)
    await subscribeContact(env({ NEWLY_ENV: 'dev' }), { email: 'a@b.co' })
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ email: 'a@b.co', source: 'api', environment: 'test' })
  })

  it('throws the mailer error code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'rate_limited', message: 'slow down' }), { status: 429 })))
    const err = await subscribeContact(env(), { email: 'a@b.co' }).catch((e) => e)
    expect(err).toBeInstanceOf(NewlyEmailError)
    expect(err.code).toBe('rate_limited')
  })

  it('throws email_not_configured and email_unavailable like sendEmail', async () => {
    expect((await subscribeContact({} as any, { email: 'a@b.co' }).catch((e) => e)).code).toBe('email_not_configured')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    expect((await subscribeContact(env(), { email: 'a@b.co' }).catch((e) => e)).code).toBe('email_unavailable')
  })

  it('is exported from the platform barrel', () => {
    expect(fromBarrel).toBe(subscribeContact)
  })
})
