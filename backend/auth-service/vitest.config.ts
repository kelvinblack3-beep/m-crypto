import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    // Inlined so Vite applies the packages' `browser` field (as wrangler does when
    // it bundles); loaded raw, OTel's node host detector imports node:os.
    server: { deps: { inline: [/@opentelemetry\//, /@microlabs\/otel-cf-workers/] } },
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          compatibilityDate: '2025-06-01',
          compatibilityFlags: ['nodejs_compat'],
          kvNamespaces: ['KV_CACHE'],
          bindings: { NEWLY_ENV: 'test', LOG_LEVEL: 'silent' },
        },
      },
    },
  },
})
