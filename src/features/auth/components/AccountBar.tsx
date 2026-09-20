import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '~/shared/components/Button'
import { useSignOut, viewerQuery } from '../auth.query'
import styles from './AccountBar.module.css'

/**
 * Who you are, and what to do about it -- as a toolbar control.
 *
 * This used to be a banner: a paragraph and two buttons inside a coloured
 * panel. That was fine above the page, with the width to itself. In the top
 * bar (PLAN.md 8.4a) it is a control beside search and filters, and a
 * paragraph there takes the room the search field needs. It took it: the
 * field collapsed to an empty box and the sort select was clipped mid-word.
 *
 * So the control says who you are and offers the one action that changes it.
 * What being a guest MEANS is `GuestNote`, on its own line, where a sentence
 * has the room to be a sentence.
 */
export function AccountBar() {
  const { data: viewer } = useQuery(viewerQuery)
  const out = useSignOut()

  // Rendered as a guest until proven otherwise: the anonymous case is the one
  // a first-time visitor sees, so it must not flash the signed-in state.
  const isGuest = !viewer || viewer.isGuest

  if (isGuest) {
    return (
      <div className={styles.bar}>
        <span className={styles.who}>Guest</span>
        <Link to="/sign-in">
          <Button variant="ghost" size="small">
            Sign in
          </Button>
        </Link>
        <Link to="/sign-up">
          <Button variant="primary" size="small">
            Create account
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className={styles.bar}>
      {/* The title carries the full address when the column is too narrow to
          show it -- the element truncates, the information does not. */}
      <span className={styles.who} title={viewer.email ?? undefined}>
        Signed in as <span className={styles.email}>{viewer.email}</span>
      </span>
      <Button
        variant="ghost"
        size="small"
        loading={out.isPending}
        onClick={() => out.mutate()}
      >
        Sign out
      </Button>
    </div>
  )
}

/**
 * Why being a guest matters, in one line, and nothing at all once signed in.
 *
 * A guest account is real and server-side (PLAN.md 4.8) -- the only thing
 * tying a visitor to it is one cookie, and that is worth saying plainly
 * rather than leaving someone to discover it by clearing their browser.
 */
export function GuestNote() {
  const { data: viewer } = useQuery(viewerQuery)
  if (viewer && !viewer.isGuest) return null
  return (
    <p className={styles.note}>
      You are not signed in. These tasks are kept for this browser only — create
      an account and they come with you.
    </p>
  )
}
