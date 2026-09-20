import { Link, useLocation, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Kbd } from '~/shared/components/Kbd'
import { tasksQuery } from '../task.query'
import { LISTS } from '../task.types'
import type { TaskSearch } from '../task.search-params'
import { activeView, inboxCount, listCounts, todayCount } from '../task.views'
import styles from './Sidebar.module.css'

/**
 * The views, as links. Each one is a URL the app already understands, so the
 * sidebar adds no state of its own -- it is the same navigation as G I, G T
 * and G B, made visible (design rule: nothing is keyboard-only).
 *
 * Deliberately NOT a <ul>. It is a navigation landmark holding links, which is
 * complete as accessibility goes, and it keeps every `listitem` on the page
 * belonging to the task list -- the whole E2E suite counts on that.
 */
export function Sidebar() {
  const { data: tasks = [] } = useQuery(tasksQuery)
  // Loose on purpose: the sidebar is rendered above the route that validates
  // these, and an unrelated route underneath has none.
  const search: Partial<TaskSearch> = useSearch({ strict: false })
  const pathname = useLocation({ select: (l) => l.pathname })
  const onBoard = pathname === '/board'
  // On the board no list view is active, whatever the search says.
  const view = onBoard ? ({ kind: 'other' } as const) : activeView(search)
  const now = new Date()
  const perList = listCounts(tasks)

  return (
    <nav className={styles.nav} aria-label="Views">
      <Link to="/" search={{}} className={styles.brand}>
        Tasker
      </Link>

      <p className={styles.heading} aria-hidden="true">
        Views
      </p>
      <ViewLink
        to="/"
        search={{}}
        active={view.kind === 'inbox'}
        count={inboxCount(tasks)}
        keys="G I"
      >
        Inbox
      </ViewLink>
      <ViewLink
        to="/"
        search={{ due: 'today' }}
        active={view.kind === 'today'}
        count={todayCount(tasks, now)}
        keys="G T"
      >
        Today
      </ViewLink>
      <ViewLink to="/board" active={onBoard} keys="G B">
        Board
      </ViewLink>

      <p className={styles.heading} aria-hidden="true">
        Lists
      </p>
      {LISTS.map((list) => (
        <ViewLink
          key={list.id}
          to="/"
          search={{ list: list.id }}
          active={view.kind === 'list' && view.id === list.id}
          count={perList[list.id]}
        >
          {list.name}
        </ViewLink>
      ))}
    </nav>
  )
}

function ViewLink({
  to,
  search,
  active,
  count,
  keys,
  children,
}: {
  to: '/' | '/board'
  search?: TaskSearch
  active: boolean
  /** Open tasks behind the link. Absent for a view of everything. */
  count?: number
  keys?: string
  children: string
}) {
  const className = `${styles.link} ${active ? styles.active : ''}`
  const body: ReactNode = (
    <>
      <span className={styles.label}>{children}</span>
      {keys && (
        <span className={styles.keys} aria-hidden="true">
          <Kbd keys={keys} />
        </span>
      )}
      {/* Read as part of the link's name: "Inbox, 8". */}
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </>
  )

  /* Active is decided by activeView, not by the Link. Left to itself the Link
     matches search params PARTIALLY, so `search={{}}` is "active" on every
     URL and Inbox never stops claiming the page. `exact` makes its own test
     narrower than ours in every case, so it never adds an aria-current that
     activeView would not. */
  return to === '/board' ? (
    <Link
      to="/board"
      activeOptions={{ exact: true }}
      className={className}
      aria-current={active ? 'page' : undefined}
    >
      {body}
    </Link>
  ) : (
    <Link
      to="/"
      search={search ?? {}}
      activeOptions={{ exact: true }}
      className={className}
      aria-current={active ? 'page' : undefined}
    >
      {body}
    </Link>
  )
}
