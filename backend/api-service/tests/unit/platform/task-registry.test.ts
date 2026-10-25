import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearTaskHandlers,
  getTaskHandler,
  getTaskNames,
  registerTask,
} from '../../../src/platform/task-registry'
import type { HonoEnv } from '../../../src/env'

function makeEnv(): HonoEnv['Bindings'] {
  return { NEWLY_ENV: 'test', LOG_LEVEL: 'silent' } as unknown as HonoEnv['Bindings']
}

describe('platform/task-registry', () => {
  beforeEach(() => clearTaskHandlers())
  afterEach(() => clearTaskHandlers())

  it('getTaskHandler returns null for unregistered names', () => {
    expect(getTaskHandler('nope')).toBeNull()
  })

  it('registerTask + getTaskHandler round-trips the handler', async () => {
    const handler = vi.fn()
    registerTask('send-email', handler)
    const got = getTaskHandler('send-email')
    expect(got).toBe(handler)
    if (!got) throw new Error('handler missing')
    await got({ to: 'a@b.com' }, { env: makeEnv(), name: 'send-email' })
    expect(handler).toHaveBeenCalledWith({ to: 'a@b.com' }, { env: expect.any(Object), name: 'send-email' })
  })

  it('registerTask overwrites a same-named handler (last write wins)', () => {
    const first = vi.fn()
    const second = vi.fn()
    registerTask('reindex', first)
    registerTask('reindex', second)
    expect(getTaskHandler('reindex')).toBe(second)
  })

  it('getTaskNames returns sorted registered names', () => {
    registerTask('zeta', () => {})
    registerTask('alpha', () => {})
    registerTask('mu', () => {})
    expect(getTaskNames()).toEqual(['alpha', 'mu', 'zeta'])
  })

  it('clearTaskHandlers wipes the registry', () => {
    registerTask('a', () => {})
    registerTask('b', () => {})
    clearTaskHandlers()
    expect(getTaskNames()).toEqual([])
    expect(getTaskHandler('a')).toBeNull()
  })
})
