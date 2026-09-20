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
    links: [
      { rel: 'stylesheet', href: appCss },
      /* Browsers ask for /favicon.ico whether or not anything links to it, so
         the file in public/ is what actually stops the 404. These are here so
         the SVG is preferred where it is supported -- it stays sharp at any
         size, and it is the same shape drawn from the same two tokens. */
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      {
        rel: 'alternate icon',
        href: '/favicon.ico',
        sizes: '16x16 32x32 48x48',
      },
    ],
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
