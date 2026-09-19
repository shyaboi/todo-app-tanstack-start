import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import {
  Link,
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

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
        <Scripts />
      </body>
    </html>
  )
}
