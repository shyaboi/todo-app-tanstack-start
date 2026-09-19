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

/**
 * Creates a task with a unique title and returns its row.
 *
 * Tests run fully parallel against one database, so anything that MUTATES a
 * row has to own that row. Reaching for a seeded task instead makes the suite
 * order-dependent: it passes alone and fails beside its neighbours.
 */
export async function createTask(page: Page, title: string) {
  await page.getByLabel('Task title').fill(title)
  await page.getByRole('button', { name: 'Add task' }).click()
  const row = page.getByRole('listitem').filter({ hasText: title })
  await row.waitFor()

  /* The row appears optimistically with a temporary id, and its controls stay
     disabled until the server returns the real one -- a task with no id yet
     cannot be updated or deleted. Waiting for the row alone would click a
     disabled control and silently do nothing. */
  await row.getByRole('checkbox').and(page.locator(':enabled')).waitFor()
  return row
}

export function uniqueTitle(label: string): string {
  return `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Waits for the server to acknowledge a write to the task with this title.
 *
 * Optimistic UI means an assertion about the screen is satisfied before the
 * request finishes, so reloading straight after races the write and the page
 * comes back without it. Matching on METHOD alone is not enough either: a
 * delete POST is often still in flight at that point and would resolve the
 * wait early. The response body carries the task, so the title identifies the
 * right one.
 */
export function waitForServerAck(page: Page, title: string): Promise<Response> {
  return page.waitForResponse(
    async (r) =>
      r.url().includes('_serverFn') &&
      r.request().method() === 'POST' &&
      (await r.text().catch(() => '')).includes(title),
  )
}

/* The seed's fixture accounts. Credentials for a throwaway database, in the
   open on purpose so a reviewer can sign in too. Ada owns the ten tasks from
   the design's List view; Grace owns two, so a permissions test has something
   to fail to reach. */
export const ADA = { email: 'ada@example.com', password: 'seed-password-ada' }
export const GRACE = {
  email: 'grace@example.com',
  password: 'seed-password-grace',
}

/**
 * Signs in and waits until the account bar confirms it.
 *
 * Needed by anything that reads the SEEDED tasks: an anonymous visitor now gets
 * a fresh guest account with an empty list, which is the correct behaviour and
 * exactly why these tests have to say who they are.
 */
export async function signIn(
  page: Page,
  who: { email: string; password: string } = ADA,
): Promise<void> {
  await gotoHydrated(page, '/sign-in')
  await page.getByLabel('Email').fill(who.email)
  await page.getByLabel('Password').fill(who.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByText('Signed in as').waitFor()
}
