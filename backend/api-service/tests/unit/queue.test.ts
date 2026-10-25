import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageBatch } from '@cloudflare/workers-types'
import { handleQueueBatch, type TaskQueueMessage } from '../../src/index'
import {
  clearTaskHandlers,
  registerTask,
} from '../../src/platform/task-registry'
import type { HonoEnv } from '../../src/env'

function makeEnv(): HonoEnv['Bindings'] {
  return { NEWLY_ENV: 'test', LOG_LEVEL: 'silent' } as unknown as HonoEnv['Bindings']
}

interface MockMessage {
  id: string
  body: TaskQueueMessage | { name?: unknown }
  ack: ReturnType<typeof vi.fn>
  retry: ReturnType<typeof vi.fn>
}

function makeMessage(id: string, body: TaskQueueMessage | { name?: unknown }): MockMessage {
  return { id, body, ack: vi.fn(), retry: vi.fn() }
}

function makeBatch(messages: MockMessage[]): MessageBatch<TaskQueueMessage> {
  return {
    queue: 'test-default',
    messages: messages as unknown as MessageBatch<TaskQueueMessage>['messages'],
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<TaskQueueMessage>
}

describe('queue handler — task-registry dispatch', () => {
  beforeEach(() => clearTaskHandlers())
  afterEach(() => {
    clearTaskHandlers()
    vi.restoreAllMocks()
  })

  it('looks up the named handler and acks on success', async () => {
    const handler = vi.fn()
    registerTask('reindex-search', handler)
    const m = makeMessage('m1', { name: 'reindex-search', payload: { id: 42 } })
    await handleQueueBatch(makeBatch([m]), makeEnv())
    expect(handler).toHaveBeenCalledWith({ id: 42 }, expect.objectContaining({ name: 'reindex-search' }))
    expect(m.ack).toHaveBeenCalledTimes(1)
    expect(m.retry).not.toHaveBeenCalled()
  })

  it('acks (not retries) when the message has no name — retrying a bad envelope is useless', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = makeMessage('m2', { /* no name */ })
    await handleQueueBatch(makeBatch([m]), makeEnv())
    expect(m.ack).toHaveBeenCalledTimes(1)
    expect(m.retry).not.toHaveBeenCalled()
  })

  it('acks (not retries) for an unknown task name — needs a producer fix', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = makeMessage('m3', { name: 'never-registered' })
    await handleQueueBatch(makeBatch([m]), makeEnv())
    expect(m.ack).toHaveBeenCalledTimes(1)
    expect(m.retry).not.toHaveBeenCalled()
  })

  it('retries when the handler throws — the platform queue caps retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    registerTask('flaky', async () => {
      throw new Error('upstream timeout')
    })
    const m = makeMessage('m4', { name: 'flaky' })
    await handleQueueBatch(makeBatch([m]), makeEnv())
    expect(m.ack).not.toHaveBeenCalled()
    expect(m.retry).toHaveBeenCalledTimes(1)
  })

  it('processes a mixed batch independently — one bad msg does not poison the others', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const okHandler = vi.fn()
    const badHandler = vi.fn(async () => {
      throw new Error('nope')
    })
    registerTask('ok-task', okHandler)
    registerTask('bad-task', badHandler)

    const messages: MockMessage[] = [
      makeMessage('m-ok', { name: 'ok-task', payload: 'a' }),
      makeMessage('m-bad', { name: 'bad-task' }),
      makeMessage('m-noname', { /* no name */ }),
      makeMessage('m-unknown', { name: 'not-registered' }),
    ]
    await handleQueueBatch(makeBatch(messages), makeEnv())

    expect(messages[0]?.ack).toHaveBeenCalled()
    expect(messages[0]?.retry).not.toHaveBeenCalled()
    expect(messages[1]?.ack).not.toHaveBeenCalled()
    expect(messages[1]?.retry).toHaveBeenCalled()
    expect(messages[2]?.ack).toHaveBeenCalled()
    expect(messages[3]?.ack).toHaveBeenCalled()
  })
})
