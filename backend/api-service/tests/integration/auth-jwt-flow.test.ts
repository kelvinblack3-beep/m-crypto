import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { env, SELF } from 'cloudflare:test'
import { SignJWT, exportJWK, generateKeyPair, type KeyLike, type JWK } from 'jose'
import { _resetJwksCacheForTests } from '../../src/middleware/auth'

const JWKS_URL = 'https://auth.test.example/.well-known/jwks.json'
const ISSUER = 'test-issuer'
const SUBJECT = 'user-123'
const KID = 'test-key-1'

let privateKey: KeyLike
let publicJwk: JWK

async function signToken(overrides: { sub?: string; iss?: string } = {}): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'EdDSA', kid: KID })
    .setIssuer(overrides.iss ?? ISSUER)
    .setSubject(overrides.sub ?? SUBJECT)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}

function tamper(jwt: string): string {
  // Flip a character in the signature segment — same structure, invalid sig.
  const parts = jwt.split('.')
  expect(parts).toHaveLength(3)
  const sig = parts[2]!
  const flipped = sig[0] === 'A' ? 'B' + sig.slice(1) : 'A' + sig.slice(1)
  return `${parts[0]}.${parts[1]}.${flipped}`
}

describe('auth JWT verification flow (integration)', () => {
  beforeAll(async () => {
    const { privateKey: priv, publicKey: pub } = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
    privateKey = priv
    const jwk = await exportJWK(pub)
    jwk.kid = KID
    jwk.alg = 'EdDSA'
    jwk.use = 'sig'
    publicJwk = jwk
  })

  beforeEach(() => {
    // Point the worker at our fake auth-service JWKS endpoint.
    ;(env as unknown as { JWKS_URL: string }).JWKS_URL = JWKS_URL
    ;(env as unknown as { JWT_ISSUER: string }).JWT_ISSUER = ISSUER
    _resetJwksCacheForTests()

    // Stub global fetch so JWKS_URL serves our generated public key as a JWKS document.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        if (url === JWKS_URL) {
          return new Response(JSON.stringify({ keys: [publicJwk] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        throw new Error(`unexpected fetch in test: ${url}`)
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    _resetJwksCacheForTests()
  })

  it('accepts a valid auth-service-issued JWT and returns the user identity', async () => {
    const jwt = await signToken()
    const res = await SELF.fetch('https://api.test.example/me', {
      headers: { Authorization: `Bearer ${jwt}` },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { user_id?: string; userId?: string }
    // Route shape uses snake_case (`user_id`); assert on either to make the
    // intent ("the JWT sub flows through as the userId") obvious.
    const userId = body.user_id ?? body.userId
    expect(userId).toBe(SUBJECT)
  })

  it('rejects a tampered JWT with 401', async () => {
    const jwt = await signToken()
    const tampered = tamper(jwt)
    const res = await SELF.fetch('https://api.test.example/me', {
      headers: { Authorization: `Bearer ${tampered}` },
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe('unauthorized')
  })

  it('rejects a JWT signed by an unrelated key (signature mismatch) with 401', async () => {
    const { privateKey: otherPriv } = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', kid: KID })
      .setIssuer(ISSUER)
      .setSubject(SUBJECT)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(otherPriv)

    const res = await SELF.fetch('https://api.test.example/me', {
      headers: { Authorization: `Bearer ${forged}` },
    })

    expect(res.status).toBe(401)
  })

  it('rejects a request with no Authorization header with 401', async () => {
    const res = await SELF.fetch('https://api.test.example/me')
    expect(res.status).toBe(401)
  })
})
