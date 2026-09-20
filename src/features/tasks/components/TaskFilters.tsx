import { Button } from '~/shared/components/Button'
import { LISTS, STATUS_LABEL, TASK_STATUSES } from '../task.types'
import type { TaskStatus } from '../task.types'
import { joinStatus, splitStatus, toFilters } from '../task.search-params'
import type { TaskSearch } from '../task.search-params'
import { hasActiveFilters } from '../task.filters'
import type { DueFilter } from '../task.filters'
import styles from './TaskFilters.module.css'

const DUE_OPTIONS: readonly {
  value: Exclude<DueFilter, 'any'> | undefined
  label: string
}[] = [
  { value: undefined, label: 'Any' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'none', label: 'No date' },
]

/**
 * The filter toolbar. Controlled: it renders the URL's filters and reports
 * changes, and never decides what the filters are. There is one owner of
 * filter state, and it is the URL (Failure Check 7).
 *
 * Counts come from the UNFILTERED list on purpose. "To do 5" tells you what is
 * available to filter to; a count that shrank as you filtered would only ever
 * confirm what the list already shows.
 */
export function TaskFilters({
  search,
  counts,
  total,
  hidden,
  onChange,
}: {
  search: TaskSearch
  counts: Record<TaskStatus, number>
  total: number
  /** Tasks the query matches but the status filter is hiding. */
  hidden: number
  onChange: (patch: Partial<TaskSearch>) => void
}) {
  const active = splitStatus(search.status)

  function toggleStatus(status: TaskStatus) {
    const next = active.includes(status)
      ? active.filter((s) => s !== status)
      : [...active, status]
    // joinStatus returns undefined for an empty selection, which is "All":
    // the key leaves the URL rather than lingering as `status=`.
    onChange({ status: joinStatus(next) })
  }

  function clearAll() {
    // Sort stays: it changes the order, not the set, and is not a filter.
    onChange({
      q: undefined,
      status: undefined,
      due: undefined,
      list: undefined,
    })
  }

  return (
    <div className={styles.panel}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Status</legend>
        <Chip
          pressed={active.length === 0}
          onClick={() => onChange({ status: undefined })}
        >
          All <span className={styles.count}>{total}</span>
        </Chip>
        {TASK_STATUSES.map((status) => (
          <Chip
            key={status}
            pressed={active.includes(status)}
            onClick={() => toggleStatus(status)}
          >
            {STATUS_LABEL[status]}{' '}
            <span className={styles.count}>{counts[status]}</span>
          </Chip>
        ))}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Due</legend>
        {DUE_OPTIONS.map(({ value, label }) => (
          <Chip
            key={label}
            pressed={search.due === value}
            onClick={() => onChange({ due: value })}
          >
            {label}
          </Chip>
        ))}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>List</legend>
        <Chip
          pressed={!search.list}
          onClick={() => onChange({ list: undefined })}
        >
          Any
        </Chip>
        {LISTS.map((list) => (
          <Chip
            key={list.id}
            pressed={search.list === list.id}
            onClick={() =>
              onChange({ list: search.list === list.id ? undefined : list.id })
            }
          >
            {list.name}
          </Chip>
        ))}
      </fieldset>

      <div className={styles.footer}>
        {/* The difference between an empty result and a misleading one: the
            query matched, the status filter is what is hiding it. */}
        {hidden > 0 && (
          <p className={styles.hidden}>
            {hidden} more {hidden === 1 ? 'task matches' : 'tasks match'} but{' '}
            {hidden === 1 ? 'is' : 'are'} hidden by the status filter.{' '}
            <button
              type="button"
              className={styles.inlineAction}
              onClick={() => onChange({ status: undefined })}
            >
              Show all statuses
            </button>
          </p>
        )}
        {hasActiveFilters(toFilters(search)) && (
          <Button variant="ghost" size="small" onClick={clearAll}>
            Clear all
          </Button>
        )}
      </div>
    </div>
  )
}

/* A real button with aria-pressed: a toggle a screen reader announces as
   "pressed" or "not pressed", rather than a styled span that only looks
   selected. Status is never colour alone, and neither is selection. */
function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${pressed ? styles.pressed : ''}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
