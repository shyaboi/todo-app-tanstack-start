/* A list is a name a task can belong to, owned by one person (PLAN.md D14).
   Nothing more: no colour, no order, no nesting. Those are the features a
   generic "lists" module grows and this one is not going to. */

export interface List {
  /** Server-generated. Opaque to the client. */
  id: string
  name: string
  createdAt: string
}

/** The name for an id, or null -- the id may belong to a list since deleted. */
export function listName(
  lists: readonly List[],
  id: string | null,
): string | null {
  if (!id) return null
  return lists.find((l) => l.id === id)?.name ?? null
}

/** Case-insensitive, whitespace-tolerant match on the name: `#docs` finds "Docs". */
export function findListByName(
  lists: readonly List[],
  name: string,
): List | null {
  const key = normaliseListName(name)
  return lists.find((l) => normaliseListName(l.name) === key) ?? null
}

/** The comparison key for uniqueness: what the server indexes on too. */
export function normaliseListName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Which of the four palette accents a list wears, by its position in the
 * owner's own order (PLAN.md 8.4c).
 *
 * Deliberately derived rather than stored: a `colour` field would be a
 * product decision -- a picker, a default, a migration -- for something the
 * design only uses to tell two chips apart at a glance. The name is always
 * beside the dot, so the colour never carries meaning on its own, and four
 * accents from the existing palette beat any hue invented per list.
 */
export function listAccent(
  lists: readonly { id: string }[],
  listId: string,
): string {
  const i = lists.findIndex((l) => l.id === listId)
  return String(i < 0 ? 0 : i % 4)
}
