import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '~/shared/components/Button'
import { useSignOut, viewerQuery } from '../auth.query'
import styles from './AccountBar.module.css'

/**
 * Who you are, and what to do about it.
 *
 * A guest is a real account behind a single cookie, so the one thing worth
 * saying is that the tasks are only as durable as that cookie -- and that
 * signing up keeps them.
 */
export function AccountBar() {
  const { data: viewer } = useQuery(viewerQuery)
  const out = useSignOut()

  // Rendered as a guest until proven otherwise: the anonymous case is the one
  // a first-time visitor sees, so it must not flash the signed-in state.
  const isGuest = !viewer || viewer.isGuest

  return (
    <div className={`${styles.bar} ${isGuest ? styles.guest : ''}`}>
      {isGuest ? (
        <>
          <p className={styles.message}>
            You are not signed in. These tasks are kept for this browser only —
            create an account and they come with you.
          </p>
          <span className={styles.actions}>
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
          </span>
        </>
      ) : (
        <>
          <p className={styles.message}>
            Signed in as <span className={styles.email}>{viewer.email}</span>
          </p>
          <span className={styles.actions}>
            <Button
              variant="ghost"
              size="small"
              loading={out.isPending}
              onClick={() => out.mutate()}
            >
              Sign out
            </Button>
          </span>
        </>
      )}
    </div>
  )
}
