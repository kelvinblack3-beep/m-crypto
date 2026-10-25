export type AuthEmailKind = 'verify' | 'reset'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const COPY = {
  verify: (app: string) => ({
    subject: `Verify your email for ${app}`,
    heading: `Verify your email for ${app}`,
    body: `Confirm this address to finish setting up your ${app} account.`,
    button: 'Verify email',
    ignore: 'If you did not create an account, you can ignore this email.',
  }),
  reset: (app: string) => ({
    subject: `Reset your ${app} password`,
    heading: `Reset your ${app} password`,
    body: `We received a request to reset your ${app} password.`,
    button: 'Reset password',
    ignore: 'If you did not ask for this, you can ignore this email. Your password will not change.',
  }),
}

/** Single-column, inline-styled mail with a plain-text alternative. Empty appName falls back to "your app". */
export function authEmail(kind: AuthEmailKind, args: { appName: string; url: string }) {
  const app = Array.from(args.appName.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim()).slice(0, 60).join('').trim() || 'your app'
  const c = COPY[kind](app)
  const e = escapeHtml
  const html = `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${e(c.heading)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5">${e(c.body)}</p>
<a href="${e(args.url)}" style="display:inline-block;box-sizing:border-box;min-height:44px;line-height:44px;padding:0 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600">${c.button}</a>
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#52525b">Or paste this link into your browser:<br><span style="word-break:break-all">${e(args.url)}</span></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#52525b">${e(c.ignore)}</p>
</div></body></html>`
  const text = `${c.heading}\n\n${c.body}\n\n${c.button}: ${args.url}\n\n${c.ignore}`
  return { subject: c.subject, html, text }
}
