import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageBatch, Message } from '@cloudflare/workers-types'
import type { Bindings, ExecutionContext } from '../../src/env'
import worker, { type TaskQueueMessage } from '../../src/index'
import { clearTaskHandlers, registerTask } from '../../src/platform/task-registry'

type MessageStub<T = TaskQueueMessage> = {
  id: string
  body: T
  timestamp: Date
  attempts: number
  ack: ReturnType<typeof vi.fn>
  retry: ReturnType<typeof vi.fn>
}

function makeMessage<T = TaskQueueMessage>(id: string, body: T): MessageStub<T> {
  return { id, body, timestamp: new Date(), attempts: 1, ack: vi.fn(), retry: vi.fn() }
}

function makeBatch(queue: string, messages: MessageStub[]): MessageBatch<TaskQueueMessage> {
  return {
    queue,
    messages: messages as unknown as Message<TaskQueueMessage>[],
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<TaskQueueMessage>
}

function makeEnv(): Bindings {
  return {
    NEWLY_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://test',
    JWKS_URL: 'http://test/jwks',
    JWT_ISSUER: 'http://test',
    R2_BLOBS: {} as Bindings['R2_BLOBS'],
    R2_STORAGE: {} as Bindings['R2_STORAGE'],
    R2_PUBLIC: {} as Bindings['R2_PUBLIC'],
    QUEUE_DEFAULT: {} as Bindings['QUEUE_DEFAULT'],
  } as unknown as Bindings
}

function makeCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext
}

describe('worker.queue consumer (workerd integration)', () => {
  beforeEach(() => clearTaskHandlers())
  afterEach(() => {
    clearTaskHandlers()
    vi.restoreAllMocks()
  })

  it('dispatches each message to its registered handler and acks', async () => {
    const resize = vi.fn()
    const sendEmail = vi.fn()
    registerTask('resize_image', resize)
    registerTask('send_email', sendEmail)

    const msg1 = makeMessage('m-1', { name: 'resize_image', payload: { src: 'a.png' } })
    const msg2 = makeMessage('m-2', { name: 'send_email', payload: { to: 'a@b.com' } })
    await worker.queue!(makeBatch('test-queue', [msg1, msg2]), makeEnv(), makeCtx())

    expect(resize).toHaveBeenCalledWith({ src: 'a.png' }, expect.objectContaining({ name: 'resize_image' }))
    expect(sendEmail).toHaveBeenCalledWith({ to: 'a@b.com' }, expect.objectContaining({ name: 'send_email' }))
    expect(msg1.ack).toHaveBeenCalledTimes(1)
    expect(msg2.ack).toHaveBeenCalledTimes(1)
    expect(msg1.retry).not.toHaveBeenCalled()
    expect(msg2.retry).not.toHaveBeenCalled()
  })

  it('retries the failing message and acks the successful one', async () => {
    const okHandler = vi.fn()
    const badHandler = vi.fn(async () => {
      throw new Error('upstream timeout')
    })
    registerTask('ok', okHandler)
    registerTask('bad', badHandler)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const msg1 = makeMessage('m-good', { name: 'ok' })
    const msg2 = makeMessage('m-bad', { name: 'bad' })
    await worker.queue!(makeBatch('test-queue', [msg1, msg2]), makeEnv(), makeCtx())

    expect(msg1.ack).toHaveBeenCalledTimes(1)
    expect(msg1.retry).not.toHaveBeenCalled()
    expect(msg2.ack).not.toHaveBeenCalled()
    expect(msg2.retry).toHaveBeenCalledTimes(1)
  })
})
