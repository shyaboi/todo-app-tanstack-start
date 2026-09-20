import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import {
  createTask,
  gotoHydrated,
  signIn,
  uniqueListName,
  uniqueTitle,
  waitForServerAck,
} from './helpers'

/* The detail panel: a route beside the list, not a modal over it. */

const panel = (page: Page) =>
  page.getByRole('complementary', { name: 'Task details' })

test('↵ on a selected row opens the panel, and the list stays put', async ({
  page,
}) => {
  const title = uniqueTitle('open me')
  await gotoHydrated(page)
  const row = await createTask(page, title)
  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/t\/[0-9a-f]{24}/)
  await expect(panel(page)).toBeVisible()
  await expect(panel(page)).toBeFocused()
  await expect(panel(page).getByLabel('Title')).toHaveValue(title)
  // The list did not unmount: the row is still there, still current.
  await expect(row).toBeVisible()
  await expect(row).toHaveAttribute('aria-current', 'true')
})

test('Escape closes the panel and returns focus to the row', async ({
  page,
}) => {
  const title = uniqueTitle('close me')
  await gotoHydrated(page)
  const row = await createTask(page, title)
  await row.getByRole('button', { name: `Open "${title}"` }).click()
  await expect(panel(page)).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/t\//)
  await expect(row).toBeFocused()
})

test('a field saves on blur, shows the outcome, and survives a reload', async ({
  page,
}) => {
  const title = uniqueTitle('edit me')
  await gotoHydrated(page)
  const row = await createTask(page, title)
  await row.getByRole('button', { name: `Open "${title}"` }).click()

  const notes = panel(page).getByLabel('Notes')
  await notes.fill('Written from the panel')
  await notes.blur()
  await expect(panel(page).getByText(/^Saved/)).toBeVisible()

  const prioritySaved = waitForServerAck(page, title)
  await panel(page).getByLabel('Priority').selectOption('p1')
  await expect(row.getByText('P1', { exact: true })).toBeVisible()

  // Every field here saves optimistically; reloading before the server has
  // it races the write.
  await prioritySaved
  await page.reload()
  await expect(panel(page).getByLabel('Notes')).toHaveValue(
    'Written from the panel',
  )
  await expect(panel(page).getByLabel('Priority')).toHaveValue('p1')
})

test('the due date is settable at last, and the row shows it', async ({
  page,
}) => {
  const title = uniqueTitle('due me')
  await gotoHydrated(page)
  const row = await createTask(page, title)
  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()

  // D opens the panel with focus already in the due field.
  await page.keyboard.press('d')
  await expect(panel(page).getByLabel('Due')).toBeFocused()

  await panel(page).getByLabel('Due').fill('2030-03-04T09:00')
  await panel(page).getByLabel('Due').blur()
  await expect(row.getByText('4 Mar')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toContainText(['Later'])
})

test('a list can be assigned, and the sidebar count follows', async ({
  page,
}) => {
  /* A guest, with a list of its own. Signing in as Ada and adding tasks would
     change the seeded fixtures the grouping and filter specs count. */
  const list = uniqueListName()
  const title = uniqueTitle('list me')
  await gotoHydrated(page)

  /* The composer makes the list, on a task of its own. Typed rather than
     passed to createTask: the helper looks for a row containing what it was
     given, and the #token never reaches the title. */
  await page
    .getByLabel('Task title')
    .fill(`${uniqueTitle('holds it')} #${list}`)
  await page.keyboard.press('Enter')
  const link = page
    .getByRole('navigation', { name: 'Views' })
    .getByRole('link', { name: new RegExp(`^${list}`) })
  await expect(link).toHaveText(new RegExp(`${list}.*1$`))

  const row = await createTask(page, title)
  await row.getByRole('button', { name: `Open "${title}"` }).click()
  await panel(page).getByLabel('List').selectOption({ label: list })
  await expect(row).toContainText(list)
  await expect(link).toHaveText(new RegExp(`${list}.*2$`))
})

test('Escape in a dirty field reverts it; a second Escape closes', async ({
  page,
}) => {
  const title = uniqueTitle('revert me')
  await gotoHydrated(page)
  const row = await createTask(page, title)
  await row.getByRole('button', { name: `Open "${title}"` }).click()

  const field = panel(page).getByLabel('Title')
  await field.fill('something else')
  await page.keyboard.press('Escape')
  await expect(field).toHaveValue(title)
  await expect(panel(page)).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
})

test('a deep link renders the panel from the server', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  const row = page
    .getByRole('listitem')
    .filter({ hasText: 'Draft the README with setup and deploy steps' })
  await row.getByRole('button', { name: /^Open "Draft the README/ }).click()
  const url = page.url()
  expect(url).toMatch(/\/t\/[0-9a-f]{24}/)

  const fresh = await page.context().newPage()
  const response = await fresh.goto(url)
  expect(response?.status()).toBe(200)
  // In the HTML itself, before any script runs.
  expect(await response?.text()).toContain('Draft the README with setup')
  await expect(panel(fresh).getByLabel('Title')).toHaveValue(
    'Draft the README with setup and deploy steps',
  )
})

test('a task that is not yours is simply not here', async ({ page }) => {
  await gotoHydrated(page, '/t/64b0c0ffee0ddba11ad0c0de')
  await expect(page.getByText('That task is not here')).toBeVisible()
  await expect(panel(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to the list' }).click()
  await expect(page).not.toHaveURL(/\/t\//)
})

test('the panel has no accessibility violations', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Draft the README' })
    .getByRole('button', { name: /^Open/ })
    .click()
  await expect(panel(page)).toBeVisible()
  const results = await new AxeBuilder({ page })
    .include('aside')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
