import { Link, useLocation, useSearch } from '@tanstack/react-router'
import type { TaskSearch } from '../task.search-params'
import { activeView } from '../task.views'
import styles from './BottomNav.module.css'

/**
 * The phone's navigation (PLAN.md 7.3): Inbox · Today · Board · Actions.
 *
 * The same URLs the sidebar links to, so nothing here is a second source of
 * truth; the sidebar is hidden at phone widths and this takes its place.
 * Actions opens the command palette, which becomes a sheet at the same
 * width -- every command reachable by touch, none of them keyboard-only.
 *
 * Rendered by each page rather than the shell, because the palette's open
 * state belongs to the page (PLAN.md 4.1) and the button has to reach it.
 * 48px targets throughout, per the design's touch rule.
 */
export function BottomNav({ onActions }: { onActions: () => void }) {
  const search: Partial<TaskSearch> = useSearch({ strict: false })
  const pathname = useLocation({ select: (l) => l.pathname })
  const onBoard = pathname === '/board'
  const view = onBoard ? ({ kind: 'other' } as const) : activeView(search)

  return (
    <nav className={styles.nav} aria-label="Primary">
      <Link
        to="/"
        search={{}}
        activeOptions={{ exact: true }}
        className={styles.item}
        aria-current={view.kind === 'inbox' ? 'page' : undefined}
      >
        <InboxIcon />
        Inbox
      </Link>
      <Link
        to="/"
        search={{ due: 'today' }}
        activeOptions={{ exact: true }}
        className={styles.item}
        aria-current={view.kind === 'today' ? 'page' : undefined}
      >
        <TodayIcon />
        Today
      </Link>
      <Link
        to="/board"
        activeOptions={{ exact: true }}
        className={styles.item}
        aria-current={onBoard ? 'page' : undefined}
      >
        <BoardIcon />
        Board
      </Link>
      <button type="button" className={styles.item} onClick={onActions}>
        <ActionsIcon />
        Actions
      </button>
    </nav>
  )
}

/* Line icons, 20px, stroke from currentColor; decorative -- the label is the
   name. */
const icon = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function InboxIcon() {
  return (
    <svg {...icon}>
      <path d="M4 13h4l2 3h4l2-3h4M4 13V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7M4 13v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
    </svg>
  )
}

function TodayIcon() {
  return (
    <svg {...icon}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  )
}

function BoardIcon() {
  return (
    <svg {...icon}>
      <rect x="4" y="4" width="4.5" height="16" rx="1" />
      <rect x="9.75" y="4" width="4.5" height="11" rx="1" />
      <rect x="15.5" y="4" width="4.5" height="8" rx="1" />
    </svg>
  )
}

function ActionsIcon() {
  return (
    <svg {...icon}>
      <path d="m4 17 6-5-6-5M12 19h8" />
    </svg>
  )
}
