import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createTask, gotoHydrated, signIn, uniqueTitle } from './helpers'

/* The command palette, driven only by keys. The runner is not a Mac, so ⌘K
   is Control+K. */

/* Scoped to the palette's own listbox on purpose: the sort <select> on the page
   behind contributes real `option` elements too, so an unscoped role query
   picks whichever comes first in the document. */
const results = (page: Page) =>
  page.getByRole('listbox', { name: 'Results' }).getByRole('option')

const open = async (page: Page) => {
  await page.keyboard.press('Control+k')
  const box = page.getByRole('combobox', { name: 'Type a command or search' })
  await expect(box).toBeFocused()
  return box
}

test('⌘K opens the palette focused, ready to type', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  const box = await open(page)
  await expect(
    page.getByRole('dialog', { name: 'Command palette' }),
  ).toBeVisible()
  await expect(box).toHaveAttribute('aria-expanded', 'true')
  await expect(results(page).first()).toBeVisible()
})

test('runs a command: type, Enter, done', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page, '/?q=focus&status=todo')
  const box = await open(page)

  await box.fill('inbox')
  await expect(
    results(page).filter({ hasText: 'Go to Inbox' }),
  ).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page).toHaveURL(/\/$|\/\?$/)
})

test('the highlight moves with arrows; focus never leaves the input', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  const box = await open(page)

  const before = await box.getAttribute('aria-activedescendant')
  await page.keyboard.press('ArrowDown')
  const after = await box.getAttribute('aria-activedescendant')
  expect(after).not.toBe(before)
  await expect(box).toBeFocused()
})

test('Escape closes and returns focus to where you were', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  const search = page.getByRole('searchbox', { name: 'Search tasks' })
  await search.focus()

  // ⌘K passes through even from inside a text field.
  await open(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(search).toBeFocused()
})

test('⌘↵ runs and keeps the palette open', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  const box = await open(page)
  await box.fill('hide completed')
  await page.keyboard.press('Control+Enter')
  await expect(page).toHaveURL(/status=todo(%2C|,)doing/)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(box).toBeFocused()
})

test('# scopes to lists and filters by the chosen one', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  const box = await open(page)
  await box.fill('# docs')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/list=docs/)
  const rows = page.getByRole('listitem')
  await expect(rows.first()).toBeVisible()
  for (const row of await rows.all()) await expect(row).toContainText('Docs')
})

test('picking a task from the palette opens it', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  const box = await open(page)
  await box.fill('vercel preview')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/t\/[0-9a-f]{24}/)
  const panel = page.getByRole('complementary', { name: 'Task details' })
  await expect(panel.getByLabel('Title')).toHaveValue(
    'Set up Vercel preview deploys',
  )
  // The list is still there behind it, filters untouched.
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Set up Vercel preview' }),
  ).toBeVisible()
})

test('! sets priority on the selected task', async ({ page }) => {
  const title = uniqueTitle('palette prio')
  await gotoHydrated(page)
  const row = await createTask(page, title)
  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()

  const box = await open(page)
  await box.fill('! urgent')
  await page.keyboard.press('Enter')
  await expect(row.getByText('P1', { exact: true })).toBeVisible()
})

test('nothing matched: Enter creates the task you typed', async ({ page }) => {
  const title = uniqueTitle('made from the palette')
  await gotoHydrated(page)
  await createTask(page, uniqueTitle('so the list is not empty'))

  const box = await open(page)
  await box.fill(title)
  await expect(page.getByText(`No match for “${title}”.`)).toBeVisible()
  await page.keyboard.press('Enter')

  await expect(
    page.getByRole('listitem').filter({ hasText: title }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('listitem').filter({ hasText: title }),
  ).toBeVisible()
})

test('the open palette has no accessibility violations', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  await open(page)
  const results = await new AxeBuilder({ page })
    .include('dialog')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
