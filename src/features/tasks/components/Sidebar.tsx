import { useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Kbd } from '~/shared/components/Kbd'
import { ConfirmDialog } from '~/shared/components/ConfirmDialog'
import {
  listsQuery,
  useDeleteList,
  useRenameList,
} from '~/features/lists/list.query'
import type { List } from '~/features/lists/list.types'
import { listNameSchema } from '~/features/lists/list.schema'
import { NewListForm } from '~/features/lists/components/NewListForm'
import { tasksQuery } from '../task.query'
import type { TaskSearch } from '../task.search-params'
import { activeView, inboxCount, listCounts, todayCount } from '../task.views'
import styles from './Sidebar.module.css'

/**
 * The views, as links. Each one is a URL the app already understands, so the
 * sidebar adds no state of its own -- it is the same navigation as G I, G T
 * and G B, made visible (design rule: nothing is keyboard-only).
 *
 * Lists are the owner's own (PLAN.md D14): this is where they are made,
 * renamed and removed, because it is where they are read.
 *
 * Deliberately NOT a <ul>. It is a navigation landmark holding links, which is
 * complete as accessibility goes, and it keeps every `listitem` on the page
 * belonging to the task list -- the whole E2E suite counts on that.
 */
export function Sidebar() {
  const { data: tasks = [] } = useQuery(tasksQuery)
  const { data: lists = [] } = useQuery(listsQuery)
  // Loose on purpose: the sidebar is rendered above the route that validates
  // these, and an unrelated route underneath has none.
  const search: Partial<TaskSearch> = useSearch({ strict: false })
  const pathname = useLocation({ select: (l) => l.pathname })
  const onBoard = pathname === '/board'
  // On the board no list view is active, whatever the search says.
  const view = onBoard ? ({ kind: 'other' } as const) : activeView(search)
  const now = new Date()
  const perList = listCounts(tasks, lists)

  /* Which list is being renamed or confirmed for deletion. Page-owned, like
     every other ephemeral piece of UI state in the app (PLAN.md 4.1). */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const confirming = lists.find((l) => l.id === confirmingId) ?? null
  const remove = useDeleteList()
  const navigate = useNavigate()

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
      {lists.map((list) =>
        editingId === list.id ? (
          <RenameListForm
            key={list.id}
            list={list}
            onDone={() => setEditingId(null)}
          />
        ) : (
          <ListRow
            key={list.id}
            list={list}
            active={view.kind === 'list' && view.id === list.id}
            count={perList[list.id] ?? 0}
            onRename={() => setEditingId(list.id)}
            onDelete={() => setConfirmingId(list.id)}
          />
        ),
      )}
      <NewListForm />

      {confirming && (
        <ConfirmDialog
          title="Delete this list?"
          body={`"${confirming.name}" will be removed.`}
          note="Its tasks are kept, without a list."
          confirmLabel="Delete list"
          onCancel={() => setConfirmingId(null)}
          onConfirm={() => {
            setConfirmingId(null)
            remove.mutate(confirming.id)
            // The view being deleted cannot stay on screen.
            if (view.kind === 'list' && view.id === confirming.id) {
              void navigate({ to: '/', search: {} })
            }
          }}
        />
      )}
    </nav>
  )
}

/* A list is a link, plus two actions that appear on hover or focus. The
   actions are inside the row but outside the link: a link containing buttons
   is invalid, and a click on one must not navigate. */
function ListRow({
  list,
  active,
  count,
  onRename,
  onDelete,
}: {
  list: List
  active: boolean
  count: number
  onRename: () => void
  onDelete: () => void
}) {
  /* No pending state here: a list is only ever in this array once the server
     has confirmed it and given it a real id (see useCreateList). */
  return (
    <div className={`${styles.row} ${active ? styles.rowActive : ''}`}>
      <Link
        to="/"
        search={{ list: list.id }}
        activeOptions={{ exact: true }}
        className={`${styles.link} ${active ? styles.active : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <span className={styles.label}>{list.name}</span>
        <span className={styles.count}>{count}</span>
      </Link>
      <span className={styles.rowActions}>
        <button
          type="button"
          className={styles.rowAction}
          aria-label={`Rename "${list.name}"`}
          title="Rename"
          onClick={onRename}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 20h4l10-10-4-4L4 16v4ZM14 6l4 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={styles.rowAction}
          aria-label={`Delete "${list.name}"`}
          title="Delete"
          onClick={onDelete}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5 7h14M10 11v6M14 11v6M7 7l1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </span>
    </div>
  )
}

/* Renaming in place, on the same contract as the task title: Enter saves,
   Escape reverts, blur saves, and the same schema the server runs. */
function RenameListForm({ list, onDone }: { list: List; onDone: () => void }) {
  const [name, setName] = useState(list.name)
  const [error, setError] = useState<string | null>(null)
  const rename = useRenameList()

  function commit() {
    const parsed = listNameSchema.safeParse(name)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'That name is not valid.')
      return
    }
    if (parsed.data !== list.name) {
      rename.mutate({ id: list.id, name: parsed.data })
    }
    onDone()
  }

  return (
    <div className={styles.renaming}>
      <input
        className={styles.renameInput}
        value={name}
        maxLength={40}
        aria-label={`Name of "${list.name}"`}
        aria-invalid={error ? true : undefined}
        // Moved here in response to the click, not on load.
        ref={(el) => el?.select()}
        onChange={(e) => {
          setName(e.target.value)
          if (error) setError(null)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setName(list.name)
            onDone()
          }
        }}
      />
      {error && (
        <p className={styles.renameError} role="alert">
          {error}
        </p>
      )}
    </div>
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
