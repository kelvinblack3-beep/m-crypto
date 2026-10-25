export type NewlyEmailEnv = { NEWLY_EMAIL_URL?: string; NEWLY_EMAIL_TOKEN?: string }
export type NewlyEmail = { to: string; subject: string; html?: string; text?: string; from?: string }

const isTimeout = (err: unknown) => err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')

/** Sends through Newly's mailer from the app's verified domain (no-reply@ unless `from` is given). */
export async function sendNewlyEmail(env: NewlyEmailEnv, message: NewlyEmail): Promise<{ id: string }> {
  if (!env.NEWLY_EMAIL_URL || !env.NEWLY_EMAIL_TOKEN) throw new Error('email_not_configured')
  // Better Auth awaits the mailer inline, so a hung request would stall sign-up and reset.
  const response = await fetch(`${env.NEWLY_EMAIL_URL.replace(/\/+$/, '')}/email/v1/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.NEWLY_EMAIL_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10_000),
  }).catch((cause) => {
    throw new Error('email_unavailable', { cause })
  })
  const payload = (await response.json().catch((cause) => {
    if (isTimeout(cause)) throw new Error('email_unavailable', { cause })
    return {}
  })) as { id?: string; error?: string; message?: string }
  if (!response.ok || !payload.id) {
    const code = payload.error ?? `email_failed_${response.status}`
    throw new Error(payload.message ? `${code}: ${payload.message}` : code)
  }
  return { id: payload.id }
}
