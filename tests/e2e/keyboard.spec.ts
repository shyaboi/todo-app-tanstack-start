import { test, expect } from '@playwright/test'
import { createTask, gotoHydrated, signIn, uniqueTitle } from './helpers'

/* The design's promise: everything the mouse can do, the keyboard can do
   first. Every test here drives the app with keys alone. The runner is not a
   Mac, so ⌘ is Control throughout. */

const mod = 'Control'

test('arrows move a real focus through the rows', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)

  await page.keyboard.press('ArrowDown')
  const first = page.getByRole('listitem').first()
  await expect(first).toBeFocused()
  await expect(first).toHaveAttribute('aria-current', 'true')

  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('listitem').nth(1)).toBeFocused()
  await expect(first).not.toHaveAttribute('aria-current', 'true')

  await page.keyboard.press('ArrowUp')
  await expect(first).toBeFocused()
})

test('Space advances the selected task, and 1 2 3 set its status', async ({
  page,
}) => {
  const title = uniqueTitle('kbd status')
  await gotoHydrated(page)
  const row = await createTask(page, title)

  // Select it with the keyboard: a fresh guest has exactly one row.
  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()

  await page.keyboard.press('Space')
  await expect(
    row.getByRole('button', { name: /In progress\. Change to Done/ }),
  ).toBeVisible()

  await page.keyboard.press('3')
  await expect(
    row.getByRole('button', { name: /Done\. Change to To do/ }),
  ).toBeVisible()

  await page.keyboard.press('1')
  await expect(
    row.getByRole('button', { name: /To do\. Change to In progress/ }),
  ).toBeVisible()
})

test('E edits the title in place; Escape reverts', async ({ page }) => {
  const title = uniqueTitle('kbd edit')
  await gotoHydrated(page)
  const row = await createTask(page, title)
  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()

  await page.keyboard.press('e')
  const input = page.getByRole('textbox', { name: `Title of "${title}"` })
  await expect(input).toBeFocused()

  // Typing inside the editor must not trip shortcuts: "n" is a letter here.
  await input.fill('n e w')
  await expect(page.getByLabel('Task title')).not.toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.getByText(title, { exact: true })).toBeVisible()
})

test('⌘⌫ asks before deleting, and Escape backs out', async ({ page }) => {
  const title = uniqueTitle('kbd delete')
  await gotoHydrated(page)
  const row = await createTask(page, title)
  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()

  await page.keyboard.press(`${mod}+Backspace`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText(
    'You can undo for 8 seconds',
  )

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
})

test('⌘D duplicates the selected task back at To do', async ({ page }) => {
  const title = uniqueTitle('kbd dup')
  await gotoHydrated(page)
  const row = await createTask(page, title)
  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()

  await page.keyboard.press(`${mod}+d`)
  await expect(
    page.getByRole('listitem').filter({ hasText: title }),
  ).toHaveCount(2)
})

test('N focuses the composer and / focuses the search', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)

  await page.keyboard.press('n')
  await expect(page.getByLabel('Task title')).toBeFocused()

  // Blur first: inside a text field, a slash is just a slash.
  await page.keyboard.press('Escape')
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('/')
  await expect(
    page.getByRole('searchbox', { name: 'Search tasks' }),
  ).toBeFocused()
})

test('letters typed into the search box are not shortcuts', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  const box = page.getByRole('searchbox', { name: 'Search tasks' })
  await box.focus()
  await page.keyboard.type('n a e')
  await expect(box).toHaveValue('n a e')
  await expect(box).toBeFocused()
})

test('G I goes to the inbox and G T to today', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page, '/?q=focus&status=todo')

  await page.keyboard.press('g')
  await page.keyboard.press('i')
  await expect(page).toHaveURL(/\/$|\/\?$/)

  await page.keyboard.press('g')
  await page.keyboard.press('t')
  await expect(page).toHaveURL(/due=today/)
  await expect(page).not.toHaveURL(/q=/)
})

test('number keys filter when nothing is selected, and A shows all', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)

  await page.keyboard.press('3')
  await expect(page).toHaveURL(/status=done/)
  await expect(page.getByRole('listitem')).toHaveCount(2)

  // Again: the active filter toggles off.
  await page.keyboard.press('3')
  await expect(page).not.toHaveURL(/status=/)

  await page.keyboard.press('2')
  await expect(page).toHaveURL(/status=doing/)
  await page.keyboard.press('a')
  await expect(page).not.toHaveURL(/status=/)
  await expect(page.getByRole('listitem')).toHaveCount(10)
})

test('⇧C hides completed tasks and ⇧⌘X clears everything', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)

  await page.keyboard.press('Shift+C')
  await expect(page).toHaveURL(/status=todo(%2C|,)doing/)
  await expect(page.getByRole('region', { name: /^Completed/ })).toHaveCount(0)

  await page.getByRole('searchbox', { name: 'Search tasks' }).fill('focus')
  await expect(page).toHaveURL(/q=focus/)
  await page.locator('body').click({ position: { x: 5, y: 5 } })

  await page.keyboard.press(`${mod}+Shift+X`)
  await expect(page).not.toHaveURL(/q=|status=/)
  await expect(page.getByRole('listitem')).toHaveCount(10)
})

test('Escape cascades: clear the search, then drop the selection', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page, '/?q=focus')
  await expect(page.getByRole('listitem')).toHaveCount(1)

  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('listitem').first()).toBeFocused()

  // First Escape with focus on a row: the search clears, the selection stays.
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/q=/)
  await expect(page.getByRole('listitem')).toHaveCount(10)
  await expect(page.locator('[aria-current="true"]')).toHaveCount(1)

  // Second: the selection is dropped.
  await page.keyboard.press('Escape')
  await expect(page.locator('[aria-current="true"]')).toHaveCount(0)
})

test('the delete button and status pill show their keys on hover', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  const row = page.getByRole('listitem').first()
  await expect(row.getByRole('button', { name: /^Delete "/ })).toHaveAttribute(
    'title',
    /Delete · Ctrl\+Backspace/,
  )
  await expect(row.getByRole('button', { name: /Change to/ })).toHaveAttribute(
    'title',
    'Advance status · Space',
  )
})
