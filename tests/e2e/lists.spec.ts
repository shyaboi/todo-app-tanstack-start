import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  createTask,
  gotoHydrated,
  signIn,
  uniqueTitle,
  waitForHydrated,
  waitForServerAck,
} from './helpers'

/* Lists as a collection (PLAN.md D14, 7.4): made, renamed and removed from
   the sidebar, and reachable everywhere a list was already shown. */

const views = (page: Page) => page.getByRole('navigation', { name: 'Views' })
const listLink = (page: Page, name: string) =>
  views(page).getByRole('link', { name: new RegExp(`^${name}`) })

/** A name no other parallel test will collide with. */
const uniqueName = () =>
  `L${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`

test('a list can be made, filtered by, renamed and removed', async ({
  page,
}) => {
  const name = uniqueName()
  const renamed = `${name}x`
  await signIn(page)
  await gotoHydrated(page)

  // ── Create, from the sidebar.
  await views(page).getByRole('button', { name: 'New list' }).click()
  const created = waitForServerAck(page, name)
  await page.getByLabel('New list name').fill(name)
  await page.keyboard.press('Enter')
  await expect(listLink(page, name)).toBeVisible()
  await created

  // ── It is a real view: the link filters, and the h1 says where you are.
  await listLink(page, name).click()
  await expect(page).toHaveURL(/list=[0-9a-f]{24}/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
  await expect(page.getByText(/No tasks match/)).toBeVisible()

  // ── Rename: the heading and the link both follow.
  await views(page)
    .getByRole('button', { name: `Rename "${name}"` })
    .click()
  const field = page.getByLabel(`Name of "${name}"`)
  const saved = waitForServerAck(page, renamed)
  await field.fill(renamed)
  await page.keyboard.press('Enter')
  await expect(listLink(page, renamed)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(renamed)

  // A rename is optimistic; reloading before the server has it races the write.
  await saved
  await page.reload()
  // Reloading re-renders the markup on the server; the buttons below only
  // work once React has claimed it.
  await waitForHydrated(page)
  await expect(listLink(page, renamed)).toBeVisible()

  // ── Delete: confirmed first, and the view it was showing gives way.
  await views(page)
    .getByRole('button', { name: `Delete "${renamed}"` })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Delete this list?' })
  await expect(dialog).toContainText('Its tasks are kept, without a list.')
  await dialog.getByRole('button', { name: 'Delete list' }).click()
  await expect(listLink(page, renamed)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox')

  await page.reload()
  await expect(listLink(page, renamed)).toHaveCount(0)
})

test('deleting a list keeps its tasks, without a list', async ({ page }) => {
  const name = uniqueName()
  const title = uniqueTitle('survives its list')
  await gotoHydrated(page)

  await views(page).getByRole('button', { name: 'New list' }).click()
  await page.getByLabel('New list name').fill(name)
  await page.keyboard.press('Enter')
  await expect(listLink(page, name)).toBeVisible()

  // File a task in it, through the composer's #tag.
  await page.getByLabel('Task title').fill(`${title} #${name}`)
  await page.keyboard.press('Enter')
  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toContainText(name)
  await expect(listLink(page, name)).toHaveText(new RegExp(`${name}.*1$`))

  await views(page)
    .getByRole('button', { name: `Delete "${name}"` })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete list' })
    .click()

  // The task is still there, and no longer claims a list.
  await expect(row).toBeVisible()
  await expect(row).not.toContainText(name)
  await page.reload()
  await expect(
    page.getByRole('listitem').filter({ hasText: title }),
  ).toBeVisible()
})

test('#newlist in the composer creates the list it names', async ({ page }) => {
  const name = uniqueName()
  const title = uniqueTitle('makes a list')
  await gotoHydrated(page)

  await page.getByLabel('Task title').fill(`${title} #${name}`)
  // The reading says it will be made, before Enter.
  await expect(page.getByTestId('composer-reading')).toContainText(
    `New list · ${name}`,
  )
  /* The first task waits for its acknowledgement before the second starts.
     Both writes invalidate the task list when they settle, and a refetch
     landing between the second task's optimistic write and its own settle
     puts the pre-second list back on screen. */
  const firstSaved = waitForServerAck(page, title)
  await page.keyboard.press('Enter')

  await expect(listLink(page, name)).toBeVisible()
  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toContainText(name)
  await firstSaved

  // Typing it a second time reuses the list rather than making another.
  const second = uniqueTitle('joins it')
  await page.getByLabel('Task title').fill(`${second} #${name}`)
  await expect(page.getByTestId('composer-reading')).toContainText(
    `List · ${name}`,
  )
  const secondSaved = waitForServerAck(page, second)
  await page.keyboard.press('Enter')
  await secondSaved
  await expect(listLink(page, name)).toHaveText(new RegExp(`${name}.*2$`))
})

test('a duplicate name is refused, and says which list already has it', async ({
  page,
}) => {
  const name = uniqueName()
  await signIn(page)
  await gotoHydrated(page)

  // The first has to exist before the second can clash with it.
  await views(page).getByRole('button', { name: 'New list' }).click()
  const created = waitForServerAck(page, name)
  await page.getByLabel('New list name').fill(name)
  await page.keyboard.press('Enter')
  await created
  await expect(listLink(page, name)).toBeVisible()

  // The same name in different case: the server decides, not the form.
  await views(page).getByRole('button', { name: 'New list' }).click()
  await page.getByLabel('New list name').fill(name.toUpperCase())
  await page.keyboard.press('Enter')

  await expect(page.getByRole('alert')).toContainText(`“${name}”`)
  await expect(page.getByRole('alert')).toContainText('Nothing was added')
  // Nothing was added, so there is one link -- and it kept its first spelling.
  await expect(listLink(page, name)).toHaveCount(1)
})

test('the new list is offered everywhere a list is', async ({ page }) => {
  const name = uniqueName()
  const title = uniqueTitle('everywhere')
  await gotoHydrated(page)
  const row = await createTask(page, title)

  await views(page).getByRole('button', { name: 'New list' }).click()
  await page.getByLabel('New list name').fill(name)
  await page.keyboard.press('Enter')
  await expect(listLink(page, name)).toBeVisible()

  // The filter panel.
  await expect(
    page.getByRole('group', { name: 'List' }).getByRole('button', { name }),
  ).toBeVisible()

  // The detail panel's select.
  await row.getByRole('button', { name: `Open "${title}"` }).click()
  const panel = page.getByRole('complementary', { name: 'Task details' })
  await panel.getByLabel('List').selectOption({ label: name })
  await expect(row).toContainText(name)
  await page.keyboard.press('Escape')

  // The palette's # scope.
  await page.keyboard.press('Control+k')
  const box = page.getByRole('combobox', { name: 'Type a command or search' })
  await box.fill(`# ${name}`)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/list=[0-9a-f]{24}/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
  await expect(
    page.getByRole('listitem').filter({ hasText: title }),
  ).toBeVisible()
})

test('one owner never sees another’s lists', async ({ browser }) => {
  const ada = await browser.newPage()
  const grace = await browser.newPage()
  const name = uniqueName()

  await signIn(ada)
  await gotoHydrated(ada)
  await views(ada).getByRole('button', { name: 'New list' }).click()
  await ada.getByLabel('New list name').fill(name)
  await ada.keyboard.press('Enter')
  await expect(listLink(ada, name)).toBeVisible()

  await signIn(grace, {
    email: 'grace@example.com',
    password: 'seed-password-grace',
  })
  await gotoHydrated(grace)
  await expect(listLink(grace, name)).toHaveCount(0)

  // And Grace may have a list of the same name: uniqueness is per owner.
  await views(grace).getByRole('button', { name: 'New list' }).click()
  await grace.getByLabel('New list name').fill(name)
  await grace.keyboard.press('Enter')
  await expect(listLink(grace, name)).toBeVisible()
  await expect(grace.getByRole('alert')).toHaveCount(0)

  await ada.close()
  await grace.close()
})
