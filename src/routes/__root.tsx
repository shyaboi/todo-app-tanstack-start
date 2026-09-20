import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import {
  Link,
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

import { RouteError } from '~/shared/components/RouteError'
import { ToastHost } from '~/shared/components/ToastHost'
import appCss from '~/styles/app.css?url'
import styles from './__root.module.css'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Tasker' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  /* The last line of defence. Without it the router falls back to a bare
     "Something went wrong!" with a "Show Error" toggle -- the exact thing
     system design 12 says never to show. Routes closer to the failure set
     their own; this one catches whatever they do not. */
  errorComponent: RouteError,
})

/* Without this, TanStack Router falls back to a bare "Not Found" paragraph
   with no way back. An unknown URL is a normal outcome, not a crash. */
function NotFound() {
  return (
    <main className={styles.notFound}>
      <h1 className={styles.title}>That page does not exist</h1>
      <p className={styles.body}>
        The link may be out of date, or the task may have been deleted.
      </p>
      <Link to="/" className={styles.link}>
        Back to your tasks
      </Link>
    </main>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {/* One host for every page: a failed write is reported the same way
            wherever it happened (PLAN.md 4.2). */}
        <ToastHost />
        <Scripts />
      </body>
    </html>
  )
}
