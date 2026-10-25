import type { ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { HonoEnv } from '../env'

export const errorHandler: ErrorHandler<HonoEnv> = (err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse()
  }
  const requestId = c.get('requestId')
  if (c.env.LOG_LEVEL !== 'silent') console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'unhandled_error', request_id: requestId, error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }))
  return c.json({ error: 'internal server error', request_id: requestId }, 500)
}
