import { test, expect } from '@playwright/test'
import {
  createTask,
  gotoHydrated,
  signIn,
  uniqueTitle,
  waitForServerAck,
} from './helpers'

/* The vertical slice: loader -> listTodos -> MongoDB -> TaskList ->
   createTodo -> cache -> UI. Proves every architectural layer is connected
   before any secondary feature is built. */

const unique = () => uniqueTitle('e2e probe')

test('server-renders the task list from the database', async ({ page }) => {
  // The seeded tasks belong to Ada, so this has to say who it is first.
  await signIn(page)

  const response = await page.goto('/')
  const html = await response!.text()

  // Asserted against the RAW response, not the rendered DOM: this is what
  // proves the loader ran on the server rather than the client fetching.
  expect(html).toContain('Wire optimistic updates into the toggle mutation')
  expect(html).toContain('In progress')

  // The DTO boundary holds: no driver shapes in the payload (Failure Check 5).
  expect(html).not.toContain('ObjectId')
  expect(html).not.toContain('"_id"')
})

test('creates a task, and it survives a reload', async ({ page }) => {
  const title = unique()
  await gotoHydrated(page)

  const saved = waitForServerAck(page, title)
  await page.getByLabel('Task title').fill(title)
  await page.getByRole('button', { name: 'Add task' }).click()

  // Appears immediately -- the optimistic row.
  await expect(page.getByText(title)).toBeVisible()
  await saved

  // AC7: still there after a full round trip to the database.
  await page.reload()
  await expect(page.getByText(title)).toBeVisible()
})

test('trims the title through the real server path', async ({ page }) => {
  const title = unique()
  await gotoHydrated(page)

  const saved = waitForServerAck(page, title)
  await page.getByLabel('Task title').fill(`   ${title}   `)
  await page.getByRole('button', { name: 'Add task' }).click()
  await saved
  await page.reload()

  // Exact-match locator: a stored title with surrounding spaces would fail.
  await expect(page.getByText(title, { exact: true })).toBeVisible()
})

test('refuses an empty title and says why', async ({ page }) => {
  await gotoHydrated(page)
  const before = await page.getByRole('listitem').count()

  await page.getByLabel('Task title').fill('   ')
  await page.getByRole('button', { name: 'Add task' }).click()

  await expect(page.getByRole('alert')).toContainText('Give the task a title')
  expect(await page.getByRole('listitem').count()).toBe(before)
})

test('the list is a real list, not divs pretending to be one', async ({
  page,
}) => {
  // The seeded tasks belong to Ada, so this has to say who it is first.
  await signIn(page)
  await gotoHydrated(page)
  // Fails if TaskList is refactored into divs -- the design's a11y contract.
  await expect(page.getByRole('list')).toBeVisible()
  expect(await page.getByRole('listitem').count()).toBeGreaterThan(0)
})

test('toggles status with the checkbox, and it persists', async ({ page }) => {
  const title = unique()
  await gotoHydrated(page)
  const row = await createTask(page, title)

  /* .click(), not .check(): the checkbox is controlled by React and driven by
     an async mutation, so its DOM state briefly reads back as the pre-update
     value. .check() treats that as "the click did not work" and fails. */
  const checkbox = row.getByRole('checkbox')
  await expect(checkbox).not.toBeChecked()

  const saved = waitForServerAck(page, title)
  await checkbox.click()
  await expect(checkbox).toBeChecked()
  await saved

  // The assertion that matters: it reached the database, not just the cache.
  await page.reload()
  await expect(
    page.getByRole('listitem').filter({ hasText: title }).getByRole('checkbox'),
  ).toBeChecked()
})

test('walks status forward through the pill', async ({ page }) => {
  const title = unique()
  await gotoHydrated(page)
  const row = await createTask(page, title)

  // The accessible name states the current status and the outcome, so this
  // also asserts the control is announced usefully.
  await row
    .getByRole('button', { name: /To do. Change to In progress/ })
    .click()
  await expect(row.getByRole('button', { name: /In progress/ })).toBeVisible()

  await row.getByRole('button', { name: /In progress. Change to Done/ }).click()
  await expect(
    row.getByRole('button', { name: /Done. Change to To do/ }),
  ).toBeVisible()

  await page.reload()
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: title })
      .getByRole('button', { name: /Done/ }),
  ).toBeVisible()
})

test('deletes a task behind a confirmation, and undo brings it back', async ({
  page,
}) => {
  const title = unique()
  await gotoHydrated(page)

  await page.getByLabel('Task title').fill(title)
  await page.getByRole('button', { name: 'Add task' }).click()
  await expect(page.getByText(title, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: `Delete "${title}"` }).click()

  // A real dialog: the browser exposes it as one.
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('You can undo for 8 seconds')

  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(title, { exact: true })).toHaveCount(0)

  /* Undo writes to the cache optimistically and to the database in the
     background. Reloading without waiting for that request races it, and the
     page would come back from the server before the restore had landed. */
  const restored = waitForServerAck(page, title)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
  await restored

  // The real proof: the restore reached the database, not just the cache.
  await page.reload()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
})

test('cancelling the dialog keeps the task and restores focus', async ({
  page,
}) => {
  const title = unique()
  await gotoHydrated(page)
  const row = await createTask(page, title)
  const trigger = row.getByRole('button', { name: /^Delete "/ })

  await trigger.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
  // The design is explicit: focus returns to the row on close.
  await expect(trigger).toBeFocused()
})

test('escape closes the dialog without deleting', async ({ page }) => {
  const title = unique()
  await gotoHydrated(page)
  const row = await createTask(page, title)

  await row.getByRole('button', { name: /^Delete "/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
})

test('a deleted task stays deleted once the undo window closes', async ({
  page,
}) => {
  const title = unique()
  await gotoHydrated(page)
  await createTask(page, title)

  await page.getByRole('button', { name: `Delete "${title}"` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()

  // Let the 8-second window lapse rather than clicking Undo.
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toHaveCount(0, {
    timeout: 12_000,
  })

  await page.reload()
  await expect(page.getByText(title, { exact: true })).toHaveCount(0)
})

test('edits a title in place, and the change persists', async ({ page }) => {
  const title = unique()
  const renamed = `${title} renamed`
  await gotoHydrated(page)
  const row = await createTask(page, title)

  await row.getByRole('button', { name: `Edit title: ${title}` }).click()

  // Located by aria-label, not through the row: once editing starts the title
  // is an input value rather than row text, so a hasText filter stops matching.
  const input = page.getByRole('textbox', { name: `Title of "${title}"` })
  const saved = waitForServerAck(page, renamed)
  await input.fill(renamed)
  await input.press('Enter')
  await saved

  await page.reload()
  await expect(page.getByText(renamed, { exact: true })).toBeVisible()
})

test('escape reverts an edit without saving', async ({ page }) => {
  const title = unique()
  await gotoHydrated(page)
  const row = await createTask(page, title)

  await row.getByRole('button', { name: `Edit title: ${title}` }).click()
  const input = page.getByRole('textbox', { name: `Title of "${title}"` })
  await input.fill('this should never be stored')
  await input.press('Escape')

  await expect(page.getByText(title, { exact: true })).toBeVisible()
  await expect(page.getByText('this should never be stored')).toHaveCount(0)

  // The real check: nothing reached the database either.
  await page.reload()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
  await expect(page.getByText('this should never be stored')).toHaveCount(0)
})

test('refuses to save an empty title and keeps you in the field', async ({
  page,
}) => {
  const title = unique()
  await gotoHydrated(page)
  const row = await createTask(page, title)

  await row.getByRole('button', { name: `Edit title: ${title}` }).click()
  const input = page.getByRole('textbox', { name: `Title of "${title}"` })
  await input.fill('   ')
  await input.press('Enter')

  await expect(page.getByRole('alert')).toContainText('Give the task a title')
  await expect(input).toBeFocused()
})
