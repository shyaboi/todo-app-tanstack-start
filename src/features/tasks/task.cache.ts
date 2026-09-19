import type { Task } from './task.types'

/* The cache transformations, as pure functions.
   Keeping them out of the hooks means the rollback contract can be asserted
   directly -- "the cache is byte-identical to the snapshot after a failure"
   is the assertion that matters, and it should not require a React tree,
   a fake server and a scheduler to express. */

export function replaceTask(tasks: Task[], next: Task): Task[] {
  return tasks.map((t) => (t.id === next.id ? next : t))
}

export function patchTask(
  tasks: Task[],
  id: string,
  patch: Partial<Omit<Task, 'id'>>,
): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, ...patch } : t))
}

export function removeTask(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.id !== id)
}

/**
 * Puts a removed task back where it was.
 *
 * Re-inserting at the end would silently reorder the list on every failed or
 * undone delete. The index is captured before removal and restored with it,
 * so an undo leaves the list exactly as it was found.
 */
export function insertTaskAt(tasks: Task[], task: Task, index: number): Task[] {
  const next = [...tasks]
  next.splice(Math.max(0, Math.min(index, next.length)), 0, task)
  return next
}

export function indexOfTask(tasks: Task[], id: string): number {
  return tasks.findIndex((t) => t.id === id)
}
