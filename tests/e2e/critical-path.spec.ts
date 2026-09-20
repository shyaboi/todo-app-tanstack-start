import { test, expect } from '@playwright/test'
import {
  openFilters,
  signIn,
  uniqueTitle,
  waitForHydrated,
  waitForServerAck,
} from './helpers'

/**
 * The critical path (PLAN.md 8.1, system design §16), in the order it is
 * written there:
 *
 *   load → create → update status → search → filter → delete → undo →
 *   reload → verify persisted
 *
 * Every other spec in this directory tests one behaviour properly. This one
 * tests that they still add up to an app: it is the test that fails when the
 * thing is broken in the first way a reviewer would notice. All seven
 * acceptance criteria in PLAN.md §2 are touched, and each step says which.
 *
 * The keyboard-only variant of the same flow is `keyboard-only.spec.ts` --
 * one flow, two input devices, not two flows.
 *
 * It signs in as Ada so the seeded list is on screen: a flow that runs
 * against an empty guest account proves the writes but not that the app
 * renders a real database.
 */
test('the critical path, with a pointer', async ({ page }) => {
  const title = uniqueTitle('critical path')
  await signIn(page)

  // ── 1 · Load. The list is in the FIRST response, not fetched after it
  //   (AC2, AC7). Asserted against the raw HTML, which is the only thing that
  //   can tell a server render from a fast client one.
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  expect(await response!.text()).toContain('Fix focus trap')
  // A raw goto, so that the HTML above is the SERVER's: the rest of the flow
  // clicks things, and a click before hydration silently does nothing.
  await waitForHydrated(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox')
  await expect(page.getByRole('listitem')).toHaveCount(10)

  // ── 2 · Create (AC1). The row is on screen before the server answers; the
  //   acknowledgement is waited for separately so later steps are not racing
  //   a write still in flight.
  const created = waitForServerAck(page, title)
  await page.getByLabel('Task title').fill(title)
  await page.getByRole('button', { name: 'Add task' }).click()
  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toBeVisible()
  await created
  await expect(row.getByRole('checkbox')).toBeEnabled()

  // ── 3 · Update status (AC3, AC6). Through the pill, which is the control
  //   the design puts on the row; the checkbox and Space reach the same
  //   mutation (PLAN.md 4.5).
  const advanced = waitForServerAck(page, title)
  await row.getByRole('button', { name: /Change to In progress$/ }).click()
  await expect(row.getByText('In progress')).toBeVisible()
  await advanced

  // ── 4 · Search (AC5). Derived from the one cached list, and in the URL, so
  //   the result set is a link.
  await page
    .getByRole('searchbox', { name: 'Search tasks' })
    .fill('critical path')
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page).toHaveURL(/q=critical\+path/)

  // ── 5 · Filter (AC6). On top of the search: both narrow the same list.
  await openFilters(page)
  await page.getByRole('button', { name: /^In progress/ }).click()
  await expect(page).toHaveURL(/status=doing/)
  await expect(row).toBeVisible()

  // The filter is doing real work: the other status hides it.
  await page.getByRole('button', { name: /^In progress/ }).click()
  await page.getByRole('button', { name: /^Done/ }).click()
  await expect(row).toHaveCount(0)
  await page.getByRole('button', { name: /^Done/ }).click()
  await expect(row).toBeVisible()

  // ── 6 · Delete (AC4), behind a confirmation that says undo is coming.
  await row.getByRole('button', { name: `Delete "${title}"` }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('You can undo for 8 seconds')
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(row).toHaveCount(0)

  // ── 7 · Undo (AC4). Optimistic in the cache, real in the database -- the
  //   reload below is what tells those two apart.
  const restored = waitForServerAck(page, title)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(row).toBeVisible()
  await restored

  // ── 8 · Reload, and verify it persisted (AC7). The filters are still in
  //   the URL, so this also proves the address survived the round trip.
  await page.reload()
  await expect(page).toHaveURL(/q=critical\+path/)
  await expect(row).toBeVisible()
  await expect(row.getByText('In progress')).toBeVisible()

  /* And it is the DATABASE holding it, not this tab: a second page, with its
     own cache and its own render, sees the same task. */
  const fresh = await page.context().newPage()
  await fresh.goto('/?q=critical+path')
  await expect(fresh.getByText(title, { exact: true })).toBeVisible()
  await fresh.close()
})
