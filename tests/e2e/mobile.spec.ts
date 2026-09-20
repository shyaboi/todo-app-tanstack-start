import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { createTask, gotoHydrated, signIn, uniqueTitle } from './helpers'

/* The phone layout, at the design's 360px floor with a touch screen
   (PLAN.md 7.3). Runs in the `mobile` Playwright project only. */

const noHorizontalScroll = async (page: Page, label: string) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow, `${label}: horizontal overflow (px)`).toBeLessThanOrEqual(0)
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' })

test('nothing scrolls sideways at 360px, on any route', async ({ page }) => {
  await signIn(page)
  for (const path of ['/', '/?status=todo,doing&due=week&q=the', '/board']) {
    await gotoHydrated(page, path)
    await noHorizontalScroll(page, path)
  }
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Draft the README' })
    .getByRole('button', { name: /^Open/ })
    .click()
  await expect(
    page.getByRole('complementary', { name: 'Task details' }),
  ).toBeVisible()
  await noHorizontalScroll(page, '/t/$id')
  await gotoHydrated(page, '/sign-in')
  await noHorizontalScroll(page, '/sign-in')
})

test('the sidebar gives way to a bottom navigation with 48px targets', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeHidden()
  await expect(nav(page)).toBeVisible()
  for (const name of ['Inbox', 'Today', 'Board', 'Actions']) {
    const item = nav(page).getByRole(name === 'Actions' ? 'button' : 'link', {
      name,
    })
    await expect(item).toBeVisible()
    const box = await item.boundingBox()
    expect(box?.height, `${name} height`).toBeGreaterThanOrEqual(48)
  }
  await expect(nav(page).getByRole('link', { name: 'Inbox' })).toHaveAttribute(
    'aria-current',
    'page',
  )

  await nav(page).getByRole('link', { name: 'Board' }).tap()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Board')
  await expect(nav(page).getByRole('link', { name: 'Board' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await nav(page).getByRole('link', { name: 'Today' }).tap()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today')
})

test('Actions opens the palette as a sheet, usable entirely by touch', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  await nav(page).getByRole('button', { name: 'Actions' }).tap()
  const dialog = page.getByRole('dialog', { name: 'Command palette' })
  await expect(dialog).toBeVisible()

  // A sheet: full width, on the bottom edge, rows tall enough for a thumb.
  const box = (await dialog.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(356)
  expect(box.y + box.height).toBeGreaterThanOrEqual(730)
  const option = page
    .getByRole('listbox', { name: 'Results' })
    .getByRole('option')
    .first()
  expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(48)

  // The scope chips are buttons: a tap narrows to lists.
  await dialog.getByRole('button', { name: /Lists/ }).tap()
  await expect(dialog.getByRole('button', { name: /Lists/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(dialog.getByRole('group', { name: 'Lists' })).toBeVisible()

  // Tapping a row runs it, and the sheet goes away.
  await dialog
    .getByRole('listbox', { name: 'Results' })
    .getByRole('option', { name: /^Docs/ })
    .tap()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/list=[0-9a-f]{24}/)

  // And there is a way out that is not a key.
  await nav(page).getByRole('button', { name: 'Actions' }).tap()
  await dialog.getByRole('button', { name: 'Close' }).tap()
  await expect(dialog).toBeHidden()
})

test('the status filters are a strip that scrolls on its own', async ({
  page,
}) => {
  await signIn(page)
  await gotoHydrated(page)
  const group = page.getByRole('group', { name: 'Status' })
  await expect(group).toBeVisible()
  const scrolls = await group.evaluate(
    (el) => el.scrollWidth > el.clientWidth + 8,
  )
  expect(scrolls).toBe(true)
  await noHorizontalScroll(page, 'list with filter strip')
  // Its chips are touch targets too.
  const chip = group.getByRole('button', { name: /^To do/ })
  expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(40)
})

test('a swipe completes a task; the checkbox remains the visible way', async ({
  page,
}) => {
  const title = uniqueTitle('swipe me')
  await gotoHydrated(page)
  const row = await createTask(page, title)
  const box = (await row.boundingBox())!
  const y = box.y + box.height / 2

  /* A touch pointer, moved 120px to the right and lifted. Real touch swipes
     are pointer events under the hood; dispatching them is the same thing
     the browser does, minus the finger. */
  const touch = (type: string, x: number) =>
    row.dispatchEvent(type, {
      pointerType: 'touch',
      pointerId: 7,
      isPrimary: true,
      clientX: x,
      clientY: y,
      bubbles: true,
    })
  await touch('pointerdown', box.x + 20)
  await touch('pointermove', box.x + 80)
  await touch('pointermove', box.x + 140)
  await touch('pointerup', box.x + 140)
  await expect(row.getByRole('checkbox')).toBeChecked()

  // Back again by the visible control.
  await row.getByRole('checkbox').tap()
  await expect(row.getByRole('checkbox')).not.toBeChecked()

  // A short swipe does nothing.
  await touch('pointerdown', box.x + 20)
  await touch('pointermove', box.x + 50)
  await touch('pointerup', box.x + 50)
  await expect(row.getByRole('checkbox')).not.toBeChecked()
})

test('the detail panel is a sheet with its own Close', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Draft the README' })
    .getByRole('button', { name: /^Open/ })
    .tap()
  const panel = page.getByRole('complementary', { name: 'Task details' })
  await expect(panel).toBeVisible()
  const position = await panel.evaluate((el) => getComputedStyle(el).position)
  expect(position).toBe('fixed')
  await panel.getByRole('button', { name: 'Close task details' }).tap()
  await expect(panel).toHaveCount(0)
})

test('the phone layout has no accessibility violations', async ({ page }) => {
  await signIn(page)
  await gotoHydrated(page)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
