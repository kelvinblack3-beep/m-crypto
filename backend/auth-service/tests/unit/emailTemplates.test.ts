import { describe, expect, it } from 'vitest'
import { authEmail } from '../../src/emailTemplates'

const url = 'https://app.example/verify?token=a&b=1'

describe('authEmail', () => {
  it('builds the verification email', () => {
    const mail = authEmail('verify', { appName: 'Acme', url })
    expect(mail.subject).toBe('Verify your email for Acme')
    expect(mail.html).toContain('href="https://app.example/verify?token=a&amp;b=1"')
    expect(mail.html).toContain('Acme')
    expect(mail.html).toContain('max-width:560px')
    expect(mail.html).toContain('min-height:44px')
    expect(mail.text).toContain(url)
  })
  it('builds the reset email', () => {
    const mail = authEmail('reset', { appName: 'Acme', url })
    expect(mail.subject).toBe('Reset your Acme password')
    expect(mail.text).toContain(url)
  })
  it('escapes HTML in the app name', () => {
    const mail = authEmail('verify', { appName: '<b>x</b>', url })
    expect(mail.html).not.toContain('<b>x')
    expect(mail.html).toContain('&lt;b&gt;x')
  })
  it('falls back to "your app" and never uses em dashes', () => {
    for (const kind of ['verify', 'reset'] as const) {
      const mail = authEmail(kind, { appName: '', url })
      expect(mail.subject).toContain('your app')
      expect(mail.html + mail.text + mail.subject).not.toContain('—')
    }
  })
  it('keeps the subject on one line', () => {
    const mail = authEmail('verify', { appName: 'Ac\nme\r\nApp', url })
    expect(mail.subject).toBe('Verify your email for Ac me App')
    expect(mail.subject).not.toMatch(/[\r\n]/)
  })
  it('caps the app name at 60 characters', () => {
    const mail = authEmail('reset', { appName: 'a'.repeat(200), url })
    expect(mail.subject).toBe(`Reset your ${'a'.repeat(60)} password`)
  })
  it('preserves emoji names', () => {
    expect(authEmail('verify', { appName: 'Rocket \u{1F680}', url }).subject).toBe('Verify your email for Rocket \u{1F680}')
  })
  it('caps by code points without splitting a surrogate pair', () => {
    const name = 'a'.repeat(59) + '\u{1F680}'
    const { subject } = authEmail('reset', { appName: name, url })
    expect(subject).toBe(`Reset your ${name} password`)
    expect(subject).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })
})
