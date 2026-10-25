export type ObservableEvent = {
  ts: string
  level: 'info' | 'warn' | 'error'
  msg: string
  request_id?: string
  duration_ms?: number
  meta?: Record<string, unknown>
}

export function logEvent(ev: Omit<ObservableEvent, 'ts'>): void {
  const out: ObservableEvent = { ts: new Date().toISOString(), ...ev }
  if (ev.level === 'error') console.error(JSON.stringify(out))
  else if (ev.level === 'warn') console.warn(JSON.stringify(out))
  else console.log(JSON.stringify(out))
}
