import { Hono } from 'hono'
import type { HonoEnv } from '../env'

export const healthRoutes = new Hono<HonoEnv>()

healthRoutes.get('/health', (c) => {
  const env = c.env as HonoEnv['Bindings'] & { NEWLY_PROJECT_ID?: string }
  return c.json({
    status: 'ok',
    project_id: env.NEWLY_PROJECT_ID ?? '',
    env: env.NEWLY_ENV ?? '',
  })
})
