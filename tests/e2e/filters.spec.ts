import { test, expect } from '@playwright/test'
import { gotoHydrated, openFilters, signIn } from './helpers'

/* AC5 and AC6, against Ada's seeded list: 5 to do, 3 in progress, 2 done.
   Every filter is a URL, so most assertions here are about the address bar as
   much as the page. */

const FOCUS_TASK = 'Fix focus trap in the delete confirmation dialog'
const DONE_TASK = 'Persist status filter in the URL search params'

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test('typing filters the list and lands in the URL', async ({ page }) => {
  await gotoHydrated(page)
  await expect(page.getByRole('listitem')).toHaveCount(10)

  await page.getByRole('searchbox', { name: 'Search tasks' }).fill('focus')

  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText(FOCUS_TASK)).toBeVisible()
  await expect(page.getByText('1 of 10 tasks')).toBeVisible()
  await expect(page).toHaveURL(/[?&]q=focus/)
})

test('a filtered URL is a link: it renders the same set on arrival', async ({
  page,
}) => {
  await gotoHydrated(page, '/?q=focus&status=todo,doing&due=week')

  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText(FOCUS_TASK)).toBeVisible()
  // The controls reflect the URL, not the other way round.
  await expect(
    page.getByRole('searchbox', { name: 'Search tasks' }),
  ).toHaveValue('focus')
  // The chips live behind the top bar's disclosure since 8.4a.
  await openFilters(page)
  await expect(page.getByRole('button', { name: /^To do/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(
    page.getByRole('button', { name: /^In progress/ }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'This week' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('the filtered set is server-rendered, not filtered after load', async ({
  page,
}) => {
  const response = await page.goto('/?status=done')
  const html = await response!.text()
  /* Asserted on the rendered count, not on which titles are absent. The loader
     dehydrates the UNFILTERED list into the HTML on purpose (D4), so every
     title is in the payload; what proves the filter ran on the server is that
     the markup already says two of ten. */
  expect(html).toContain(DONE_TASK)
  expect(html).toContain('2 of 10 tasks')
})

test('status chips narrow the list, and Back undoes the choice', async ({
  page,
}) => {
  await gotoHydrated(page)
  await openFilters(page)

  await page.getByRole('button', { name: /^Done 2/ }).click()
  await expect(page.getByRole('listitem')).toHaveCount(2)
  await expect(page).toHaveURL(/status=done/)
  await expect(page.getByText('2 of 10 tasks')).toBeVisible()

  await page.getByRole('button', { name: /^To do 5/ }).click()
  await expect(page.getByRole('listitem')).toHaveCount(7)

  // A chosen filter is a place you can go back from.
  await page.goBack()
  await expect(page.getByRole('listitem')).toHaveCount(2)
  await page.goBack()
  await expect(page.getByRole('listitem')).toHaveCount(10)
  await expect(page).not.toHaveURL(/status=/)
})

test('typing does not litter history: one Back leaves the search', async ({
  page,
}) => {
  await gotoHydrated(page)
  await page
    .getByRole('searchbox', { name: 'Search tasks' })
    .pressSequentially('focus', {
      delay: 200,
    })
  await expect(page).toHaveURL(/q=focus/)

  await page.goBack()
  await expect(page).not.toHaveURL(/q=/)
  await expect(page.getByRole('listitem')).toHaveCount(10)
})

test('Clear all restores the full list and empties the URL', async ({
  page,
}) => {
  await gotoHydrated(page, '/?q=focus&status=todo')
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await openFilters(page)

  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(10)
  await expect(page).toHaveURL(/\/$|\/\?$/)
  await expect(
    page.getByRole('searchbox', { name: 'Search tasks' }),
  ).toHaveValue('')
})

test('slash focuses the search from anywhere; escape clears, then blurs', async ({
  page,
}) => {
  await gotoHydrated(page)
  const box = page.getByRole('searchbox', { name: 'Search tasks' })

  await page.keyboard.press('/')
  await expect(box).toBeFocused()

  await box.fill('focus')
  await expect(page.getByRole('listitem')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(box).toHaveValue('')
  await expect(box).toBeFocused()
  await expect(page.getByRole('listitem')).toHaveCount(10)

  await page.keyboard.press('Escape')
  await expect(box).not.toBeFocused()
})

test('explains when the status filter is what is hiding a match', async ({
  page,
}) => {
  // "status" matches only a completed task; with To do selected, nothing shows.
  await gotoHydrated(page, '/?q=status&status=todo')
  await expect(page.getByRole('listitem')).toHaveCount(0)
  await expect(page.getByText('No tasks match “status”')).toBeVisible()
  await expect(
    page.getByText(/1 more task matches but is hidden/),
  ).toBeVisible()

  await openFilters(page)
  await page.getByRole('button', { name: 'Show all statuses' }).click()
  await expect(page.getByText(DONE_TASK)).toBeVisible()
  await expect(page).not.toHaveURL(/status=/)
})

test('a malformed link falls back instead of failing', async ({ page }) => {
  await gotoHydrated(
    page,
    '/?status=archived&due=someday&sort=alphabetical&q=focus',
  )
  // The good parameter survived; the bad ones were dropped, not fatal.
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText(FOCUS_TASK)).toBeVisible()
})

test('search matches notes and list names, not only titles', async ({
  page,
}) => {
  await gotoHydrated(page)
  const box = page.getByRole('searchbox', { name: 'Search tasks' })

  // "Infra" is a list name, on two seeded tasks.
  await box.fill('infra')
  await expect(page.getByRole('listitem')).toHaveCount(2)
})
