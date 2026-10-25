import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { expo } from '@better-auth/expo'
import { jwt } from 'better-auth/plugins'
import { neon } from '@neondatabase/serverless'
import { and, eq } from 'drizzle-orm'
import { createDb } from './db/client'
import { account } from './db/schema'
import { sendNewlyEmail } from './email'
import { authEmail, type AuthEmailKind } from './emailTemplates'

export interface AuthEnv {
  DATABASE_URL: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  APPLE_CLIENT_ID?: string
  APPLE_CLIENT_SECRET?: string
  TRUSTED_ORIGINS?: string
  NEWLY_EMAIL_URL?: string
  NEWLY_EMAIL_TOKEN?: string
  NEWLY_APP_NAME?: string
}

/**
 * Origins the Newly platform itself serves app previews from. Better Auth
 * matches these as GLOBS, not regex. They are merged with — never replaced by —
 * `TRUSTED_ORIGINS`, so a project provisioned before a preview host existed
 * picks it up on its next deploy instead of failing with "Invalid origin".
 */
const PLATFORM_TRUSTED_ORIGINS = [
  'exp://',
  '*.newly.app',
  '*.newly.dev',
  '*.newly-desktop-preview.pages.dev',
  '*.modal.host',
  'http://localhost',
  'http://localhost:*',
]

const ANY_SCHEME = /^[a-z][a-z0-9.+-]*:\/\//i
const HTTP_SCHEME = /^https?:\/\//i

/**
 * The app's own deep-link origin (`myapp://`), read off the request the
 * `@better-auth/expo` client tags with `expo-origin`.
 *
 * Every Newly app picks its own scheme, so the scheme cannot be baked into
 * `TRUSTED_ORIGINS` at provisioning time. A per-request `trustedOrigins`
 * function is not enough either: the callbackURL check reads the static list
 * captured at `betterAuth()` init, and the expo client rewrites a relative
 * `callbackURL` into `myapp:///auth-callback` before sending it. The Worker
 * builds the auth instance per request, so the scheme goes in statically here.
 *
 * A browser can never send a non-http(s) `Origin`, so trusting the scheme the
 * request arrived with costs no CSRF protection.
 */
function appSchemeOrigin(request?: Request): string[] {
  const origin = request?.headers.get('expo-origin') ?? request?.headers.get('origin') ?? ''
  if (!ANY_SCHEME.test(origin) || HTTP_SCHEME.test(origin)) return []
  return [origin.slice(0, origin.indexOf('://') + 3)]
}

/**
 * App Store account deletion expects apps with Sign in with Apple to revoke the
 * user's Apple token (TN3194). The redirect sign-in stores Apple's refresh token,
 * so hand it back to Apple before Better Auth deletes the account row.
 */
async function revokeAppleTokens(env: AuthEnv, userId: string) {
  if (!env.APPLE_CLIENT_ID || !env.APPLE_CLIENT_SECRET) return
  const rows = await createDb(env.DATABASE_URL)
    .select({ refreshToken: account.refreshToken })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'apple')))
  for (const { refreshToken } of rows) {
    if (!refreshToken) continue
    const res = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.APPLE_CLIENT_ID,
        client_secret: env.APPLE_CLIENT_SECRET,
        token: refreshToken,
        token_type_hint: 'refresh_token',
      }),
    })
    if (!res.ok) console.error('apple token revoke failed', res.status, await res.text())
  }
}

export function createAuth(env: AuthEnv, request?: Request) {
  const socialProviders: Record<string, any> = {}
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
    socialProviders.apple = { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET }
  }
  const configuredOrigins = env.TRUSTED_ORIGINS
    ? env.TRUSTED_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const emailOn = Boolean(env.NEWLY_EMAIL_URL && env.NEWLY_EMAIL_TOKEN)
  // Better Auth logs and swallows send failures: sign-up and reset still succeed without the email.
  const send = (to: string, kind: AuthEmailKind, url: string) =>
    sendNewlyEmail(env, { to, ...authEmail(kind, { appName: env.NEWLY_APP_NAME ?? '', url }) }).then(() => undefined)
  return betterAuth({
    database: drizzleAdapter(createDb(env.DATABASE_URL), { provider: 'pg' }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      ...new Set([...PLATFORM_TRUSTED_ORIGINS, ...configuredOrigins, ...appSchemeOrigin(request)]),
    ],
    emailAndPassword: {
      enabled: true,
      ...(emailOn
        ? {
            sendResetPassword: ({ user, url }: { user: { email: string }; url: string }) =>
              send(user.email, 'reset', url),
          }
        : {}),
    },
    ...(emailOn
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendVerificationEmail: ({ user, url }: { user: { email: string }; url: string }) =>
              send(user.email, 'verify', url),
          },
        }
      : {}),
    // App Store (5.1.1(v)) and Google Play both require in-app account deletion;
    // Better Auth ships it off. It still demands the password or a fresh session.
    // A failed Apple revoke never blocks the deletion itself.
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await revokeAppleTokens(env, user.id).catch(() => console.error('apple revoke failed'))
          const sql = neon(env.DATABASE_URL)
          await sql.transaction([
            sql`DELETE FROM api.mtaa_posts WHERE author=${user.id}`,
            sql`DELETE FROM api.mtaa_reactions WHERE owner=${user.id}`,
            sql`UPDATE api.mtaa_profiles SET username='deleted-'||substr(md5(id),1,12),banned=true,contact_checked=false,role='user' WHERE id=${user.id}`,
          ])
        },
      },
    },
    socialProviders,
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, window: 60, max: 20 },
    plugins: [expo(), jwt({ jwt: { definePayload: ({ user, session }) => ({ sub: user.id, sessionId: session.id }) } })],
    advanced: {
      defaultCookieAttributes: { sameSite: 'none', secure: true, httpOnly: true },
    },
  })
}
