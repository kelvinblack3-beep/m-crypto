import type { R2Bucket, R2PutOptions } from '@cloudflare/workers-types'
import type { Bindings } from '../env'

export type StorageBucket = 'storage' | 'public' | 'blobs'

function resolveBucket(env: Bindings, bucket: StorageBucket): R2Bucket {
  switch (bucket) {
    case 'storage':
      return env.R2_STORAGE
    case 'public':
      return env.R2_PUBLIC
    case 'blobs':
      return env.R2_BLOBS
  }
}

export class Storage {
  constructor(private env: Bindings) {}

  async put(bucket: StorageBucket, key: string, body: Parameters<R2Bucket['put']>[1], opts?: R2PutOptions): Promise<{ etag: string }> {
    const r2 = resolveBucket(this.env, bucket)
    const obj = await r2.put(key, body, opts)
    if (!obj) throw new Error('R2 put returned null')
    return { etag: obj.etag }
  }

  async get(bucket: StorageBucket, key: string) {
    const r2 = resolveBucket(this.env, bucket)
    const obj = await r2.get(key)
    if (!obj) return null
    return { body: obj.body, httpMetadata: obj.httpMetadata }
  }

  async head(bucket: StorageBucket, key: string) {
    const r2 = resolveBucket(this.env, bucket)
    const obj = await r2.head(key)
    if (!obj) return null
    return { size: obj.size, httpMetadata: obj.httpMetadata }
  }

  async delete(bucket: StorageBucket, key: string): Promise<void> {
    const r2 = resolveBucket(this.env, bucket)
    await r2.delete(key)
  }

  async list(bucket: StorageBucket, prefix?: string, opts?: { limit?: number; cursor?: string }) {
    const r2 = resolveBucket(this.env, bucket)
    const result = await r2.list({ prefix, limit: opts?.limit, cursor: opts?.cursor })
    return {
      objects: result.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded })),
      cursor: result.truncated ? result.cursor : undefined,
      truncated: result.truncated,
    }
  }

  async presignedUrl(_bucket: StorageBucket, _key: string, _ttl_s: number): Promise<string> {
    throw new Error('presignedUrl: not yet wired; configure R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and use @aws-sdk/s3-request-presigner against the R2 S3 endpoint.')
  }
}
