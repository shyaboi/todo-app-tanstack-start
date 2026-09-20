import { useSyncExternalStore } from 'react'

/* Failure toasts (PLAN.md 7.1, system design 12, 13).

   A tiny external store, not a context and not an app-state library: a toast
   is ephemeral UI that any mutation hook may raise and exactly one host
   renders, so the two are decoupled through a subscription rather than by
   threading a callback through every page. Nothing here is server state, and
   nothing here survives a reload -- which is correct for a notice about a
   write that already failed. */

export interface Toast {
  id: string
  /** The design's three parts, in one message: what happened, what the app did, what to do. */
  message: string
  /** Correlates the notice with the server's log line, for a bug report. */
  errorId?: string
  /** Re-run the write that failed, with the same input. */
  retry?: () => void
}

/** How long a failure stays on screen without being acted on. */
export const TOAST_MS = 12_000

const EMPTY: readonly Toast[] = []
let toasts: readonly Toast[] = EMPTY
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let seq = 0

function emit() {
  for (const listener of listeners) listener()
}

export function pushToast(toast: Omit<Toast, 'id'>): string {
  const id = `toast-${++seq}`
  toasts = [...toasts, { ...toast, id }]
  timers.set(
    id,
    setTimeout(() => dismissToast(id), TOAST_MS),
  )
  emit()
  return id
}

export function dismissToast(id: string): void {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  if (toasts.length === 0) toasts = EMPTY
  emit()
}

/** Test seam. */
export function clearToasts(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  toasts = EMPTY
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => toasts
// The server never has toasts, and must say so with the same reference every
// time or hydration sees a change that never happened.
const getServerSnapshot = () => EMPTY

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
