import type { HonoEnv } from '../env'

export interface TaskContext {
  env: HonoEnv['Bindings']
  name: string
}

export type TaskHandler = (payload: unknown, ctx: TaskContext) => Promise<void> | void

// Registry of named task handlers. The /_internal/task/:name route looks
// the handler up by name; the Queue consumer in src/index.ts can do the
// same. Register on app boot (top-level or before the default export);
// the Worker runtime keeps modules around across requests, so a one-shot
// registration is enough.
const handlers: Record<string, TaskHandler> = {}

export function registerTask(name: string, handler: TaskHandler): void {
  handlers[name] = handler
}

export function clearTaskHandlers(): void {
  for (const k of Object.keys(handlers)) delete handlers[k]
}

export function getTaskHandler(name: string): TaskHandler | null {
  return handlers[name] ?? null
}

export function getTaskNames(): string[] {
  return Object.keys(handlers).sort()
}
