import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledController } from '@cloudflare/workers-types'
import {
  clearCronHandlers,
  dispatchCron,
  dispatchCronByName,
  getCronManifest,
  hasCronHandler,
  registerCron,
  type CronHandler,
} from '../../../src/platform/cron'
import type { HonoEnv } from '../../../src/env'

function makeController(cron: string): ScheduledController {
  return {
    cron,
    scheduledTime: 0,
    noRetry: () => {},
  } as unknown as ScheduledController
}

function makeEnv(): HonoEnv['Bindings'] {
  return {
    NEWLY_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://test',
    JWKS_URL: 'https://example.test/jwks',
    JWT_ISSUER: 'https://example.test',
  } as unknown as HonoEnv['Bindings']
}

describe('platform/cron — expression-indexed (scheduled() path)', () => {
  beforeEach(() => clearCronHandlers())
  afterEach(() => {
    clearCronHandlers()
    vi.restoreAllMocks()
  })

  it('registerCron stores a handler indexed by the expression', async () => {
    const handler = vi.fn() as unknown as CronHandler
    registerCron('0 9 * * *', 'daily-9am', handler)
    await dispatchCron(makeController('0 9 * * *'), makeEnv())
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('dispatchCron invokes the matching handler with (controller, env)', async () => {
    const handler = vi.fn() as unknown as CronHandler
    registerCron('*/5 * * * *', 'every-5min', handler)
    const controller = makeController('*/5 * * * *')
    const env = makeEnv()
    await dispatchCron(controller, env)
    expect(handler).toHaveBeenCalledWith(controller, env)
  })

  it('dispatchCron warns and resolves when no handler is registered for the expression', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(dispatchCron(makeController('15 * * * *'), makeEnv())).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(String(warnSpy.mock.calls[0]?.[0]))
    expect(payload).toMatchObject({ level: 'warn', msg: 'no_cron_handler', cron: '15 * * * *' })
  })

  it('dispatchCron propagates errors thrown by the handler', async () => {
    const boom = new Error('handler exploded')
    registerCron('0 0 * * *', 'midnight', () => {
      throw boom
    })
    await expect(dispatchCron(makeController('0 0 * * *'), makeEnv())).rejects.toBe(boom)
  })

  it('dispatchCron propagates rejections from async handlers', async () => {
    const boom = new Error('async explode')
    registerCron('30 * * * *', 'half-hourly', async () => {
      throw boom
    })
    await expect(dispatchCron(makeController('30 * * * *'), makeEnv())).rejects.toBe(boom)
  })

  it('clearCronHandlers empties both indexes', async () => {
    const handler = vi.fn() as unknown as CronHandler
    registerCron('0 9 * * *', 'daily-9am', handler)
    registerCron('0 12 * * *', 'daily-noon', handler)
    clearCronHandlers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await dispatchCron(makeController('0 9 * * *'), makeEnv())
    expect(handler).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(hasCronHandler('daily-9am')).toBe(false)
    expect(getCronManifest()).toEqual([])
  })
})

describe('platform/cron — name-indexed (/_internal/cron/:name path)', () => {
  beforeEach(() => clearCronHandlers())
  afterEach(() => clearCronHandlers())

  it('hasCronHandler reflects registration by name', () => {
    expect(hasCronHandler('reap-archived')).toBe(false)
    registerCron('0 * * * *', 'reap-archived', () => {})
    expect(hasCronHandler('reap-archived')).toBe(true)
  })

  it('does not treat inherited object properties as registered cron names', async () => {
    expect(hasCronHandler('toString')).toBe(false)
    await expect(dispatchCronByName('toString', makeEnv())).rejects.toThrow(
      /no cron handler registered for name: toString/,
    )
  })

  it('getCronManifest lists each registered (name, cronExpr) pair', () => {
    registerCron('0 * * * *', 'reap-archived', () => {})
    registerCron('*/15 * * * *', 'flush-cache', () => {})
    const manifest = getCronManifest()
    expect(manifest).toHaveLength(2)
    expect(manifest).toContainEqual({ name: 'reap-archived', cronExpr: '0 * * * *' })
    expect(manifest).toContainEqual({ name: 'flush-cache', cronExpr: '*/15 * * * *' })
  })

  it('dispatchCronByName invokes the handler with a synthesized ScheduledController', async () => {
    const handler = vi.fn(async (controller: ScheduledController, _env: HonoEnv['Bindings']) => {
      expect(controller.cron).toBe('0 * * * *')
      expect(typeof controller.scheduledTime).toBe('number')
    })
    registerCron('0 * * * *', 'reap-archived', handler)
    await dispatchCronByName('reap-archived', makeEnv())
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('dispatchCronByName throws when the name is not registered', async () => {
    await expect(dispatchCronByName('not-a-thing', makeEnv())).rejects.toThrow(
      /no cron handler registered for name: not-a-thing/,
    )
  })
})
