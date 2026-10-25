# Newly Backend (per-project)

Per-project backend for a Newly project. Two Cloudflare Workers share one
Neon Postgres project:

- **`auth-service/`** — Hono + Better Auth on Cloudflare Workers. Owns
  sign-up / sign-in, OAuth, and JWKS.
- **`api-service/`** — Hono + Drizzle + jose JWT verifier on Cloudflare
  Workers. Every other app endpoint. Verifies bearer JWTs against
  auth-service's JWKS.

> Previously this was Python FastAPI + Bun + Cloud Run; ported to Hono +
> Drizzle + Better Auth on Cloudflare Workers in June 2026.

## Commands

Both services expose the same bun scripts:

| Command            | Purpose                                                      |
| ------------------ | ------------------------------------------------------------ |
| `bun install`      | Install dependencies                                         |
| `bun run dev`      | Run the Worker locally via wrangler                          |
| `bun run typecheck`| TypeScript checks                                            |
| `bun run test`     | vitest with `@cloudflare/vitest-pool-workers`                |
| `bun run deploy`   | `wrangler deploy`                                            |
| `bun run db:generate`| Generate a Drizzle migration from `src/db/schema.ts`         |
| `bun run db:migrate`| Apply pending migrations (the deploy does this for you)      |

Both services talk to Neon Postgres through the `@neondatabase/serverless`
HTTP driver — no TCP pool, no connection-string juggling, works inside the
Workers runtime.

## Adding tables

1. Edit `src/db/schema.ts` in the relevant service.
2. `bun run db:generate`: Drizzle Kit writes a new numbered migration into
   `drizzle/`, alongside the `0000_baseline.sql` the template ships. If it fails
   with `drizzle-kit: command not found`, run `bun install` in the service
   directory first.
3. `newly deploy --env dev` applies migrations on the control plane.

Don't run `bun run db:migrate` by hand: the database URL is a server-side secret
and is not present in your working copy. The deploy is what applies migrations.

Migrations are the only way this database changes. In particular:

- **Never edit or delete `drizzle/0000_baseline.sql` or `drizzle/meta/`.** The
  baseline creates the service's Postgres schema and its starting tables, and
  the snapshot under `meta/` is what lets `db:generate` emit a small delta
  instead of regenerating everything.
- **Never write a migration, a journal entry or a snapshot by hand.** For SQL
  Drizzle Kit cannot generate (seed data, a backfill), run
  `bun run db:generate --custom --name=<name>` and write the SQL into the empty
  file it creates.
- Don't run `drizzle-kit push`. It writes the same tables without recording a
  migration, which leaves the database and the journal disagreeing.
- Each service records applied migrations in its own Postgres schema
  (`api.__drizzle_migrations` / `auth.__drizzle_migrations`). The deploy applies
  every journal entry that is not recorded there yet, in journal order, whatever
  its `when` says. Never change a `when` to get a migration applied or skipped.

### Tables owned by each service

- **auth-service**: `user`, `session`, `account`, `verification`, `jwks`.
  Better Auth's standard schema. Don't add app tables here.
- **api-service**: `kv_entries` plus your tenant tables (anything the app
  needs).

## Deploy

`wrangler deploy` ships the Worker. Newly tooling injects project-specific
bindings before deploy. Don't hand-edit generated binding values in
`wrangler.toml` expecting them to survive — they get overwritten on the next
platform deploy.

## Tests

`bun run test` runs vitest under `@cloudflare/vitest-pool-workers`, so tests
execute inside a real workerd runtime with the service's bindings available.
Use this for anything that touches `env`, KV, or the Hono app instance.

## Managed App AI

For runtime chat, images, speech, or video use `newlyAi` from `src/platform/ai.ts`.
Run `newly ai status`, then `newly ai enable --models chat,speech --env dev` for the
capabilities the app needs. Usage consumes the owner’s existing Newly credits, shared with prompting. Deploy
normally; Newly injects `NEWLY_AI_URL` and `NEWLY_AI_TOKEN` as server bindings.
Never expose either credential to mobile code or ask for provider API keys.

Add application-specific routes behind `authMiddleware`. Construct the client with
`newlyAi(c.env, c.get('userId'))`. Call `generate({ model: 'speech', prompt: text },
idempotencyKey)` and return the job ID. Pass the same verified user to `get`, `cancel`,
and `output`; each is scoped to that user. Forward `output` as the authenticated
route's Response. Reuse the idempotency key for retries of the same user action.
Validate product-specific inputs; do not accept arbitrary upstream URLs or models.
Show queued/running/error states in the app and poll the backend for completion.

For chat, iterate `streamText({prompt}, idempotencyKey, signal)` and forward the
text chunks through an authenticated streaming route. The SDK resumes reads by
character offset; reconnecting never submits a second generation. Disconnecting
stops reading, not the paid job. `cancel` only cancels work that is still queued.
Use `quote(input)` to show the maximum charge before an expensive action. Outputs
expire after seven days; copy an output into the app's storage if it must persist.

### Uploaded media and mixed references

Use `aiMedia(file)` from `src/platform/ai.ts` to convert a verified user's uploaded
`File`/`Blob` into `{ type, data }`. Pass the references in `media`; no public upload
URL or provider credential is needed. The server probes the actual file before
reserving Newly credits. The combined upload limit is 16 MiB per request. Supported
formats: PNG/JPEG/WebP images, MP4/MOV videos, MP3/WAV audio, and PDFs for Gemini.

- Image understanding: `streamText({ model: 'chat', prompt: 'Describe these images', media: [image] }, key)`. GPT-5.6 Luna accepts four images, each up to 4096×4096.
- Multimodal understanding: Gemini 3.8 Flash (`gemini-3-8-flash`) accepts text with images, video, audio and PDFs together (up to four of each). PDFs must be unencrypted and at most 100 pages. Text streams; billing includes actual provider input and output tokens, including thinking.
- Image generation and editing: `generate({ model: 'image', prompt, width: 1024, height: 1024 }, key)` draws a new image. Add `media: [photo]` and it edits that photo instead, keeping what the prompt says to keep (the same face with a new hairstyle, the same room in a new style). GPT Image 2.5 accepts up to eight references of four megapixels each. Output dimensions are 256–2048, multiples of 32, at most four megapixels and no wider than 3:1; a request under about 0.63 megapixels is drawn larger at the same shape. The output is a JPEG. Credits follow the tokens the model uses. A job that fails with `error: 'safety_flagged'` was refused by the model's safety system for its prompt or a photo: nothing is charged, and the app should tell the user this one can't be used instead of retrying.
- Video editing: `generate({ model: 'seedance', task: 'editing', prompt: 'Add a hat to the dancer in @Video1', media: [video, image, audio], generateAudio: true }, key)`. Editing preserves source duration; omit `seconds`.
- Video extension: select `task: 'extension'` and supply a video. `seconds` controls the continuation. Use `task: 'reference'` for a new composition guided by the references.
- Kling: text or a start image generates 3–15 seconds of video, with optional `generateAudio`. The first media item is the start image and controls aspect ratio; omit `aspectRatio` for image-to-video. An optional second image is the end frame. For explicit references, `endImage` is an index into `media`; `elements: [{ videoIndex: 1 }, { imageIndices: [2, 3] }]` maps character/object references. Every attachment must be assigned. Refer to elements as `@Element1`, etc. An element is either one video or a frontal image followed by reference images.
- Speech: `generate({ model: 'speech', prompt: text, voice: voiceId }, key)` accepts an ElevenLabs voice ID. Omit it for the default. For dialogue use `dialogue: [{ text: 'Hello', voice: 'Aria' }, { text: 'Hi', voice: 'Rachel' }]` instead of prompt/voice. Up to 5,000 characters total.
- Transcription: `generate({ model: 'transcribe', media: [audioOrVideo], responseFormat: 'json', diarize: true, languageCode: 'eng' }, key)`. Video requires an audio track, which Newly extracts. JSON returns `text`, `words` (timestamps and `speaker_id`), `languageCode`, and `languageProbability`; omit `responseFormat` for plain text.
- Voice conversion: `generate({ model: 'voice-change', media: [audio], voice: 'Aria' }, key)`. This preserves speech; it does not translate or follow arbitrary editing prompts.

Seedance accepts up to 30 images, 10 videos, 10 audio files (50 total), subject to
the combined 16 MiB limit. Audio references require an image or video. Number
references separately by type (`@Image1`, `@Video1`, `@Audio1`). Each reference clip
must be 1.8–30.2 seconds, with at most 30.2 seconds total per video/audio type.
Videos require 300–6000 pixels per side, aspect ratio 0.4–2.5, and 24–60 FPS.
Output supports 4–30 seconds, `resolution: '480p' | '720p' | '1080p'` and
`aspectRatio: 'auto' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'`.
Editing requires a source video of at least four seconds. Editing and extension select aspect ratio automatically; omit `aspectRatio` or use `auto`. Quote reserves for the
maximum automatic output; final video cost uses measured output dimensions and
duration, with input-video seconds included.

Read `newly ai status` capabilities, per-operation `operations` availability, and `referenceAvailable` before building a
workflow. Missing provider prices fail closed. Transcription and voice conversion
accept one file up to ten minutes, within the byte limit. Outputs use async jobs;
only LLM text supports incremental streaming. Never promise exact frame preservation
from generative editing. Report provider errors rather than dropping attachments
or repeatedly submitting the same generation.
