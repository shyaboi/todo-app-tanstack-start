import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  gotoHydrated,
  uniqueListName,
  uniqueTitle,
  waitForServerAck,
} from './helpers'

/* The composer grammar, end to end: what the chips say is what gets saved. */

const input = (page: Page) => page.getByLabel('Task title')
const reading = (page: Page) => page.getByTestId('composer-reading')

/* Everything here runs as a guest, who starts with no lists and no tasks.
   That keeps the seeded fixtures the grouping and filter specs count on
   exactly as the seed left them. */

test('tokens are read as you type, and shown before you commit', async ({
  page,
}) => {
  await gotoHydrated(page)
  await input(page).fill('Ship the thing #docs !p1 ~doing tomorrow 4pm')
  // A #name nobody owns yet reads as a list to create (PLAN.md D14).
  await expect(reading(page)).toContainText('New list · docs')
  await expect(reading(page)).toContainText('P1 — Urgent')
  await expect(reading(page)).toContainText('Status · In progress')
  await expect(reading(page)).toContainText(/Due · .*16:00/)
})

test('what the chips said is what the row shows, and it persists', async ({
  page,
}) => {
  const title = uniqueTitle('tokenised')
  const list = uniqueListName()
  await gotoHydrated(page)
  const link = page
    .getByRole('navigation', { name: 'Views' })
    .getByRole('link', { name: new RegExp(`^${list}`) })
  await expect(link).toHaveCount(0)

  await input(page).fill(`${title} #${list} !p1 ~doing tomorrow 4pm`)
  // Registered BEFORE the key: the acknowledgement can arrive before a wait
  // set up afterwards would start listening, and then nothing ever resolves.
  const saved = waitForServerAck(page, title)
  await page.keyboard.press('Enter')

  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toBeVisible()
  await expect(row).toContainText(list)
  await expect(row.getByText('P1', { exact: true })).toBeVisible()
  await expect(row.getByText('In progress')).toBeVisible()
  // Tomorrow, so it lands in the "Later this week" (or next) group, not Today.
  await expect(row.locator('time')).toBeVisible()
  // The list it named was created, and holds it.
  await expect(link).toHaveText(new RegExp(`${list}.*1$`))
  // The tokens did not leak into the title.
  await expect(row).not.toContainText(`#${list}`)

  // Optimistic UI: reloading before the write is acknowledged races it.
  await saved
  await page.reload()
  const again = page.getByRole('listitem').filter({ hasText: title })
  await expect(again).toContainText(list)
  await expect(again.getByText('P1', { exact: true })).toBeVisible()
})

test('a sigil glued to a word is text, not a token', async ({ page }) => {
  const title = uniqueTitle('closes issue#42 and more')
  await gotoHydrated(page)
  await input(page).fill(title)
  await expect(reading(page)).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('listitem').filter({ hasText: 'issue#42' }),
  ).toBeVisible()
})

test('tokens without a title are refused, with a message that says so', async ({
  page,
}) => {
  await gotoHydrated(page)
  await input(page).fill('#somelist !p1')
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
