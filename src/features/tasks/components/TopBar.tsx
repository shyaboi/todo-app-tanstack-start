import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AccountBar, GuestNote } from '~/features/auth/components/AccountBar'
import { listsQuery } from '~/features/lists/list.query'
import { listName } from '~/features/lists/list.types'
import { tasksQuery } from '../task.query'
import { STATUS_LABEL } from '../task.types'
import type { TaskSearch } from '../task.search-params'
import { splitStatus } from '../task.search-params'
import { countByStatus, hiddenByStatus } from '../task.filters'
import { toFilters } from '../task.search-params'
import { SearchInput } from './SearchInput'
import { SortSelect } from './SortSelect'
import { TaskFilters } from './TaskFilters'
import type { SortOrder } from '../task.filters'
import styles from './TopBar.module.css'

/**
 * The bar across the content column (PLAN.md 4.2, 8.4a).
 *
 * Search, sort and filtering used to sit in the page, above the list, pushing
 * the tasks down the screen. They belong here: they act on the view rather
 * than being part of it, and moving them gives the list the width the design
 * draws it at.
 *
 * The composer stays in the page on purpose. It is the primary action, it
 * needs the room to show what it understood, and on a phone it must be
 * reachable without opening anything.
 *
 * Filters collapse behind a disclosure that says how many are narrowing the
 * view, so an unfiltered page is one quiet row and a filtered one says so
 * without being opened.
 */
export function TopBar({
  search,
  sort,
  onChange,
  onSearch,
  onSort,
}: {
  search: TaskSearch
  sort: SortOrder
  /** A filter changed: patch the URL. */
  onChange: (patch: Partial<TaskSearch>) => void
  /** Typing: patched separately so it can replace rather than push. */
  onSearch: (q: string) => void
  onSort: (sort: SortOrder) => void
}) {
  const { data: tasks = [] } = useQuery(tasksQuery)
  const { data: lists = [] } = useQuery(listsQuery)
  const [open, setOpen] = useState(false)

  const filters = toFilters(search)
  const active = describeFilters(search, lists)
  const now = new Date()
  const hidden = hiddenByStatus(tasks, filters, now, lists)

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <SearchInput value={search.q ?? ''} onChange={onSearch} />
        <SortSelect value={sort} onChange={onSort} />

        <button
          type="button"
          className={`${styles.filters} ${active.length > 0 ? styles.filtersActive : ''}`}
          aria-expanded={open}
          aria-controls="filter-panel"
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 6h16M7 12h10M10 18h4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
          <span className={styles.filtersLabel}>Filters</span>
          {active.length > 0 && (
            <span className={styles.badge}>{active.length}</span>
          )}
        </button>

        <div className={styles.account}>
          <AccountBar />
        </div>
      </div>

      <GuestNote />

      {/* What is narrowing the view, when the panel is shut. Each chip removes
          its own filter, so nothing has to be opened to undo it. */}
      {active.length > 0 && !open && (
        <div className={styles.active}>
          {active.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={styles.activeChip}
              onClick={() => onChange(chip.clear)}
            >
              {chip.label}
              <span aria-hidden="true">✕</span>
              <span className="visually-hidden">, remove this filter</span>
            </button>
          ))}
        </div>
      )}

      {/* The difference between an empty result and a misleading one: the
          query matched, the status filter is what is hiding it. Always
          visible -- it explains the empty list, so it cannot be behind a
          disclosure you would only open if you already suspected filters. */}
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

      {open && (
        <div id="filter-panel" className={styles.panel}>
          <TaskFilters
            search={search}
            counts={countByStatus(tasks)}
            total={tasks.length}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  )
}

interface ActiveChip {
  key: string
  label: string
  clear: Partial<TaskSearch>
}

const DUE_LABEL: Record<string, string> = {
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  none: 'No date',
}

/** One chip per thing narrowing the view, each carrying its own undo. */
function describeFilters(
  search: TaskSearch,
  lists: readonly { id: string; name: string; createdAt: string }[],
): ActiveChip[] {
  const chips: ActiveChip[] = []
  if (search.q) {
    chips.push({
      key: 'q',
      label: `“${search.q}”`,
      clear: { q: undefined },
    })
  }
  const statuses = splitStatus(search.status)
  if (statuses.length > 0) {
    chips.push({
      key: 'status',
      label: statuses.map((s) => STATUS_LABEL[s]).join(' or '),
      clear: { status: undefined },
    })
  }
  if (search.due) {
    chips.push({
      key: 'due',
      label: DUE_LABEL[search.due] ?? search.due,
      clear: { due: undefined },
    })
  }
  if (search.list) {
    chips.push({
      key: 'list',
      label: listName(lists, search.list) ?? 'List',
      clear: { list: undefined },
    })
  }
  return chips
}
