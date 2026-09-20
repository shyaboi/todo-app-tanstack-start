import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { gotoHydrated, uniqueTitle, waitForServerAck } from './helpers'

/* The composer grammar, end to end: what the chips say is what gets saved. */

const input = (page: Page) => page.getByLabel('Task title')
const reading = (page: Page) => page.getByTestId('composer-reading')

test('tokens are read as you type, and shown before you commit', async ({
  page,
}) => {
  await gotoHydrated(page)
  await input(page).fill('Ship the thing #docs !p1 ~doing tomorrow 4pm')
  await expect(reading(page)).toContainText('List · Docs')
  await expect(reading(page)).toContainText('P1 — Urgent')
  await expect(reading(page)).toContainText('Status · In progress')
  await expect(reading(page)).toContainText(/Due · .*16:00/)
})

test('what the chips said is what the row shows, and it persists', async ({
  page,
}) => {
  const title = uniqueTitle('tokenised')
  await gotoHydrated(page)
  const docs = page
    .getByRole('navigation', { name: 'Views' })
    .getByRole('link', { name: /^Docs/ })
  await expect(docs).toHaveText(/Docs.*0$/)

  await input(page).fill(`${title} #docs !p1 ~doing tomorrow 4pm`)
  await page.keyboard.press('Enter')

  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Docs')
  await expect(row.getByText('P1', { exact: true })).toBeVisible()
  await expect(row.getByText('In progress')).toBeVisible()
  // Tomorrow, so it lands in the "Later this week" (or next) group, not Today.
  await expect(row.locator('time')).toBeVisible()
  await expect(docs).toHaveText(/Docs.*1$/)
  // The tokens did not leak into the title.
  await expect(row).not.toContainText('#docs')

  await waitForServerAck(page, title)
  await page.reload()
  const again = page.getByRole('listitem').filter({ hasText: title })
  await expect(again).toContainText('Docs')
  await expect(again.getByText('P1', { exact: true })).toBeVisible()
})

test('an unknown #tag stays in the title; lists are a fixed vocabulary', async ({
  page,
}) => {
  const title = uniqueTitle('keep #flaky here')
  await gotoHydrated(page)
  await input(page).fill(title)
  await expect(reading(page)).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('listitem').filter({ hasText: '#flaky' }),
  ).toBeVisible()
})

test('tokens without a title are refused, with a message that says so', async ({
  page,
}) => {
  await gotoHydrated(page)
  await input(page).fill('#docs !p1')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toHaveText(
    'Give the task a title as well as the tags.',
  )
  await expect(input(page)).toBeFocused()
})

test('the grammar hint appears while the field is in use', async ({ page }) => {
  await gotoHydrated(page)
  // Folded to zero height until the field is in use -- still in the DOM and
  // still described-by, so a screen reader can reach it either way.
  const hint = page.getByText(/dates like/)
  await expect(hint).toBeHidden()
  await input(page).focus()
  await expect(hint).toBeVisible()
})
