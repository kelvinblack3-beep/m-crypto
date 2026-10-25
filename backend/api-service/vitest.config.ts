import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    // Inlined so Vite applies the packages' `browser` field (as wrangler does when
    // it bundles); loaded raw, OTel's node host detector imports node:os.
    server: { deps: { inline: [/@opentelemetry\//, /@microlabs\/otel-cf-workers/] } },
    poolOptions: {
      workers: {
        singleWorker: false,
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          compatibilityDate: '2025-06-01',
          compatibilityFlags: ['nodejs_compat'],
          kvNamespaces: ['KV_CACHE'],
          r2Buckets: ['R2_BLOBS', 'R2_STORAGE', 'R2_PUBLIC'],
          queueProducers: { QUEUE_DEFAULT: 'test-queue' },
          queueConsumers: ['test-queue'],
          bindings: {
            NEWLY_ENV: 'test',
            LOG_LEVEL: 'silent',
            // Set at deploy, not in wrangler.toml; the auth flow test stubs this URL.
            JWKS_URL: 'https://auth.test.example/.well-known/jwks.json',
            JWT_ISSUER: 'test-issuer',
          },
        },
      },
    },
  },
})
