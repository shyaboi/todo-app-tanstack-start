import { listName } from './task.types'
import type { ListId, Task, TaskStatus } from './task.types'

/* Derived data, derived. The canonical query holds the unfiltered list and
   these functions compute what is on screen from it, so there is never a second
   filtered copy to fall out of step (system design 10, PLAN.md D4).

   Everything here is pure and takes `now` as an argument rather than reading the
   clock. That is not tidiness: a function that calls `Date.now()` during render
   makes the server and the client disagree, which is the hydration mismatch that
   already bit the overdue styling once. It also makes every date case testable
   without freezing time globally. */

export type DueFilter = 'any' | 'overdue' | 'today' | 'week' | 'none'
export type SortOrder = 'due' | 'created' | 'relevance'

export interface TaskFilters {
  q?: string | undefined
  status?: readonly TaskStatus[] | undefined
  due?: DueFilter | undefined
  sort?: SortOrder | undefined
  list?: ListId | undefined
}

/** Local midnight today. The design treats Overdue and Today as separate. */
export function startOfDay(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(now: Date): Date {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * Text match over the fields the design says search covers: title, notes and
 * list name.
 *
 * Case-insensitive substring, not fuzzy. Fuzzy matching belongs to the command
 * palette, where the candidate set is small and known; applied to a task list it
 * mostly produces confident wrong answers.
 */
export function matchesQuery(task: Task, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (needle === '') return true

  return [task.title, task.notes ?? '', listName(task.listId) ?? ''].some(
    (field) => field.toLowerCase().includes(needle),
  )
}

export function matchesDue(task: Task, due: DueFilter, now: Date): boolean {
  if (due === 'any') return true
  if (task.dueAt === null) return due === 'none'
  if (due === 'none') return false

  const dueAt = new Date(task.dueAt).getTime()

  switch (due) {
    case 'overdue':
      // Before today began. A task due later today is Today, not Overdue.
      return dueAt < startOfDay(now).getTime()
    case 'today':
      return (
        dueAt >= startOfDay(now).getTime() && dueAt <= endOfDay(now).getTime()
      )
    case 'week': {
      const weekEnd = endOfDay(now)
      weekEnd.setDate(weekEnd.getDate() + 7)
      // Includes anything already overdue: "this week" is a window you are
      // inside, and hiding what is late within it would be a strange answer.
      return dueAt <= weekEnd.getTime()
    }
    default:
      /* Unreachable by the type, reachable from a URL. A value the type does
         not know must mean "no filter": returning undefined here would read
         as false and silently exclude every task. */
      return true
  }
}

/** Every filter, applied together. Order does not matter; all must pass. */
export function filterTasks(
  tasks: readonly Task[],
  filters: TaskFilters,
  now: Date,
): Task[] {
  const { q, status, due, list } = filters

  return tasks.filter((task) => {
    // An empty status array means "no status filter", not "match nothing" --
    // otherwise clearing the last checkbox would blank the list.
    if (status && status.length > 0 && !status.includes(task.status))
      return false
    if (due && !matchesDue(task, due, now)) return false
    if (list && task.listId !== list) return false
    if (q && !matchesQuery(task, q)) return false
    return true
  })
}

/* Relevance: a title hit beats a hit anywhere else, because that is what the
   person was looking at when they typed. Beyond that, earlier in the title
   beats later. */
function relevance(task: Task, q: string): number {
  const needle = q.trim().toLowerCase()
  if (needle === '') return 0

  const titleAt = task.title.toLowerCase().indexOf(needle)
  if (titleAt === 0) return 0 // starts with it
  if (titleAt > 0) return 1
  return 2 // matched notes or list only
}

/**
 * Sorting. Returns a new array; never mutates its input, because the input is
 * the Query cache and mutating it would corrupt every other reader.
 */
export function sortTasks(
  tasks: readonly Task[],
  sort: SortOrder | undefined,
  q: string | undefined,
): Task[] {
  const copy = [...tasks]

  if (sort === 'due') {
    return copy.sort((a, b) => {
      // Undated tasks sort last rather than first: "no date" is not "urgent".
      if (a.dueAt === null && b.dueAt === null) return byCreatedDesc(a, b)
      if (a.dueAt === null) return 1
      if (b.dueAt === null) return -1
      const diff = Date.parse(a.dueAt) - Date.parse(b.dueAt)
      return diff !== 0 ? diff : byCreatedDesc(a, b)
    })
  }

  if (sort === 'relevance' && q?.trim()) {
    return copy.sort((a, b) => {
      const diff = relevance(a, q) - relevance(b, q)
      return diff !== 0 ? diff : byCreatedDesc(a, b)
    })
  }

  // Default, and the fallback when relevance is asked for without a query.
  return copy.sort(byCreatedDesc)
}

/** Newest first, and a stable tiebreak so the order never flickers. */
function byCreatedDesc(a: Task, b: Task): number {
  const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt)
  // Same timestamp happens easily when seeding or creating in a loop; falling
  // back to the id keeps the sort total rather than implementation-defined.
  return diff !== 0 ? diff : a.id.localeCompare(b.id)
}

export type GroupKey =
  'overdue' | 'today' | 'week' | 'later' | 'nodate' | 'done'

export interface TaskGroup {
  key: GroupKey
  label: string
  tasks: Task[]
}

const GROUP_ORDER: readonly { key: GroupKey; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Later this week' },
  { key: 'later', label: 'Later' },
  { key: 'nodate', label: 'No date' },
  { key: 'done', label: 'Completed' },
]

function groupOf(task: Task, now: Date): GroupKey {
  // Completed tasks leave the date groups entirely: the design shows them in
  // their own section at the bottom, whenever they were due.
  if (task.status === 'done') return 'done'
  if (task.dueAt === null) return 'nodate'

  const dueAt = new Date(task.dueAt).getTime()
  if (dueAt < startOfDay(now).getTime()) return 'overdue'
  if (dueAt <= endOfDay(now).getTime()) return 'today'

  const weekEnd = endOfDay(now)
  weekEnd.setDate(weekEnd.getDate() + 7)
  return dueAt <= weekEnd.getTime() ? 'week' : 'later'
}

/**
 * Groups for the list view, in the design's order, with empty groups dropped.
 *
 * Returning groups rather than a flat list keeps the headings and their counts
 * in one place; a component computing its own counts is how a heading ends up
 * disagreeing with the rows beneath it.
 */
export function groupByDue(tasks: readonly Task[], now: Date): TaskGroup[] {
  const buckets = new Map<GroupKey, Task[]>()
  for (const task of tasks) {
    const key = groupOf(task, now)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(task)
    else buckets.set(key, [task])
  }

  return GROUP_ORDER.flatMap(({ key, label }) => {
    const group = buckets.get(key)
    return group && group.length > 0 ? [{ key, label, tasks: group }] : []
  })
}

/** How many of each status are in a set, for the filter panel's live counts. */
export function countByStatus(
  tasks: readonly Task[],
): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = { todo: 0, doing: 0, done: 0 }
  for (const task of tasks) counts[task.status] += 1
  return counts
}

/**
 * How many tasks the query matches but the status filter is hiding.
 *
 * Powers the design's "2 completed tasks also match but are hidden by the
 * status filter" line -- the difference between an empty result and a
 * misleading one.
 */
export function hiddenByStatus(
  tasks: readonly Task[],
  filters: TaskFilters,
  now: Date,
): number {
  if (!filters.status || filters.status.length === 0) return 0

  const withoutStatus = filterTasks(
    tasks,
    { ...filters, status: undefined },
    now,
  )
  const withStatus = filterTasks(tasks, filters, now)
  return withoutStatus.length - withStatus.length
}

/** True when any filter is narrowing the list, for "Clear all" and the empties. */
export function hasActiveFilters(filters: TaskFilters): boolean {
  return Boolean(
    filters.q?.trim() ||
    (filters.status && filters.status.length > 0) ||
    (filters.due && filters.due !== 'any') ||
    filters.list,
  )
}
