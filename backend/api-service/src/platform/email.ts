import type { Bindings } from '../env'

export class NewlyEmailError extends Error {
  constructor(readonly code: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NewlyEmailError'
  }
}

export type EmailMessage = { to: string | string[]; subject: string; html?: string; text?: string; from?: string; replyTo?: string }

const isTimeout = (err: unknown) => err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
const unavailable = (cause: unknown) =>
  new NewlyEmailError(
    'email_unavailable',
    isTimeout(cause) ? 'The email service did not respond in time.' : 'The email service could not be reached.',
    { cause },
  )

async function callMailer<T>(env: Bindings, path: string, body: unknown, ok: (payload: T) => boolean): Promise<T> {
  if (!env.NEWLY_EMAIL_URL || !env.NEWLY_EMAIL_TOKEN) {
    throw new NewlyEmailError('email_not_configured', 'Email is not set up for this app yet.')
  }
  const response = await fetch(`${env.NEWLY_EMAIL_URL.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.NEWLY_EMAIL_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  }).catch((cause) => {
    throw unavailable(cause)
  })
  const payload = (await response.json().catch((cause) => {
    if (isTimeout(cause)) throw unavailable(cause)
    return {}
  })) as T & { error?: string; message?: string }
  if (!response.ok || !ok(payload)) {
    throw new NewlyEmailError(payload.error ?? 'email_failed', payload.message ?? `Email failed with status ${response.status}.`)
  }
  return payload
}

/** Transactional email from the app's verified domain. Marketing and bulk sends are not allowed. */
export async function sendEmail(env: Bindings, message: EmailMessage): Promise<{ id: string }> {
  const payload = await callMailer<{ id?: string }>(env, '/email/v1/send', message, (p) => Boolean(p.id))
  return { id: payload.id! }
}

export type ContactStatus = 'pending' | 'subscribed' | 'unsubscribed' | 'bounced' | 'complained'
export type SubscribeInput = { email: string; topics?: string[]; source?: 'signup_checkbox' | 'api'; ip?: string }

/** Adds someone who agreed to marketing email (for example a ticked sign-up checkbox). They get a
 *  confirmation email and stay `pending` until they click it. Non-prod backends file contacts under
 *  a separate test audience that never receives campaigns. */
export async function subscribeContact(
  env: Bindings,
  input: SubscribeInput,
): Promise<{ status: ContactStatus; confirmation?: 'sent' | 'deferred' }> {
  const body = { ...input, source: input.source ?? 'api', environment: env.NEWLY_ENV === 'prod' ? 'prod' : 'test' }
  const payload = await callMailer<{ status?: ContactStatus; confirmation?: 'sent' | 'deferred' }>(env, '/email/v1/contacts', body, (p) =>
    Boolean(p.status),
  )
  return { status: payload.status!, ...(payload.confirmation ? { confirmation: payload.confirmation } : {}) }
}
