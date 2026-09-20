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
