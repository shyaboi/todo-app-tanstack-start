import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { createTask, gotoHydrated, signIn, uniqueTitle } from './helpers'

/* Every route and every overlay, scanned (PLAN.md 7.2). The per-feature specs
   already scan the surface they introduce; this is the one place that says
   the whole app passes, so a regression anywhere fails CI with the page
   named. WCAG 2.1 AA, which is what the design's contrast floors target. */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function scan(page: Page, label: string, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(TAGS)
  if (include) builder = builder.include(include)
  const results = await builder.analyze()
  // Named, so a failure says which page rather than just "violations".
  expect(results.violations, label).toEqual([])
}

test('the list, empty and as a guest', async ({ page }) => {
  await gotoHydrated(page)
  await scan(page, 'list, empty')
})

test('the list with tasks, filters and a search', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page, '/?q=the&status=todo,doing&due=week')
  await scan(page, 'list, filtered')
})

test('the list with no matches', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page, '/?q=zzzz-nothing-matches&status=done')
  await expect(page.getByText(/No tasks match/)).toBeVisible()
  await scan(page, 'list, no matches')
})

test('the list with a row selected and a title being edited', async ({
  page,
}) => {
  await gotoHydrated(page)
  const created = await createTask(page, uniqueTitle('a11y edit'))
  /* By id from here: once the title is an input, the row no longer "has
     text", and a locator built on the title finds nothing. */
  const id = await created.getAttribute('data-task-row')
  const row = page.locator(`[data-task-row="${id}"]`)
  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()
  await page.keyboard.press('e')
  await expect(row.getByRole('textbox')).toBeFocused()
  await scan(page, 'list, editing')
})

test('the detail panel, and its not-found state', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Draft the README' })
    .getByRole('button', { name: /^Open/ })
    .click()
  await expect(
    page.getByRole('complementary', { name: 'Task details' }),
  ).toBeVisible()
  await scan(page, 'detail panel')

  await gotoHydrated(page, '/t/64b0c0ffee0ddba11ad0c0de')
  await expect(page.getByText('That task is not here')).toBeVisible()
  await scan(page, 'detail, not found')
})

test('the board, with a card picked up', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page, '/board')
  await scan(page, 'board')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await expect(page.getByTestId('board-announcement')).toContainText(
    'Picked up',
  )
  await scan(page, 'board, card lifted')
})

test('sign-in and sign-up, including a validation error', async ({ page }) => {
  await gotoHydrated(page, '/sign-in')
  await scan(page, 'sign-in')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  await scan(page, 'sign-in, with errors')

  await gotoHydrated(page, '/sign-up')
  await scan(page, 'sign-up')
})

test('the delete confirmation and the undo toast', async ({ page }) => {
  await gotoHydrated(page)
  const row = await createTask(page, uniqueTitle('a11y delete'))
  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()
  await page.keyboard.press('Control+Backspace')
  await expect(
    page.getByRole('dialog', { name: 'Delete this task?' }),
  ).toBeVisible()
  await scan(page, 'confirm dialog', 'dialog')

  // Exact and scoped: every row also has a button whose name contains "Delete".
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('Task deleted')
  await scan(page, 'undo toast')
})

test('a failure toast and the route error view', async ({ page }) => {
  await gotoHydrated(page)
  await createTask(page, uniqueTitle('a11y before failure'))
  await page.route('**/_serverFn/**', (route) =>
    route.request().method() === 'POST'
      ? route.abort('failed')
      : route.continue(),
  )
  await page.getByLabel('Task title').fill(uniqueTitle('a11y fails'))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toContainText('Nothing was saved')
  await scan(page, 'failure toast')
  await page.unroute('**/_serverFn/**')
})

test('the loading skeleton', async ({ page }) => {
  await gotoHydrated(page, '/sign-in')
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'GET') {
      await new Promise((r) => setTimeout(r, 1500))
    }
    await route.continue()
  })
  await page.getByLabel('Email').fill('ada@example.com')
  await page.getByLabel('Password').fill('seed-password-ada')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(
    page.getByRole('status', { name: 'Loading your tasks' }),
  ).toBeVisible()
  await scan(page, 'skeleton')
  await page.unroute('**/_serverFn/**')
})
