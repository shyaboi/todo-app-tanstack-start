import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { gotoHydrated, signIn } from './helpers'

/* The shell: a sidebar of views that are URLs, and a page whose h1 says which
   one you are on. */

const views = (page: Page) => page.getByRole('navigation', { name: 'Views' })

test('the sidebar is a navigation landmark of links, not a list', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  const nav = views(page)
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link', { name: /^Inbox/ })).toBeVisible()
  await expect(nav.getByRole('link', { name: /^Today/ })).toBeVisible()
  await expect(nav.getByRole('link', { name: /^Docs/ })).toBeVisible()
  // Every listitem on the page belongs to the task list. The whole suite
  // counts on it, so the sidebar must never contribute one.
  await expect(nav.getByRole('listitem')).toHaveCount(0)
})

test('the h1 names the view, and the active link says so too', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox')
  await expect(
    views(page).getByRole('link', { name: /^Inbox/ }),
  ).toHaveAttribute('aria-current', 'page')

  await views(page)
    .getByRole('link', { name: /^Today/ })
    .click()
  await expect(page).toHaveURL(/due=today/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today')
  await expect(
    views(page).getByRole('link', { name: /^Today/ }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(
    views(page).getByRole('link', { name: /^Inbox/ }),
  ).not.toHaveAttribute('aria-current', 'page')

  await views(page).getByRole('link', { name: /^Docs/ }).click()
  await expect(page).toHaveURL(/list=[0-9a-f]{24}/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Docs')
  for (const row of await page.getByRole('listitem').all()) {
    await expect(row).toContainText('Docs')
  }
})

test('the Inbox count is the number of open tasks on the page', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  const openRows = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('checkbox', { checked: false }) })
  const shown = await openRows.count()
  expect(shown).toBeGreaterThan(0)
  await expect(views(page).getByRole('link', { name: /^Inbox/ })).toHaveText(
    new RegExp(`Inbox.*${shown}$`),
  )
})

test('a status filter on top of a view keeps that view active', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page, '/?due=today&status=doing')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today')
  await expect(
    views(page).getByRole('link', { name: /^Today/ }),
  ).toHaveAttribute('aria-current', 'page')
})

test('G I and G T land on the same views the sidebar links to', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  // Start on a list view, reached the way a person would.
  await views(page)
    .getByRole('link', { name: /^Infra/ })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Infra')

  /* The click left focus on the link, and a single-key shortcut deliberately
     does not fire while a link has focus -- it would fire twice. */
  await page.evaluate(() => (document.activeElement as HTMLElement).blur())
  await page.keyboard.press('g')
  await page.keyboard.press('t')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today')

  await page.keyboard.press('g')
  await page.keyboard.press('i')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox')
  await expect(
    views(page).getByRole('link', { name: /^Inbox/ }),
  ).toHaveAttribute('aria-current', 'page')
})

test('sign-in has no sidebar; there is nothing to navigate between yet', async ({
  page,
}) => {
  await gotoHydrated(page, '/sign-in')
  await expect(views(page)).toHaveCount(0)
})
