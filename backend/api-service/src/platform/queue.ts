import type { Queue } from '@cloudflare/workers-types'

export type QueuePayload = Record<string, unknown>

export class TaskQueue {
  constructor(private queue: Queue) {}

  async enqueue<T extends QueuePayload>(payload: T, opts?: { delaySeconds?: number; contentType?: 'json' | 'text' | 'bytes' | 'v8' }): Promise<void> {
    await this.queue.send(payload as any, { delaySeconds: opts?.delaySeconds, contentType: opts?.contentType ?? 'json' })
  }

  async enqueueBatch<T extends QueuePayload>(payloads: T[]): Promise<void> {
    if (!payloads.length) return
    const batch = payloads.map((body) => ({ body, contentType: 'json' as const }))
    await this.queue.sendBatch(batch as any)
  }
}
