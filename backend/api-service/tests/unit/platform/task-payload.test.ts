import { describe, expect, it, vi } from 'vitest'
import { deserializePayload, maybeInline } from '../../../src/platform/task-payload'
import type { Bindings } from '../../../src/env'

function b64(s: string): string {
  // btoa is available globally in the Workers test runtime.
  return btoa(s)
}

function makeEnv(r2Get?: (key: string) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> } | null>): Bindings {
  return {
    R2_BLOBS: {
      get: r2Get ?? (() => Promise.resolve(null)),
    },
  } as unknown as Bindings
}

describe('platform/task-payload — maybeInline', () => {
  it('decodes inline_b64 to bytes', async () => {
    const out = await maybeInline(makeEnv(), { inline_b64: b64('hello') })
    expect(new TextDecoder().decode(out)).toBe('hello')
  })

  it('fetches the R2 object when gcs_object is set', async () => {
    const payload = new TextEncoder().encode('{"k":1}').buffer as ArrayBuffer
    const get = vi.fn(async (key: string) => {
      expect(key).toBe('staged/task-42.bin')
      return { arrayBuffer: async () => payload }
    })
    const out = await maybeInline(makeEnv(get), { gcs_object: 'staged/task-42.bin' })
    expect(new TextDecoder().decode(out)).toBe('{"k":1}')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('throws when the R2 object is missing', async () => {
    const env = makeEnv(async () => null)
    await expect(maybeInline(env, { gcs_object: 'gone' })).rejects.toThrow(
      /task payload object not found in R2 blobs: gone/,
    )
  })

  it('throws when both refs are absent', async () => {
    await expect(maybeInline(makeEnv(), {})).rejects.toThrow(
      /missing both inline_b64 and gcs_object/,
    )
  })

  it('inline_b64 wins when both are set', async () => {
    const get = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }))
    const out = await maybeInline(makeEnv(get), { inline_b64: b64('inline-wins'), gcs_object: 'should-not-fetch' })
    expect(new TextDecoder().decode(out)).toBe('inline-wins')
    expect(get).not.toHaveBeenCalled()
  })
})

describe('platform/task-payload — deserializePayload', () => {
  it('parses JSON bodies', () => {
    const raw = new TextEncoder().encode('{"x":42,"y":"z"}')
    expect(deserializePayload(raw, 'json')).toEqual({ x: 42, y: 'z' })
  })

  it('parses JSON arrays / scalars / nulls', () => {
    expect(deserializePayload(new TextEncoder().encode('[1,2,3]'), 'json')).toEqual([1, 2, 3])
    expect(deserializePayload(new TextEncoder().encode('null'), 'json')).toBeNull()
    expect(deserializePayload(new TextEncoder().encode('"hi"'), 'json')).toBe('hi')
  })

  it('throws on the pickle codec — Workers runtime has no pickle decoder', () => {
    expect(() =>
      deserializePayload(new TextEncoder().encode('anything'), 'pickle'),
    ).toThrow(/pickle codec is not supported/)
  })

  it('throws on an unknown codec', () => {
    expect(() =>
      deserializePayload(new TextEncoder().encode('x'), 'msgpack' as unknown as 'json'),
    ).toThrow(/unknown task codec: msgpack/)
  })
})
