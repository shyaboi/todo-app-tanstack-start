/* The application's view of a task. Deliberately boring, per the system
   design: no revision history, no soft deletion, no polymorphic types.
   Scope follows PLAN.md D1 -- assignees, subtasks and an activity log are
   designed but not built, because each implies a `user` the app does not have. */

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/* Wire and storage use todo/doing/done (PLAN.md D2). These are the words a
   person reads; nothing else in the app should spell a status itself. */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'In progress',
  done: 'Done',
}

/** Space on a selected row advances todo -> doing -> done, then wraps. */
export function nextStatus(status: TaskStatus): TaskStatus {
  const i = TASK_STATUSES.indexOf(status)
  return TASK_STATUSES[(i + 1) % TASK_STATUSES.length]!
}

export const PRIORITIES = ['p1', 'p2', 'p3'] as const
export type Priority = (typeof PRIORITIES)[number]

export const PRIORITY_LABEL: Record<Priority, string> = {
  p1: 'P1 — Urgent',
  p2: 'P2 — Normal',
  p3: 'P3 — Low',
}

/* Lists are a fixed vocabulary, not a collection. The design shows four, and
   a `lists` collection with its own CRUD is premature here (system design 19).
   Keeping it closed also means listId is server-validated against a known set
   rather than being free user input. Creating lists from the composer is
   therefore cut -- noted in the README. */
export const LISTS = [
  { id: 'ship-v1', name: 'Ship v1' },
  { id: 'docs', name: 'Docs' },
  { id: 'infra', name: 'Infra' },
  { id: 'polish', name: 'Polish' },
] as const

export type ListId = (typeof LISTS)[number]['id']
export const LIST_IDS = LISTS.map((l) => l.id) as unknown as readonly [
  ListId,
  ...ListId[],
]

export function listName(id: ListId | null): string | null {
  return LISTS.find((l) => l.id === id)?.name ?? null
}

/**
 * What every server function returns and every component consumes.
 * Never a driver document: the repository maps `WithId<Document>` into this at
 * the boundary, so no React component depends on Mongo's shapes
 * (system design Failure Check 5).
 */
export interface Task {
  /** Server-generated. Opaque to the client. */
  id: string
  title: string
  notes: string | null
  status: TaskStatus
  /** ISO instant, or null. Server-owned format, resolved client-side. */
  dueAt: string | null
  priority: Priority
  listId: ListId | null
  /** Server-owned. The client never supplies these. */
  createdAt: string
  updatedAt: string
}

/* The design shows refs like TSK-118. A sequence counter would mean an extra
   write on the create path for a cosmetic label, so the ref is derived from
   the id instead (PLAN.md D8). */
export function displayRef(id: string): string {
  return `TSK-${id.slice(-4).toUpperCase()}`
}
