import { z } from 'zod'
import { TASK_STATUSES } from './task.types'
import type { TaskStatus } from './task.types'
import type { DueFilter, SortOrder, TaskFilters } from './task.filters'

/* The URL is the source of truth for what the list is showing, so a result set
   is a link: refresh, Back and Forward all behave, and a filtered view can be
   pasted to someone (system design 10, Failure Check 7).

   Anything here arrives from a URL, which means anyone can type it. The rule is
   that a malformed parameter FALLS BACK rather than throwing: a bad link should
   show the unfiltered list, not an error page. Every field is therefore
   `.catch()`-ed to a default, so validation can never reject a navigation. */

const isStatus = (s: string): s is TaskStatus =>
  (TASK_STATUSES as readonly string[]).includes(s)

/* `?status=todo,doing` is what the URL carries, because it reads well. But
   TanStack Router JSON-parses search values, so a value written as an array
   ARRIVES as an array. Accepting both means a filter set from code and a filter
   typed by hand are the same filter; accepting only one would silently drop
   the other. Either way the result is a deduplicated array of valid statuses. */
const statusList = z
  .union([z.string(), z.array(z.string())])
  .transform((raw) => (Array.isArray(raw) ? raw : raw.split(',')))
  .transform((list) => [...new Set(list.map((s) => s.trim()).filter(isStatus))])

export const taskSearchSchema = z.object({
  /* Trimmed and length-capped here as well as server-side. A 10,000-character
     query in a URL is not a search, and it would be handed to a regex. */
  q: z.string().trim().max(200).optional().catch(undefined),

  status: statusList
    .optional()
    .catch(undefined)
    // An empty list means "no filter"; dropping the key keeps the URL clean.
    .transform((list) => (list && list.length > 0 ? list : undefined)),

  due: z
    .enum(['any', 'overdue', 'today', 'week', 'none'])
    .optional()
    .catch(undefined)
    // `any` is the default, so it never needs to appear in the URL.
    .transform((v) => (v === 'any' ? undefined : v)),

  sort: z.enum(['due', 'created', 'relevance']).optional().catch(undefined),
})

/** What the route hands to components. Every field optional and already valid. */
export interface TaskSearch {
  q?: string | undefined
  status?: TaskStatus[] | undefined
  due?: Exclude<DueFilter, 'any'> | undefined
  sort?: SortOrder | undefined
}

/**
 * Parses a raw search object from the router.
 *
 * `validateSearch` in TanStack Router runs on every navigation, so this must
 * never throw -- the schema catches per field instead of rejecting the whole
 * object, which means one bad parameter does not discard the good ones.
 */
export function parseTaskSearch(raw: Record<string, unknown>): TaskSearch {
  const result = taskSearchSchema.safeParse(raw)
  // Belt and braces: the per-field catches should make failure impossible, but
  // a navigation must survive even if a future edit breaks that.
  return result.success ? stripUndefined(result.data) : {}
}

/** Keeps absent keys out of the URL rather than writing `?q=&due=`. */
function stripUndefined(search: TaskSearch): TaskSearch {
  const out: TaskSearch = {}
  if (search.q) out.q = search.q
  if (search.status && search.status.length > 0) out.status = search.status
  if (search.due) out.due = search.due
  if (search.sort) out.sort = search.sort
  return out
}

/** Adapts validated search params to what the pure filter functions expect. */
export function toFilters(search: TaskSearch): TaskFilters {
  return {
    q: search.q,
    status: search.status,
    due: search.due,
    sort: search.sort,
  }
}
