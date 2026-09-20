import { test, expect } from '@playwright/test'
import {
  openFilters,
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
 * It runs as a GUEST, deliberately. The suite is fully parallel against one
 * database, so a spec that creates tasks under the shared seeded account
 * changes what every count-based assertion elsewhere sees -- this one did,
 * and took eleven other tests down with it. A guest gets a fresh account per
 * browser context, owns everything it creates, and can therefore assert
 * exact counts that mean something.
 */
test('the critical path, with a pointer', async ({ page }) => {
  const title = uniqueTitle('critical path')
  const decoy = uniqueTitle('not the one')

  // ── 1 · Load (AC2). The shell and the page inside it arrive in the FIRST
  //   response. Asserted against the raw HTML, which is the only thing that
  //   can tell a server render from a fast client one.
  const first = await page.goto('/')
  expect(first?.status()).toBe(200)
  const firstHtml = await first!.text()
  expect(firstHtml).toContain('<h1')
  expect(firstHtml).toContain('Inbox')
  // A brand-new account, so this is the first-run empty state, not a failure.
  expect(firstHtml).toContain('Nothing here yet')
  // The rest of the flow clicks things, and a click before hydration does
  // nothing at all, silently.
  await waitForHydrated(page)

  // ── 2 · Create (AC1), twice: the second task is what search and filter
  //   have to exclude later. The rows appear before the server answers, so
  //   each acknowledgement is waited for rather than assumed.
  for (const t of [decoy, title]) {
    const saved = waitForServerAck(page, t)
    await page.getByLabel('Task title').fill(t)
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByText(t, { exact: true })).toBeVisible()
    await saved
  }
  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row.getByRole('checkbox')).toBeEnabled()
  await expect(page.getByRole('listitem')).toHaveCount(2)

  // ── 3 · Update status (AC3, AC6). Through the pill, which is the control
  //   the design puts on the row; the checkbox and Space reach the same
  //   mutation (PLAN.md 4.5).
  const advanced = waitForServerAck(page, title)
  await row.getByRole('button', { name: /Change to In progress$/ }).click()
  await expect(row.getByText('In progress')).toBeVisible()
  await advanced

  // ── 4 · Search (AC5). Derived from the one cached list, and written to the
  //   URL, so the result set is a link.
  await page
    .getByRole('searchbox', { name: 'Search tasks' })
    .fill('critical path')
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(row).toBeVisible()
  await expect(page).toHaveURL(/q=critical\+path/)

  // ── 5 · Filter (AC6), on top of the search: both narrow the same list.
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
  //   the URL, so this proves the address survived the round trip too.
  const reloaded = await page.reload()
  await expect(page).toHaveURL(/q=critical\+path/)
  await expect(row).toBeVisible()
  await expect(row.getByText('In progress')).toBeVisible()

  /* And the reloaded HTML carries it: the task went to MongoDB, came back
     through the loader, and was rendered on the server. AC2 and AC7 in one
     assertion, against real data rather than a fixture. */
  expect(await reloaded!.text()).toContain(title)

  /* Last, that it is the DATABASE holding it and not this tab: a second page,
     with its own cache and its own render, sees the same task. */
  const fresh = await page.context().newPage()
  await fresh.goto('/?q=critical+path')
  await expect(fresh.getByText(title, { exact: true })).toBeVisible()
  await fresh.close()
})
