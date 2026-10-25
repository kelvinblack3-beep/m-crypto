import { env } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledController } from '@cloudflare/workers-types'

import worker from '../../src/index'
import {
  clearCronHandlers,
  registerCron,
  type CronHandler,
} from '../../src/platform/cron'
import type { HonoEnv } from '../../src/env'

function makeController(cron: string): ScheduledController {
  return {
    cron,
    scheduledTime: Date.now(),
    noRetry: () => {},
  } as unknown as ScheduledController
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext
}

describe('worker.scheduled (workerd integration)', () => {
  let handler: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clearCronHandlers()
    handler = vi.fn() as unknown as ReturnType<typeof vi.fn>
    registerCron('0 9 * * *', 'daily-9am', handler as unknown as CronHandler)
  })

  afterEach(() => {
    clearCronHandlers()
    vi.restoreAllMocks()
  })

  it('scheduled trigger dispatches the cron with the controller and env', async () => {
    const controller = makeController('0 9 * * *')

    await worker.scheduled!(controller, env as HonoEnv['Bindings'], makeCtx())

    expect(handler).toHaveBeenCalledTimes(1)
    const [calledController, calledEnv] = handler.mock.calls[0]!
    expect(calledController).toBe(controller)
    expect(calledController.cron).toBe('0 9 * * *')
    // instrument() hands handlers a tracing proxy of env, so compare values, not identity.
    expect(calledEnv).toEqual(env)
  })

  it('invokes the registered handler when the cron expression matches', async () => {
    const controller = makeController('0 9 * * *')

    await worker.scheduled!(controller, env as HonoEnv['Bindings'], makeCtx())

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('logs a warning and does not throw when no handler is registered for the cron', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const controller = makeController('*/15 * * * *')

    await expect(
      worker.scheduled!(controller, env as HonoEnv['Bindings'], makeCtx()),
    ).resolves.toBeUndefined()

    expect(handler).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)

    const payload = JSON.parse(String(warnSpy.mock.calls[0]?.[0]))
    expect(payload).toMatchObject({
      level: 'warn',
      msg: 'no_cron_handler',
      cron: '*/15 * * * *',
    })
  })
})
