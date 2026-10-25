import { cors } from 'hono/cors'

export const corsMiddleware = cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  credentials: true,
  maxAge: 86400,
})
