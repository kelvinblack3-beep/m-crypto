import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Queue } from '@cloudflare/workers-types'
import { TaskQueue } from '../../../src/platform/queue'

type QueueStub = {
  send: ReturnType<typeof vi.fn>
  sendBatch: ReturnType<typeof vi.fn>
}

function makeQueueStub(): QueueStub {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    sendBatch: vi.fn().mockResolvedValue(undefined),
  }
}

describe('TaskQueue', () => {
  let stub: QueueStub
  let taskQueue: TaskQueue

  beforeEach(() => {
    stub = makeQueueStub()
    taskQueue = new TaskQueue(stub as unknown as Queue)
  })

  describe('enqueue', () => {
    it('sends a single message with contentType json by default', async () => {
      const payload = { task: 'resize_image', src: 'foo.png' }

      await taskQueue.enqueue(payload)

      expect(stub.send).toHaveBeenCalledTimes(1)
      expect(stub.sendBatch).not.toHaveBeenCalled()
      expect(stub.send).toHaveBeenCalledWith(payload, {
        delaySeconds: undefined,
        contentType: 'json',
      })
    })

    it('passes delaySeconds through to the underlying queue', async () => {
      const payload = { task: 'send_email', to: 'a@b.com' }

      await taskQueue.enqueue(payload, { delaySeconds: 3600 })

      expect(stub.send).toHaveBeenCalledTimes(1)
      expect(stub.send).toHaveBeenCalledWith(payload, {
        delaySeconds: 3600,
        contentType: 'json',
      })
    })
  })

  describe('enqueueBatch', () => {
    it('is a no-op when given an empty array', async () => {
      await taskQueue.enqueueBatch([])

      expect(stub.sendBatch).not.toHaveBeenCalled()
      expect(stub.send).not.toHaveBeenCalled()
    })

    it('delivers multiple payloads with contentType json', async () => {
      const payloads = [
        { task: 'resize_image', src: 'one.png' },
        { task: 'resize_image', src: 'two.png' },
        { task: 'resize_image', src: 'three.png' },
      ]

      await taskQueue.enqueueBatch(payloads)

      expect(stub.sendBatch).toHaveBeenCalledTimes(1)
      expect(stub.send).not.toHaveBeenCalled()
      expect(stub.sendBatch).toHaveBeenCalledWith([
        { body: payloads[0], contentType: 'json' },
        { body: payloads[1], contentType: 'json' },
        { body: payloads[2], contentType: 'json' },
      ])
    })
  })
})
