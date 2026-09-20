import { test, expect } from '@playwright/test'
import {
  createTask,
  gotoHydrated,
  uniqueTitle,
  waitForServerAck,
} from './helpers'

/* The critical path, with the mouse unplugged (PLAN.md 7.2, §8 step 7):
   create → change status → edit → search → open the panel → delete → undo →
   reload → verify. Not one pointer call in the first test: every step is a
   key, and every assertion is about where focus is and what the page says. */

test('the whole critical path is drivable by keyboard alone', async ({
  page,
}) => {
  const title = uniqueTitle('keys only')
  const renamed = `${title} renamed`
  await gotoHydrated(page)

  // ── Create. N lands in the composer; Enter submits.
  await page.keyboard.press('n')
  await expect(page.getByLabel('Task title')).toBeFocused()
  const saved = waitForServerAck(page, title)
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  const created = page.getByRole('listitem').filter({ hasText: title })
  await expect(created).toBeVisible()
  await saved
  /* From here the row is addressed by its id. The title is about to become
     an input and then a different string, and a locator built on text would
     lose it both times. The id is read once the server has replaced the
     temporary one, which is what the enabled checkbox signals. */
  await expect(created.getByRole('checkbox')).toBeEnabled()
  const id = await created.getAttribute('data-task-row')
  const row = page.locator(`[data-task-row="${id}"]`)

  // ── Out of the text field (Tab lands on Add task), then ↓ selects the
  //    first row -- ours, being the only one.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Add task' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()

  // ── Status. Space walks it forward; 3 sets Done outright; 1 back to To do.
  await page.keyboard.press('Space')
  await expect(row.getByText('In progress')).toBeVisible()
  await page.keyboard.press('3')
  await expect(row.getByRole('checkbox')).toBeChecked()
  await page.keyboard.press('1')
  await expect(row.getByRole('checkbox')).not.toBeChecked()

  // ── Edit in place. E opens the field selected; typing replaces; Enter
  //    saves and puts focus back on the row.
  await page.keyboard.press('e')
  await expect(row.getByRole('textbox')).toBeFocused()
  const renameSaved = waitForServerAck(page, renamed)
  await page.keyboard.type(renamed)
  await page.keyboard.press('Enter')
  await expect(row).toContainText(renamed)
  await expect(row).toBeFocused()
  await renameSaved

  // ── Search. / focuses the box; Escape clears it, then leaves it.
  await page.keyboard.press('/')
  const search = page.getByRole('searchbox', { name: 'Search tasks' })
  await expect(search).toBeFocused()
  await page.keyboard.type('renamed')
  await expect(page).toHaveURL(/q=renamed/)
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/q=/)
  await page.keyboard.press('Escape')
  await expect(search).not.toBeFocused()

  // ── The panel. ↓ selects; ↵ opens; Tab reaches the fields; Escape closes
  //    and returns focus to the row.
  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('complementary', { name: 'Task details' })
  await expect(panel).toBeFocused()
  await page.keyboard.press('Tab') // close button
  await page.keyboard.press('Tab') // title
  await expect(panel.getByLabel('Title')).toBeFocused()
  await page.keyboard.press('Tab') // status
  await expect(panel.getByLabel('Status')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(row).toBeFocused()

  // ── Delete, with the dialog driven by keys: focus lands inside it, Tab
  //    reaches Delete, Enter confirms.
  await page.keyboard.press('Control+Backspace')
  const dialog = page.getByRole('dialog', { name: 'Delete this task?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Delete' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(row).toHaveCount(0)

  // ── Undo. The toast appears once the server has acknowledged the delete
  //    (it carries the undo token), and its button is in the tab order.
  const undo = page.getByRole('button', { name: 'Undo' })
  await expect(undo).toBeVisible()
  await undo.focus()
  await expect(undo).toBeFocused()
  const restored = waitForServerAck(page, renamed)
  await page.keyboard.press('Enter')
  await expect(row).toBeVisible()
  await restored

  // ── And it all persisted.
  await page.reload()
  const again = page.getByRole('listitem').filter({ hasText: renamed })
  await expect(again).toBeVisible()
  await expect(again.getByRole('checkbox')).not.toBeChecked()
})

test('the tab order reads top to bottom, and keyboard focus is always visible', async ({
  page,
}) => {
  await gotoHydrated(page)
  const title = uniqueTitle('tab order')
  await createTask(page, title)
  /* A fresh load, so Tab starts from the top of the document. A blur() would
     not do: browsers keep their sequential-focus starting point at the last
     focused element, and the click left it on Add task. */
  await gotoHydrated(page)
  const row = page.getByRole('listitem').filter({ hasText: title })

  // First stops, in reading order: the brand, then the views.
  await page.keyboard.press('Tab')
  const brand = page.getByRole('link', { name: 'Tasker' })
  await expect(brand).toBeFocused()
  await page.keyboard.press('Tab')
  const inbox = page.getByRole('link', { name: /^Inbox/ })
  await expect(inbox).toBeFocused()

  /* The ring is never removed, only restyled (PLAN.md 4.6). Keyboard focus
     on a link and on a row -- the two most common focus targets -- must
     compute to a real outline. */
  const outlineOf = (el: HTMLElement) => getComputedStyle(el).outlineStyle
  expect(await inbox.evaluate(outlineOf)).not.toBe('none')

  await page.keyboard.press('ArrowDown')
  await expect(row).toBeFocused()
  expect(await row.evaluate(outlineOf)).not.toBe('none')
})
