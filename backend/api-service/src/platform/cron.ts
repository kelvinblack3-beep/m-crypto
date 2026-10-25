import type { ScheduledController } from '@cloudflare/workers-types'
import type { HonoEnv } from '../env'

export type CronHandler = (controller: ScheduledController, env: HonoEnv['Bindings']) => Promise<void> | void

interface CronEntry {
  name: string
  cronExpr: string
  handler: CronHandler
}

// Dual index: native `scheduled()` triggers fire by cron expression; the
// internal /_internal/cron/:name endpoint fires by friendly name so Newly can
// re-run a job out-of-cycle or force-trigger without depending on CF's
// scheduler. Names must be unique; expressions can be shared if multiple
// handlers want the same cadence (last-write wins on the expr index — register
// with distinct exprs to keep both reachable via scheduled()).
const byExpr: Record<string, CronEntry> = Object.create(null) as Record<string, CronEntry>
const byName: Record<string, CronEntry> = Object.create(null) as Record<string, CronEntry>

export function registerCron(cronExpr: string, name: string, handler: CronHandler): void {
  const entry: CronEntry = { name, cronExpr, handler }
  byExpr[cronExpr] = entry
  byName[name] = entry
}

export function clearCronHandlers(): void {
  for (const k of Object.keys(byExpr)) delete byExpr[k]
  for (const k of Object.keys(byName)) delete byName[k]
}

export function hasCronHandler(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(byName, name)
}

export function getCronManifest(): Array<{ name: string; cronExpr: string }> {
  return Object.values(byName).map((e) => ({ name: e.name, cronExpr: e.cronExpr }))
}

export async function dispatchCron(controller: ScheduledController, env: HonoEnv['Bindings']): Promise<void> {
  const entry = byExpr[controller.cron]
  if (!entry) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', msg: 'no_cron_handler', cron: controller.cron }))
    return
  }
  await entry.handler(controller, env)
}

export async function dispatchCronByName(name: string, env: HonoEnv['Bindings']): Promise<void> {
  const entry = byName[name]
  if (!entry) {
    throw new Error(`no cron handler registered for name: ${name}`)
  }
  // Synthesize a ScheduledController so name-dispatched runs see the same
  // shape as native scheduled() triggers. noRetry() is a no-op because
  // there's no CF scheduler to instruct.
  const controller = {
    cron: entry.cronExpr,
    scheduledTime: Date.now(),
    noRetry: () => undefined,
  } as unknown as ScheduledController
  await entry.handler(controller, env)
}

export type { ScheduledController }
