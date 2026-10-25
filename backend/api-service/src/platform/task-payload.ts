import type { Bindings } from '../env'

export type Codec = 'json' | 'pickle'

export interface PayloadRef {
  // base64-encoded raw bytes for payloads that fit in the dispatch
  // request body. Either this OR gcs_object must be provided.
  inline_b64?: string
  // R2 object key in the 'blobs' bucket for payloads too large for the
  // request body. The caller deletes the object after the handler
  // succeeds. Keyed by the GCP-era name for cross-migration parity.
  gcs_object?: string
}

// Resolve a task payload reference to raw bytes. Mirrors the GCP-era
// Cloud Tasks pattern where small payloads ride inline in the dispatch
// request and large ones get staged in GCS first; here the staging
// bucket is the per-tenant R2 'blobs' bucket. The Storage wrapper's
// `get` returns only a stripped body+metadata view, so we read R2
// directly to get the full R2Object (with .arrayBuffer()).
export async function maybeInline(env: Bindings, ref: PayloadRef): Promise<Uint8Array> {
  if (ref.inline_b64) return base64Decode(ref.inline_b64)
  if (ref.gcs_object) {
    const obj = await env.R2_BLOBS.get(ref.gcs_object)
    if (!obj) throw new Error(`task payload object not found in R2 blobs: ${ref.gcs_object}`)
    const buf = await obj.arrayBuffer()
    return new Uint8Array(buf)
  }
  throw new Error('task payload missing both inline_b64 and gcs_object')
}

export function deserializePayload(raw: Uint8Array, codec: Codec): unknown {
  if (codec === 'json') {
    const text = new TextDecoder('utf-8').decode(raw)
    return JSON.parse(text)
  }
  if (codec === 'pickle') {
    // No native Python pickle in the Workers runtime. Producers that
    // need to ship arbitrary Python objects need a Python sandbox; for
    // a Worker consumer, re-encode the payload as JSON on the producer
    // side.
    throw new Error(
      'pickle codec is not supported in the TS Worker runtime; ' +
        're-encode the task payload as JSON',
    )
  }
  throw new Error(`unknown task codec: ${codec as string}`)
}

function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
