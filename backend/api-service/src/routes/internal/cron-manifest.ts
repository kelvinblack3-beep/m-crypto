import { Hono } from 'hono'
import type { HonoEnv } from '../../env'
import { oidcMiddleware } from '../../middleware/oidc'
import { getCronManifest } from '../../platform/cron'

export const internalCronManifestRoutes = new Hono<HonoEnv>()

internalCronManifestRoutes.get('/_internal/cron-manifest', oidcMiddleware, (c) => {
  const manifest = getCronManifest()
  return c.json({ manifest }, 200)
})
