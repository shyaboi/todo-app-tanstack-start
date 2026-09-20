import { Link, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Kbd } from '~/shared/components/Kbd'
import { tasksQuery } from '../task.query'
import { LISTS } from '../task.types'
import type { TaskSearch } from '../task.search-params'
import { activeView, inboxCount, listCounts, todayCount } from '../task.views'
import styles from './Sidebar.module.css'

/**
 * The views, as links. Each one is a URL the list already understands, so the
 * sidebar adds no state of its own -- it is the same navigation as G I and
 * G T, made visible (design rule: nothing is keyboard-only).
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
  const view = activeView(search)
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
  to: '/'
  search: TaskSearch
  active: boolean
  count: number
  keys?: string
  children: string
}) {
  return (
    <Link
      to={to}
      search={search}
      /* Active is decided by activeView, not by the Link. Left to itself the
         Link matches search params PARTIALLY, so `search={{}}` is "active" on
         every URL and Inbox never stops claiming the page. `exact` makes its
         own test narrower than ours in every case, so it never adds an
         aria-current that activeView would not. */
      activeOptions={{ exact: true }}
      className={`${styles.link} ${active ? styles.active : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className={styles.label}>{children}</span>
      {keys && (
        <span className={styles.keys} aria-hidden="true">
          <Kbd keys={keys} />
        </span>
      )}
      {/* Read as part of the link's name: "Inbox, 8". */}
      <span className={styles.count}>{count}</span>
    </Link>
  )
}
