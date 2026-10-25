import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import type { R2Bucket } from '@cloudflare/workers-types'
import type { Bindings } from '../../../src/env'
import { Storage, type StorageBucket } from '../../../src/platform/storage'

const BUCKET_BINDINGS: Record<StorageBucket, keyof Bindings> = {
  storage: 'R2_STORAGE',
  public: 'R2_PUBLIC',
  blobs: 'R2_BLOBS',
}

function bindingFor(bucket: StorageBucket): R2Bucket {
  return (env as unknown as Record<string, unknown>)[BUCKET_BINDINGS[bucket]] as R2Bucket
}

async function emptyBucket(bucket: R2Bucket): Promise<void> {
  let cursor: string | undefined
  // R2's `truncated` is a discriminated boolean — loop until we have everything.
  while (true) {
    const page = await bucket.list({ cursor, limit: 1000 })
    if (page.objects.length > 0) {
      await bucket.delete(page.objects.map((o) => o.key))
    }
    if (!page.truncated) return
    cursor = page.cursor
  }
}

describe('Storage', () => {
  let storage: Storage

  beforeEach(async () => {
    storage = new Storage(env as unknown as Bindings)
    await Promise.all([
      emptyBucket(bindingFor('storage')),
      emptyBucket(bindingFor('public')),
      emptyBucket(bindingFor('blobs')),
    ])
  })

  describe('put', () => {
    it('writes to the correct bucket and returns an etag', async () => {
      const result = await storage.put('storage', 'docs/hello.txt', 'hello world')

      expect(result.etag).toBeTruthy()
      expect(typeof result.etag).toBe('string')

      // Object is reachable via the storage bucket binding.
      const direct = await bindingFor('storage').get('docs/hello.txt')
      expect(direct).not.toBeNull()
      expect(await direct!.text()).toBe('hello world')

      // And NOT written to the other buckets.
      expect(await bindingFor('public').head('docs/hello.txt')).toBeNull()
      expect(await bindingFor('blobs').head('docs/hello.txt')).toBeNull()
    })

    it('routes "public" writes to R2_PUBLIC', async () => {
      await storage.put('public', 'logos/light.svg', '<svg/>', {
        httpMetadata: { contentType: 'image/svg+xml' },
      })

      const direct = await bindingFor('public').get('logos/light.svg')
      expect(direct).not.toBeNull()
      expect(await direct!.text()).toBe('<svg/>')
      expect(await bindingFor('storage').head('logos/light.svg')).toBeNull()
    })

    it('routes "blobs" writes to R2_BLOBS', async () => {
      await storage.put('blobs', '_platform/kv/abc', new ArrayBuffer(8))

      expect(await bindingFor('blobs').head('_platform/kv/abc')).not.toBeNull()
      expect(await bindingFor('storage').head('_platform/kv/abc')).toBeNull()
    })

    it('persists httpMetadata from R2PutOptions', async () => {
      await storage.put('storage', 'meta.bin', 'x', {
        httpMetadata: { contentType: 'application/octet-stream' },
      })

      const head = await bindingFor('storage').head('meta.bin')
      expect(head?.httpMetadata?.contentType).toBe('application/octet-stream')
    })
  })

  describe('get', () => {
    it('returns body and httpMetadata when the object exists', async () => {
      await bindingFor('storage').put('greet.txt', 'hi', {
        httpMetadata: { contentType: 'text/plain' },
      })

      const result = await storage.get('storage', 'greet.txt')

      expect(result).not.toBeNull()
      expect(result!.httpMetadata?.contentType).toBe('text/plain')
      // body is a ReadableStream — drain it via Response to assert content.
      const text = await new Response(result!.body as unknown as ReadableStream).text()
      expect(text).toBe('hi')
    })

    it('returns null on miss', async () => {
      const result = await storage.get('storage', 'nope/missing.txt')
      expect(result).toBeNull()
    })
  })

  describe('head', () => {
    it('returns size and httpMetadata when the object exists', async () => {
      const body = 'sized-payload'
      await bindingFor('public').put('asset.bin', body, {
        httpMetadata: { contentType: 'application/x-bin' },
      })

      const result = await storage.head('public', 'asset.bin')

      expect(result).not.toBeNull()
      expect(result!.size).toBe(body.length)
      expect(result!.httpMetadata?.contentType).toBe('application/x-bin')
    })

    it('returns null on miss', async () => {
      const result = await storage.head('public', 'nope/missing.bin')
      expect(result).toBeNull()
    })
  })

  describe('delete', () => {
    it('removes the object from the bucket', async () => {
      await bindingFor('storage').put('to-delete.txt', 'bye')
      expect(await bindingFor('storage').head('to-delete.txt')).not.toBeNull()

      await storage.delete('storage', 'to-delete.txt')

      expect(await bindingFor('storage').head('to-delete.txt')).toBeNull()
    })

    it('is a no-op on missing keys (does not throw)', async () => {
      await expect(storage.delete('storage', 'never-existed.txt')).resolves.toBeUndefined()
    })
  })

  describe('list', () => {
    it('filters by prefix and projects key/size/uploaded', async () => {
      await bindingFor('storage').put('docs/a.txt', 'a')
      await bindingFor('storage').put('docs/b.txt', 'bb')
      await bindingFor('storage').put('other/c.txt', 'ccc')

      const result = await storage.list('storage', 'docs/')

      const keys = result.objects.map((o) => o.key).sort()
      expect(keys).toEqual(['docs/a.txt', 'docs/b.txt'])
      expect(result.truncated).toBe(false)
      expect(result.cursor).toBeUndefined()

      // Sanity-check projected fields.
      for (const obj of result.objects) {
        expect(typeof obj.size).toBe('number')
        expect(obj.uploaded).toBeInstanceOf(Date)
      }
    })

    it('returns a cursor when truncated and resumes from it', async () => {
      for (let i = 0; i < 5; i++) {
        await bindingFor('storage').put(`page/${i}.txt`, `v${i}`)
      }

      const page1 = await storage.list('storage', 'page/', { limit: 2 })
      expect(page1.objects).toHaveLength(2)
      expect(page1.truncated).toBe(true)
      expect(page1.cursor).toBeTruthy()

      const page2 = await storage.list('storage', 'page/', { limit: 2, cursor: page1.cursor })
      expect(page2.objects).toHaveLength(2)
      const seen = new Set([...page1.objects, ...page2.objects].map((o) => o.key))
      expect(seen.size).toBe(4) // distinct keys across the two pages

      const page3 = await storage.list('storage', 'page/', { limit: 2, cursor: page2.cursor })
      // Final page: 1 remaining object, not truncated, no cursor.
      expect(page3.objects).toHaveLength(1)
      expect(page3.truncated).toBe(false)
      expect(page3.cursor).toBeUndefined()
    })
  })

  describe('presignedUrl', () => {
    it('throws a clear error pointing at the missing R2 S3 credentials', async () => {
      await expect(storage.presignedUrl('storage', 'k', 60)).rejects.toThrow(
        /presignedUrl: not yet wired.*R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY/,
      )
    })
  })
})
