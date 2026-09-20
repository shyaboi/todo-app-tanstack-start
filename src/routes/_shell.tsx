import { useEffect } from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AccountBar } from '~/features/auth/components/AccountBar'
import { viewerQuery } from '~/features/auth/auth.query'
import { tasksQuery } from '~/features/tasks/task.query'
import { markBooted } from '~/features/tasks/task.lastView'
import { Sidebar } from '~/features/tasks/components/Sidebar'
import styles from './_shell.module.css'

/* The application frame (PLAN.md 4.2): sidebar, account bar, and a content
   column for whichever route is inside it. Sign-in and sign-up sit outside
   this layout on purpose -- a person who is not signed in has nothing to
   navigate between. */
export const Route = createFileRoute('/_shell')({
  /* The router decides WHEN the data is needed; TanStack Query owns its
     lifecycle and cache. `ensureQueryData` populates the cache during SSR and
     every component underneath reads from that same cache -- one source of
     truth, not a loader copy and a query copy (Failure Check 1).

     The list is loaded UNFILTERED regardless of the URL. Filtering is derived
     at render (D4): keying the query by filters would refetch on every
     keystroke and recreate the two-sources-of-truth problem. Loading it here
     rather than in the list route means the sidebar's counts and the board
     share the one fetch. */
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(tasksQuery),
      context.queryClient.ensureQueryData(viewerQuery),
    ]),
  component: Shell,
})

function Shell() {
  /* The end of the page load, as far as D5's "bare visit" is concerned. The
     routes inside have already run their mount effects by the time this one
     runs, so a bounce to the board can only ever happen from here on never. */
  useEffect(() => {
    markBooted()
  }, [])

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.content}>
        <AccountBar />
        <Outlet />
      </div>
    </div>
  )
}
