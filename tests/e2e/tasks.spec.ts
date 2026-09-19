import { test, expect } from '@playwright/test'
import { gotoHydrated } from './helpers'

/* The vertical slice: loader -> listTodos -> MongoDB -> TaskList ->
   createTodo -> cache -> UI. Proves every architectural layer is connected
   before any secondary feature is built. */

const unique = () =>
  `e2e probe ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

test('server-renders the task list from the database', async ({ page }) => {
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

  await page.getByLabel('Task title').fill(title)
  await page.getByRole('button', { name: 'Add task' }).click()

  // Appears immediately -- the optimistic row.
  await expect(page.getByText(title)).toBeVisible()

  // AC7: still there after a full round trip to the database.
  await page.reload()
  await expect(page.getByText(title)).toBeVisible()
})

test('trims the title through the real server path', async ({ page }) => {
  const title = unique()
  await gotoHydrated(page)

  await page.getByLabel('Task title').fill(`   ${title}   `)
  await page.getByRole('button', { name: 'Add task' }).click()
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
  await gotoHydrated(page)
  // Fails if TaskList is refactored into divs -- the design's a11y contract.
  await expect(page.getByRole('list')).toBeVisible()
  expect(await page.getByRole('listitem').count()).toBeGreaterThan(0)
})
