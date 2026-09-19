import type { Page, Response } from '@playwright/test'

/**
 * Navigates and waits until React has actually hydrated.
 *
 * Playwright's actionability checks cover visibility and stability, but not
 * whether a handler is attached yet -- so a click landing between first paint
 * and hydration silently does nothing. React tags every DOM node it claims
 * with a `__reactFiber$…` key, which is a direct signal that hydration has
 * reached that node, and TanStack Router publishes `__TSR_ROUTER__` once the
 * client router is live. Waiting on both is deterministic where a fixed sleep
 * is only probably long enough.
 */
export async function gotoHydrated(
  page: Page,
  url = '/',
): Promise<Response | null> {
  const response = await page.goto(url)
  await page.waitForFunction(() => {
    const root = document.querySelector('main')
    if (!root) return false
    const hydrated = Object.keys(root).some((k) =>
      k.startsWith('__reactFiber$'),
    )
    return hydrated && '__TSR_ROUTER__' in window
  })
  return response
}
