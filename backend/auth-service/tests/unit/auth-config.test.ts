import { afterEach, describe, expect, it, vi } from 'vitest'

// Avoid touching the real Neon driver / drizzle adapter during unit tests —
// we only care about how `createAuth` shapes its config from env vars.
const db = vi.hoisted(() => ({ appleRows: [] as { refreshToken: string | null }[] }))
vi.mock('../../src/db/client', () => ({
  createDb: vi.fn(() => ({
    __mock: 'db',
    select: () => ({ from: () => ({ where: async () => db.appleRows }) }),
  })),
  schema: {},
}))

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: vi.fn(() => ({ __mock: 'adapter' })),
}))

vi.mock('@better-auth/expo', () => ({
  expo: vi.fn(() => ({ id: 'expo' })),
}))

vi.mock('better-auth/plugins', () => ({
  jwt: vi.fn(() => ({ id: 'jwt' })),
}))

const capturedConfigs: any[] = []
vi.mock('better-auth', () => ({
  betterAuth: vi.fn((config: any) => {
    capturedConfigs.push(config)
    return {
      handler: async (_req: Request) => new Response('ok'),
      __config: config,
    }
  }),
}))

import { createAuth, type AuthEnv } from '../../src/auth'

const baseEnv: AuthEnv = {
  DATABASE_URL: 'postgres://test',
  BETTER_AUTH_SECRET: 'secret',
  BETTER_AUTH_URL: 'https://auth.test',
}

function lastConfig() {
  return capturedConfigs[capturedConfigs.length - 1]
}

describe('createAuth', () => {
  it('omits google from socialProviders when GOOGLE_CLIENT_ID is missing', () => {
    createAuth({ ...baseEnv, GOOGLE_CLIENT_SECRET: 'only-secret' })
    expect(lastConfig().socialProviders.google).toBeUndefined()
  })

  it('includes google when both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set', () => {
    createAuth({
      ...baseEnv,
      GOOGLE_CLIENT_ID: 'gid',
      GOOGLE_CLIENT_SECRET: 'gsecret',
    })
    expect(lastConfig().socialProviders.google).toEqual({
      clientId: 'gid',
      clientSecret: 'gsecret',
    })
  })

  it('omits apple from socialProviders when APPLE_CLIENT_ID is missing', () => {
    createAuth({ ...baseEnv, APPLE_CLIENT_SECRET: 'only-secret' })
    expect(lastConfig().socialProviders.apple).toBeUndefined()
  })

  it('trusts the platform preview origins, and never "*", when TRUSTED_ORIGINS is undefined', () => {
    createAuth({ ...baseEnv })
    expect(lastConfig().trustedOrigins).toEqual(
      expect.arrayContaining([
        'exp://',
        '*.newly.app',
        '*.newly-desktop-preview.pages.dev',
        '*.modal.host',
        'http://localhost:*',
      ]),
    )
    expect(lastConfig().trustedOrigins).not.toContain('*')
  })

  it('merges TRUSTED_ORIGINS with the platform origins instead of replacing them', () => {
    createAuth({ ...baseEnv, TRUSTED_ORIGINS: 'a.com, b.com' })
    expect(lastConfig().trustedOrigins).toEqual(
      expect.arrayContaining(['*.modal.host', 'a.com', 'b.com']),
    )
  })

  it('deduplicates an origin the project configured twice', () => {
    createAuth({ ...baseEnv, TRUSTED_ORIGINS: '*.modal.host, a.com, a.com' })
    const origins: string[] = lastConfig().trustedOrigins
    expect(origins.filter((o) => o === 'a.com')).toHaveLength(1)
    expect(origins.filter((o) => o === '*.modal.host')).toHaveLength(1)
  })

  it("trusts the app's own deep-link scheme from the expo-origin header", () => {
    createAuth(
      { ...baseEnv },
      new Request('https://auth.test/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'expo-origin': 'todoapp://' },
      }),
    )
    expect(lastConfig().trustedOrigins).toContain('todoapp://')
  })

  it('trims a deep-link origin that carries a path down to the scheme', () => {
    createAuth(
      { ...baseEnv },
      new Request('https://auth.test/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'expo-origin': 'exp://192.168.1.5:8081/--/' },
      }),
    )
    expect(lastConfig().trustedOrigins).toContain('exp://')
    expect(lastConfig().trustedOrigins).not.toContain('exp://192.168.1.5:8081/--/')
  })

  it('does NOT trust an http(s) origin just because the request carries one', () => {
    createAuth(
      { ...baseEnv },
      new Request('https://auth.test/api/auth/sign-in/email', {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      }),
    )
    expect(lastConfig().trustedOrigins).not.toContain('https://evil.example')
  })

  it('returns an object exposing a handler function', () => {
    const auth = createAuth({ ...baseEnv })
    expect(typeof auth.handler).toBe('function')
  })

  it('lets a signed-in user delete their own account, as both stores require', () => {
    createAuth({ ...baseEnv })
    expect(lastConfig().user.deleteUser.enabled).toBe(true)
  })

  describe('deleting an account signed in with Apple', () => {
    const appleEnv = { ...baseEnv, APPLE_CLIENT_ID: 'com.example.web', APPLE_CLIENT_SECRET: 'apple-jwt' }
    afterEach(() => {
      vi.unstubAllGlobals()
      db.appleRows = []
    })

    it("revokes the user's Apple refresh token at Apple's revoke endpoint", async () => {
      const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      db.appleRows = [{ refreshToken: 'r-apple' }]
      createAuth(appleEnv)
      await lastConfig().user.deleteUser.beforeDelete({ id: 'u1' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('https://appleid.apple.com/auth/revoke')
      expect(init.method).toBe('POST')
      expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
        client_id: 'com.example.web',
        client_secret: 'apple-jwt',
        token: 'r-apple',
        token_type_hint: 'refresh_token',
      })
    })

    it('calls Apple for nothing when the app has no Apple sign-in or no stored token', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      db.appleRows = [{ refreshToken: 'r-apple' }]
      createAuth(baseEnv)
      await lastConfig().user.deleteUser.beforeDelete({ id: 'u1' })
      db.appleRows = [{ refreshToken: null }]
      createAuth(appleEnv)
      await lastConfig().user.deleteUser.beforeDelete({ id: 'u1' })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('still deletes the account when Apple is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      db.appleRows = [{ refreshToken: 'r-apple' }]
      createAuth(appleEnv)
      await expect(lastConfig().user.deleteUser.beforeDelete({ id: 'u1' })).resolves.toBeUndefined()
    })
  })

  it('wires verification and reset emails when Newly email is injected', () => {
    createAuth({ ...baseEnv, NEWLY_EMAIL_URL: 'https://api.newly.app', NEWLY_EMAIL_TOKEN: 't' })
    const config = lastConfig()
    expect(typeof config.emailAndPassword.sendResetPassword).toBe('function')
    expect(typeof config.emailVerification.sendVerificationEmail).toBe('function')
    expect(config.emailVerification.sendOnSignUp).toBe(true)
    expect(config.emailAndPassword.requireEmailVerification).toBeUndefined()
  })

  it('sends branded html and text with the app name', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'e1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    createAuth({ ...baseEnv, NEWLY_EMAIL_URL: 'https://api.newly.app', NEWLY_EMAIL_TOKEN: 't', NEWLY_APP_NAME: 'Acme' })
    const config = lastConfig()
    await config.emailVerification.sendVerificationEmail({ user: { email: 'a@b.co' }, url: 'https://x/v' })
    await config.emailAndPassword.sendResetPassword({ user: { email: 'a@b.co' }, url: 'https://x/r' })
    const [verify, reset] = fetchMock.mock.calls.map((c: any) => JSON.parse(c[1].body))
    expect(verify).toMatchObject({ subject: 'Verify your email for Acme' })
    expect(verify.html).toContain('https://x/v')
    expect(verify.text).toContain('https://x/v')
    expect(reset.subject).toBe('Reset your Acme password')
  })

  it('leaves email hooks off without Newly email', () => {
    createAuth(baseEnv)
    const config = lastConfig()
    expect(config.emailAndPassword.sendResetPassword).toBeUndefined()
    expect(config.emailVerification).toBeUndefined()
  })
})
