import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  createTask,
  gotoHydrated,
  openFilters,
  signIn,
  uniqueTitle,
} from './helpers'

/* The keyboard map, the mode strip, and the rule behind both: nothing is
   keyboard-only, and every control shows its key. */

test('? opens the keyboard map, built from the registry', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  await page.keyboard.press('?')

  const dialog = page.getByRole('dialog', { name: 'Keyboard' })
  await expect(dialog).toBeVisible()
  // A binding from each group, so the overlay is demonstrably the registry.
  await expect(dialog.getByText('New task')).toBeVisible()
  await expect(dialog.getByText('Advance status')).toBeVisible()
  await expect(dialog.getByText('Go to Inbox')).toBeVisible()
  await expect(dialog.getByText('Show all statuses')).toBeVisible()
  await expect(dialog.getByText('Open the command palette')).toBeVisible()

  // Keys resolved for the runner, which is not a Mac: no ⌘ anywhere.
  await expect(dialog.locator('kbd', { hasText: 'Ctrl' }).first()).toBeVisible()
  await expect(dialog.locator('kbd', { hasText: '⌘' })).toHaveCount(0)
})

test('escape closes the keyboard map and returns focus to its button', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  const trigger = page.getByRole('button', { name: /^Keyboard/ })
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: 'Keyboard' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('the mode strip says what the number keys do right now', async ({
  page,
}) => {
  const title = uniqueTitle('mode strip')
  await gotoHydrated(page)
  const row = await createTask(page, title)

  await expect(page.getByText('filter the list by status')).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()
  await expect(page.getByText('set the selected task’s status')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByText('filter the list by status')).toBeVisible()
})

test('the strip opens the palette too, not only ⌘K', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  await page.getByRole('button', { name: /^Commands/ }).click()
  await expect(
    page.getByRole('combobox', { name: 'Type a command or search' }),
  ).toBeFocused()
})

test('every filter control carries its key on hover', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page, '/?status=todo')
  await openFilters(page)

  await expect(page.getByRole('button', { name: /^All/ })).toHaveAttribute(
    'title',
    'Show all statuses · A',
  )
  await expect(page.getByRole('button', { name: /^To do/ })).toHaveAttribute(
    'title',
    'Filter by To do · 1',
  )
  await expect(page.getByRole('button', { name: 'Hide done' })).toHaveAttribute(
    'title',
    /* Hidden already, since ?status=todo excludes done -- so the control offers
       the way back, and says which key does it. */
    'Show completed tasks · Shift+C',
  )
  await expect(page.getByRole('button', { name: 'Clear all' })).toHaveAttribute(
    'title',
    'Clear every filter and the query · Shift+Ctrl+X',
  )
})

test('the Hide done chip and ⇧C do the same thing', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)

  await openFilters(page)
  const chip = page.getByRole('button', { name: 'Hide done' })
  await chip.click()
  await expect(page).toHaveURL(/status=todo(%2C|,)doing/)
  await expect(chip).toHaveAttribute('aria-pressed', 'true')

  /* The click left focus on the chip, and a single-key shortcut deliberately
     does not fire while a button has focus -- it would fire twice. Blurring is
     what a person does by moving the mouse away; here it has to be said. */
  await chip.evaluate((el: HTMLElement) => el.blur())
  await page.keyboard.press('Shift+C')
  await expect(page).not.toHaveURL(/status=/)
})

test('the open keyboard map has no accessibility violations', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard' })).toBeVisible()

  const results = await new AxeBuilder({ page })
    .include('dialog')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})

test('the page with the mode strip has no accessibility violations', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
