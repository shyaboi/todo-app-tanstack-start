/* `lastView` (PLAN.md D5): a device preference, in localStorage, never in a
   link and never sent to the server. It decides one thing -- where a bare
   visit to / lands -- and nothing else reads it.

   Safe to import from server-rendered code: nothing here touches storage at
   module scope, only inside functions the routes call from effects. It is
   therefore NOT named *.client.ts -- TanStack Start treats that suffix as
   client-only and fails server rendering of anything that imports it, which
   is how the first version of this file broke SSR of the whole list.

   Guarded throughout: storage can be absent or throwing (private windows,
   blocked site data), and the app must land somewhere regardless. */

const KEY = 'tasker:lastView'

export type View = 'list' | 'board'

export function readLastView(): View | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw === 'board' || raw === 'list' ? raw : null
  } catch {
    return null
  }
}

export function rememberView(view: View): void {
  try {
    localStorage.setItem(KEY, view)
  } catch {
    // A preference that cannot be kept is not an error.
  }
}

/* Only the page load may bounce. "Bare" means the address carries no filters:
   a link that says ?status=todo shows what it says, whatever was open last.
   Going to / later -- by G I, V, or the sidebar -- is a choice, and never
   bounces.

   "Later" is measured from the app's first commit, not from the first time /
   is rendered. The difference matters: a page that LOADED on /board has never
   rendered /, and the first click on Inbox must not count as a bare visit --
   it did, once, and Inbox was unreachable from the board. The shell marks the
   boot in its mount effect; the routes' effects run before it (children
   first), which is exactly the window in which a bounce is legitimate. */
let booted = false

export function markBooted(): void {
  booted = true
}

export function bootRedirectsToBoard(hasSearch: boolean): boolean {
  if (booted) return false
  return !hasSearch && readLastView() === 'board'
}
