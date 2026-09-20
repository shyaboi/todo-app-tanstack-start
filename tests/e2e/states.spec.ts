import { test, expect } from '@playwright/test'
import type { Route } from '@playwright/test'
import { ADA, createTask, gotoHydrated, uniqueTitle } from './helpers'

/* The states the design draws for when things go wrong, and for when they
   are merely slow (PLAN.md 7.1). Failures are manufactured at the network
   boundary: the server is never touched, so the message that arrives is the
   one the app writes for a request that never got there. */

const serverFn = '**/_serverFn/**'
const isPost = (route: Route) => route.request().method() === 'POST'
const isGet = (route: Route) => route.request().method() === 'GET'

test('a failed write is rolled back and reported, and Retry re-runs it', async ({
  page,
}) => {
  const title = uniqueTitle('will fail')
  await gotoHydrated(page)
  // A row to make the list non-empty, so the rollback has something to be
  // visibly different from.
  await createTask(page, uniqueTitle('already here'))

  await page.route(serverFn, (route) =>
    isPost(route) ? route.abort('failed') : route.continue(),
  )
  await page.getByLabel('Task title').fill(title)
  await page.keyboard.press('Enter')

  // Optimistic, then gone: the write failed and the cache went back.
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Could not reach the server')
  await expect(alert).toContainText('Nothing was saved')
  await expect(
    page.getByRole('listitem').filter({ hasText: title }),
  ).toHaveCount(0)

  await page.unroute(serverFn)
  await alert.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toBeVisible()
  // Not just back on screen: the retry reached the server.
  await row.getByRole('checkbox').and(page.locator(':enabled')).waitFor()
  await page.reload()
  await expect(
    page.getByRole('listitem').filter({ hasText: title }),
  ).toBeVisible()
})

test('a failed status change rolls the row back and says so', async ({
  page,
}) => {
  const title = uniqueTitle('status fails')
  await gotoHydrated(page)
  const row = await createTask(page, title)

  await page.route(serverFn, (route) =>
    isPost(route) ? route.abort('failed') : route.continue(),
  )
  /* click(), not check(): check() asserts the box is still checked after the
     click, and the rollback un-checks it within the same instant -- which is
     the whole point. */
  await row.getByRole('checkbox').click()
  await expect(page.getByRole('alert')).toContainText('Nothing was saved')
  await expect(row.getByRole('checkbox')).not.toBeChecked()
  await page.unroute(serverFn)
})

test('a route that cannot load says why and offers to try again', async ({
  page,
}) => {
  /* Signing in navigates client-side to /, whose loader fetches the list.
     With every GET to the server refused, that navigation fails in the
     loader and the route's error view takes the page. */
  await gotoHydrated(page, '/sign-in')
  await page.route(serverFn, (route) =>
    isGet(route) ? route.abort('failed') : route.continue(),
  )
  await page.getByLabel('Email').fill(ADA.email)
  await page.getByLabel('Password').fill(ADA.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(
    page.getByRole('heading', { name: 'This page could not load' }),
  ).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(
    'Could not reach the server',
  )
  await expect(page.getByText(/Something went wrong/)).toHaveCount(0)

  await page.unroute(serverFn)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox')
  await expect(page.getByRole('listitem').first()).toBeVisible()
})

test('a slow load shows the skeleton; a fast one goes straight to content', async ({
  page,
}) => {
  await gotoHydrated(page, '/sign-in')
  await page.route(serverFn, async (route) => {
    if (isGet(route)) await new Promise((r) => setTimeout(r, 900))
    await route.continue()
  })
  await page.getByLabel('Email').fill(ADA.email)
  await page.getByLabel('Password').fill(ADA.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  const skeleton = page.getByRole('status', { name: 'Loading your tasks' })
  await expect(skeleton).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox')
  await expect(skeleton).toHaveCount(0)
  await page.unroute(serverFn)
})

test('a background refetch that fails never empties the list', async ({
  page,
}) => {
  const title = uniqueTitle('refetch survives')
  await gotoHydrated(page)
  const row = await createTask(page, title)
  await createTask(page, uniqueTitle('another'))
  const rows = page.getByRole('listitem')
  const before = await rows.count()

  /* Every write ends by refetching the list. Let the write through and refuse
     the refetch: the list must keep what it has, and neither the skeleton nor
     the error page may appear -- stale data beats no data. */
  await page.route(serverFn, (route) =>
    isGet(route) ? route.abort('failed') : route.continue(),
  )
  await row.getByRole('checkbox').check()
  await expect(row.getByRole('checkbox')).toBeChecked()
  await page.waitForTimeout(600)
  await expect(rows).toHaveCount(before)
  await expect(
    page.getByRole('status', { name: 'Loading your tasks' }),
  ).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox')
  await page.unroute(serverFn)
})
