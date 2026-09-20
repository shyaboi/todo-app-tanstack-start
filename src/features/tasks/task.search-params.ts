import { z } from 'zod'
import { LIST_IDS, TASK_STATUSES } from './task.types'
import type { ListId, TaskStatus } from './task.types'
import type { DueFilter, SortOrder, TaskFilters } from './task.filters'

/* The URL is the source of truth for what the list is showing, so a result set
   is a link: refresh, Back and Forward all behave, and a filtered view can be
   pasted to someone (system design 10, Failure Check 7).

   Anything here arrives from a URL, which means anyone can type it. The rule is
   that a malformed parameter FALLS BACK rather than throwing: a bad link should
   show the unfiltered list, not an error page. Every field is therefore
   `.catch()`-ed to a default, so validation can never reject a navigation.

   The validated shape mirrors the URL exactly -- status is the comma-joined
   string the address bar shows, not an array. TanStack Router stringifies the
   VALIDATED search, so anything that is an array here would come out as JSON
   (`?status=%5B%22done%22%5D`). The array is derived, by splitStatus. */

const isStatus = (s: string): s is TaskStatus =>
  (TASK_STATUSES as readonly string[]).includes(s)

/** `todo,doing` -> ['todo', 'doing']. Tolerant of spaces; deduplicated. */
export function splitStatus(value: string | undefined): TaskStatus[] {
  if (!value) return []
  return [
    ...new Set(
      value
        .split(',')
        .map((s) => s.trim())
        .filter(isStatus),
    ),
  ]
}

/** ['todo', 'doing'] -> `todo,doing`; an empty selection is no filter at all. */
export function joinStatus(
  statuses: readonly TaskStatus[],
): string | undefined {
  const unique = [...new Set(statuses)]
  return unique.length > 0 ? unique.join(',') : undefined
}

/* TanStack Router JSON-parses search values, so `?q=123` arrives as the number
   123 and `?q=true` as a boolean. A string-only field would silently drop the
   search for anything that happens to parse; scalars are coerced back. */
const scalarText = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((v) => String(v))

/* Accepts the string form from the address bar and the array form a value
   written from code arrives as, and normalises both to the string form. */
const statusParam = z
  .union([z.string(), z.array(z.string())])
  .transform((raw) =>
    joinStatus(splitStatus(Array.isArray(raw) ? raw.join(',') : raw)),
  )

export const taskSearchSchema = z.object({
  /* Trimmed and length-capped here as well as server-side. A 10,000-character
     query in a URL is not a search, and it would be handed to a regex. */
  q: scalarText.pipe(z.string().trim().max(200)).optional().catch(undefined),

  status: statusParam.optional().catch(undefined),

  due: z
    .enum(['any', 'overdue', 'today', 'week', 'none'])
    .optional()
    .catch(undefined)
    // `any` is the default, so it never needs to appear in the URL.
    .transform((v) => (v === 'any' ? undefined : v)),

  sort: z.enum(['due', 'created', 'relevance']).optional().catch(undefined),

  list: z.enum(LIST_IDS).optional().catch(undefined),
})

/** What the route hands to components. Every field optional and already valid. */
export interface TaskSearch {
  q?: string | undefined
  /** Comma-joined, e.g. `todo,doing`. Use splitStatus to read it. */
  status?: string | undefined
  due?: Exclude<DueFilter, 'any'> | undefined
  sort?: SortOrder | undefined
  list?: ListId | undefined
}

/**
 * Parses a raw search object from the router.
 *
 * `validateSearch` in TanStack Router runs on every navigation, so this must
 * never throw -- the schema catches per field instead of rejecting the whole
 * object, which means one bad parameter does not discard the good ones.
 */
export function parseTaskSearch(raw: unknown): TaskSearch {
  const result = taskSearchSchema.safeParse(raw)
  // Belt and braces: the per-field catches should make failure impossible, but
  // a navigation must survive even if a future edit breaks that.
  return result.success ? stripUndefined(result.data) : {}
}

/** Keeps absent keys out of the URL rather than writing `?q=&due=`. */
function stripUndefined(search: TaskSearch): TaskSearch {
  const out: TaskSearch = {}
  if (search.q) out.q = search.q
  if (search.status) out.status = search.status
  if (search.due) out.due = search.due
  if (search.sort) out.sort = search.sort
  if (search.list) out.list = search.list
  return out
}

/** Adapts validated search params to what the pure filter functions expect. */
export function toFilters(search: TaskSearch): TaskFilters {
  return {
    q: search.q,
    status: splitStatus(search.status),
    due: search.due,
    sort: search.sort,
    list: search.list,
  }
}
