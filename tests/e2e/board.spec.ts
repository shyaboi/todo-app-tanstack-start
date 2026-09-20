import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import {
  createTask,
  gotoHydrated,
  signIn,
  uniqueTitle,
  waitForServerAck,
} from './helpers'

/* The board, driven by keyboard first (PLAN.md D11). Pointer drag-and-drop,
   when it lands, must dispatch into the same moves these tests exercise. */

const column = (page: Page, name: string) =>
  page.getByRole('region', { name: new RegExp(`^${name}`) })
const card = (page: Page, title: string) =>
  page.getByRole('listitem').filter({ hasText: title })
const live = (page: Page) => page.getByTestId('board-announcement')

/** Creates a task on the list, then goes to the board. */
async function boardWith(page: Page, title: string) {
  await gotoHydrated(page)
  await createTask(page, title)
  await page.keyboard.press('g')
  await page.keyboard.press('b')
  await expect(page).toHaveURL(/\/board$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Board')
}

test('G B opens the board, three columns, each a labelled region', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  await page.keyboard.press('g')
  await page.keyboard.press('b')
  await expect(page).toHaveURL(/\/board$/)
  for (const name of ['To do', 'In progress', 'Done']) {
    await expect(column(page, name)).toBeVisible()
    await expect(
      column(page, name).getByRole('heading', { level: 2 }),
    ).toContainText(name)
  }
  // The sidebar knows where you are.
  await expect(
    page
      .getByRole('navigation', { name: 'Views' })
      .getByRole('link', { name: /^Board/ }),
  ).toHaveAttribute('aria-current', 'page')
})

test('⇧→ moves the selected card to the next column, and it persists', async ({
  page,
}) => {
  const title = uniqueTitle('board move')
  await boardWith(page, title)

  await page.keyboard.press('ArrowDown')
  await expect(card(page, title)).toBeFocused()
  await expect(column(page, 'To do').getByText(title)).toBeVisible()

  /* Each move is acknowledged before the next, and each wait is registered
     BEFORE its key: an acknowledgement can arrive before a wait set up
     afterwards would start listening, and then nothing ever resolves. Waiting
     per move also keeps the first move's response from satisfying the wait
     meant for the second. */
  const toDoing = waitForServerAck(page, title)
  await page.keyboard.press('Shift+ArrowRight')
  await expect(column(page, 'In progress').getByText(title)).toBeVisible()
  await expect(live(page)).toContainText('In progress')
  // Focus followed the card into its new column.
  await expect(card(page, title)).toBeFocused()
  await toDoing

  const toDone = waitForServerAck(page, title)
  await page.keyboard.press('Shift+ArrowRight')
  await expect(column(page, 'Done').getByText(title)).toBeVisible()
  await toDone
  // Nowhere further to go: the key is inert, the card stays.
  await page.keyboard.press('Shift+ArrowRight')
  await expect(column(page, 'Done').getByText(title)).toBeVisible()

  await page.reload()
  await expect(column(page, 'Done').getByText(title)).toBeVisible()
})

test('Space picks a card up, the arrows carry it, Space drops it', async ({
  page,
}) => {
  const title = uniqueTitle('board carry')
  await boardWith(page, title)
  await page.keyboard.press('ArrowDown')
  await expect(card(page, title)).toBeFocused()

  await page.keyboard.press('Space')
  await expect(
    card(page, title).getByRole('button', { name: `Drop "${title}"` }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(live(page)).toContainText('Picked up')

  await page.keyboard.press('ArrowRight')
  await expect(column(page, 'In progress').getByText(title)).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(column(page, 'To do').getByText(title)).toBeVisible()

  await page.keyboard.press('Space')
  await expect(
    card(page, title).getByRole('button', { name: `Pick up "${title}"` }),
  ).toHaveAttribute('aria-pressed', 'false')
  // Not lifted any more: → walks the selection, the card stays where it is.
  await page.keyboard.press('ArrowRight')
  await expect(column(page, 'To do').getByText(title)).toBeVisible()
})

test('Escape drops a lifted card without moving it', async ({ page }) => {
  const title = uniqueTitle('board escape')
  await boardWith(page, title)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await expect(live(page)).toContainText('Picked up')
  await page.keyboard.press('Escape')
  await expect(live(page)).toContainText('Dropped')
  await expect(column(page, 'To do').getByText(title)).toBeVisible()
})

test('↵ opens the card without leaving the board', async ({ page }) => {
  const title = uniqueTitle('board open')
  await boardWith(page, title)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  // The board's own slot, not the list's (PLAN.md 8.4b).
  await expect(page).toHaveURL(/\/board\/t\/[0-9a-f]{24}/)
  const panel = page.getByRole('complementary', { name: 'Task details' })
  await expect(panel.getByLabel('Title')).toHaveValue(title)
  // The board is still there behind it, with its columns.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Board')
  await expect(column(page, 'To do')).toBeVisible()
  await expect(card(page, title)).toBeVisible()

  // Escape closes it and puts focus back on the card.
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page).toHaveURL(/\/board$/)
  await expect(card(page, title)).toBeFocused()
})

test('a board deep link renders the board behind the panel', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page, '/board')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  const url = page.url()

  const fresh = await page.context().newPage()
  await fresh.goto(url)
  await expect(fresh.getByRole('heading', { level: 1 })).toHaveText('Board')
  await expect(
    fresh.getByRole('complementary', { name: 'Task details' }),
  ).toBeVisible()
  await fresh.close()
})

test('V switches between the views, and a bare visit remembers the last one', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  const h1 = page.getByRole('heading', { level: 1 })

  /* The URL changes before the page does: for a moment the list's key
     listener is still the one attached. Waiting on the heading, not the URL,
     is waiting for the page that will actually receive the next key. */
  await page.keyboard.press('v')
  await expect(h1).toHaveText('Board')
  await page.keyboard.press('v')
  await expect(h1).toHaveText('Inbox')
  await expect(page).toHaveURL(/\/$|\/\?/)

  await page.keyboard.press('g')
  await page.keyboard.press('b')
  await expect(h1).toHaveText('Board')
  await gotoHydrated(page, '/')
  await expect(page).toHaveURL(/\/board$/)

  // A filtered link is not a bare visit; it always shows what it says.
  await gotoHydrated(page, '/?status=todo')
  await expect(page).toHaveURL(/status=todo/)
})

test('a card can be dragged to a column, and lands where ⇧→ would put it', async ({
  page,
}) => {
  const title = uniqueTitle('board drag')
  await boardWith(page, title)

  // Registered before the drag, for the same reason as every other wait.
  const moved = waitForServerAck(page, title)
  await card(page, title).dragTo(column(page, 'Done'))
  await expect(column(page, 'Done').getByText(title)).toBeVisible()
  // The same announcement as the keyboard move: one implementation.
  await expect(live(page)).toContainText('Done')

  await moved
  await page.reload()
  await expect(column(page, 'Done').getByText(title)).toBeVisible()
})

test('dropping a card on its own column changes nothing', async ({ page }) => {
  const title = uniqueTitle('board same column')
  await boardWith(page, title)
  await card(page, title).dragTo(column(page, 'To do'))
  await expect(column(page, 'To do').getByText(title)).toBeVisible()
  await expect(live(page)).toHaveText('')
})

test('a page that loaded on the board can still get back to the list', async ({
  page,
}) => {
  await signIn(page)
  // Loading here remembers "board" and never renders / -- the case where the
  // first click on Inbox used to count as a bare visit and bounce straight
  // back.
  await gotoHydrated(page, '/board')
  const inbox = page
    .getByRole('navigation', { name: 'Views' })
    .getByRole('link', { name: /^Inbox/ })
  await inbox.click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox')
  await expect(page).toHaveURL(/\/$|\/\?/)
  // And it stays there.
  await page.waitForTimeout(500)
  await expect(page).toHaveURL(/\/$|\/\?/)

  /* The keyboard route back works too. The click left focus on the link, and
     a single-key shortcut deliberately does not fire while a link or button
     has focus -- so step off it first, as a person's next Tab or click would. */
  await inbox.evaluate((el: HTMLElement) => el.blur())
  await page.keyboard.press('g')
  await page.keyboard.press('b')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Board')
  await page.keyboard.press('v')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox')
})

test('the board has no accessibility violations', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page, '/board')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
