import { test, expect } from '@playwright/test'
import { createTask, gotoHydrated, signIn, uniqueTitle } from './helpers'

/* The list view as the design draws it: grouped by due date with counts, a
   sort control, and the two distinct empty states. Ada's seed is laid out so
   every group is populated: 1 overdue, 2 today, 5 later this week, 2 done. */

test('groups the list by due date with a count in each heading', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)

  const headings = page.getByRole('heading', { level: 2 })
  await expect(headings).toHaveText([
    /^Overdue1$/,
    /^Today · .+2$/,
    /^Later this week5$/,
    /^Completed2$/,
  ])

  // Each section is its own list; together they still hold every task.
  await expect(page.getByRole('list')).toHaveCount(4)
  await expect(page.getByRole('listitem')).toHaveCount(10)
})

test('a completed task sits under Completed, whenever it was due', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)

  const completed = page.getByRole('region', { name: /^Completed/ })
  await expect(
    completed.getByText('Set up Vercel preview deploys'),
  ).toBeVisible()
  // Overdue by date, but done -- so not in Overdue.
  const overdue = page.getByRole('region', { name: /^Overdue/ })
  await expect(overdue.getByText('Set up Vercel preview deploys')).toHaveCount(
    0,
  )
})

test('sorting by newest flattens the list, and the choice is in the URL', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)

  await page.getByLabel('Sort').selectOption('created')
  await expect(page).toHaveURL(/sort=created/)
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0)
  await expect(page.getByRole('list')).toHaveCount(1)
  await expect(page.getByRole('listitem')).toHaveCount(10)

  // Due date is the default, so choosing it clears the parameter again.
  await page.getByLabel('Sort').selectOption('due')
  await expect(page).not.toHaveURL(/sort=/)
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(4)
})

test('a sorted link arrives already sorted', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page, '/?sort=created')
  await expect(page.getByLabel('Sort')).toHaveValue('created')
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0)
})

test('says how many filters are narrowing an empty result', async ({
  page,
}) => {
  await signIn(page)
  // Query plus status: two filters, nothing left.
  await gotoHydrated(page, '/?q=zzz-nothing&status=todo')
  await expect(page.getByText('No tasks match “zzz-nothing”')).toBeVisible()
  await expect(
    page.getByText(/^Two filters are narrowing this search/),
  ).toBeVisible()
})

test('offers to create the task you were searching for', async ({ page }) => {
  // As a guest, so the new task cannot disturb Ada's counts in other tests.
  await gotoHydrated(page)
  await createTask(page, uniqueTitle('something to make the list non-empty'))

  const wanted = uniqueTitle('wanted')
  await gotoHydrated(page, `/?q=${encodeURIComponent(wanted)}`)
  await expect(page.getByText(`No tasks match “${wanted}”`)).toBeVisible()

  await page.getByRole('button', { name: `Create “${wanted}”` }).click()

  // It matches its own query, so it appears in place of the empty state.
  const row = page.getByRole('listitem').filter({ hasText: wanted })
  await expect(row).toBeVisible()
  await expect(page.getByText(`No tasks match “${wanted}”`)).toHaveCount(0)

  await page.reload()
  await expect(
    page.getByRole('listitem').filter({ hasText: wanted }),
  ).toBeVisible()
})

test('first run and no-match are different empties', async ({ page }) => {
  // A fresh guest has nothing at all.
  await gotoHydrated(page, '/?q=anything')
  await expect(page.getByText('Nothing here yet')).toBeVisible()
  await expect(page.getByText(/No tasks match/)).toHaveCount(0)
})
