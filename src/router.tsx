import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

/**
 * One QueryClient per request on the server, one for the lifetime of the tab on
 * the client. `getRouter` is called by TanStack Start for both.
 *
 * PLAN.md 4.1: this cache is the only owner of server state. Route loaders
 * populate it and components read from it -- never two independent copies
 * (system design Failure Check 1).
 */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // The task list is small and cheap; a short stale window keeps
        // background refetches from fighting optimistic mutations.
        staleTime: 30_000,
        retry: 1,
      },
    },
  })

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
  })

  // Dehydrates the cache into the SSR payload and rehydrates on the client.
  // PLAN.md 4.7 vector 3: only mapped Task DTOs may enter this cache, because
  // everything in it is serialised into the HTML in plain text.
  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}
