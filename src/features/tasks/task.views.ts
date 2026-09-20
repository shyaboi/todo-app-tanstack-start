import { LISTS, listName } from './task.types'
import type { ListId, Task } from './task.types'
import { matchesDue } from './task.filters'
import type { TaskSearch } from './task.search-params'

/* The sidebar's vocabulary. A "view" is not a new kind of state -- it is a
   name for a particular URL (PLAN.md 4.1: the URL owns the filters, and every
   result set is a link). These helpers only read the search params and the
   cached list; nothing here is stored anywhere. */

export type ActiveView =
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'list'; id: ListId }
  | { kind: 'other' }

/**
 * Which sidebar entry the current URL corresponds to, if any. A URL with a
 * status filter or a query on top of a view still belongs to that view --
 * "Today, filtered to In progress" is still Today.
 */
export function activeView(search: Partial<TaskSearch>): ActiveView {
  if (search.list) return { kind: 'list', id: search.list }
  if (search.due === 'today') return { kind: 'today' }
  if (search.due === undefined) return { kind: 'inbox' }
  return { kind: 'other' }
}

/** The page's h1: what you are looking at, in the sidebar's own words. */
export function viewTitle(search: Partial<TaskSearch>): string {
  const view = activeView(search)
  switch (view.kind) {
    case 'list':
      return listName(view.id) ?? 'Inbox'
    case 'today':
      return 'Today'
    case 'inbox':
      return 'Inbox'
    case 'other':
      return DUE_TITLE[search.due ?? ''] ?? 'Inbox'
  }
}

const DUE_TITLE: Record<string, string> = {
  overdue: 'Overdue',
  week: 'This week',
  none: 'No date',
}

/* Counts are of OPEN tasks: a badge is a to-do count, not an archive size.
   The view behind the link may show more rows than this when it includes
   completed ones, and that is fine -- the number says how much is left. */
const open = (task: Task) => task.status !== 'done'

export function inboxCount(tasks: readonly Task[]): number {
  return tasks.filter(open).length
}

export function todayCount(tasks: readonly Task[], now: Date): number {
  return tasks.filter((t) => open(t) && matchesDue(t, 'today', now)).length
}

export function listCount(tasks: readonly Task[], listId: ListId): number {
  return tasks.filter((t) => open(t) && t.listId === listId).length
}

export function listCounts(tasks: readonly Task[]): Record<ListId, number> {
  const counts = Object.fromEntries(LISTS.map((l) => [l.id, 0])) as Record<
    ListId,
    number
  >
  for (const task of tasks) {
    if (open(task) && task.listId) counts[task.listId] += 1
  }
  return counts
}
