import { Hono } from 'hono'
import type { HonoEnv } from '../env'
import { authMiddleware } from '../middleware/auth'

export const meRoutes = new Hono<HonoEnv>()

meRoutes.get('/me', authMiddleware, (c) => {
  const userId = c.get('userId')
  const email = c.get('email')
  return c.json({ user_id: userId, email })
})
