import { test, expect } from '@playwright/test'
import {
  ADA,
  GRACE,
  createTask,
  gotoHydrated,
  signIn,
  uniqueTitle,
} from './helpers'

test.describe('guest use', () => {
  test('an anonymous visitor can add tasks without an account', async ({
    page,
  }) => {
    await gotoHydrated(page)

    // The invitation is stated, not hidden: a guest's tasks live behind one cookie.
    await expect(page.getByText('You are not signed in')).toBeVisible()

    const title = uniqueTitle('guest task')
    await createTask(page, title)
    await page.reload()
    await expect(page.getByText(title, { exact: true })).toBeVisible()
  })

  test('signing up keeps the tasks made before the account existed', async ({
    page,
  }) => {
    await gotoHydrated(page)
    const title = uniqueTitle('made as a guest')
    await createTask(page, title)

    const email = `claimed-${Date.now()}@example.com`
    await page.getByRole('link', { name: 'Create account' }).click()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('a-long-enough-password')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByText(email)).toBeVisible()
    // The point of claiming rather than migrating: the task never moved.
    await expect(page.getByText(title, { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByText(title, { exact: true })).toBeVisible()
  })

  test('signing in adopts work done as a guest', async ({ page }) => {
    await gotoHydrated(page)
    const title = uniqueTitle('guest work to adopt')
    await createTask(page, title)

    await signIn(page, GRACE)

    // Grace's own seeded task, plus the one adopted from the guest session.
    await expect(
      page.getByText("Grace's private note about the release"),
    ).toBeVisible()
    await expect(page.getByText(title, { exact: true })).toBeVisible()

    // And it really moved: still there after a round trip to the database.
    await page.reload()
    await expect(page.getByText(title, { exact: true })).toBeVisible()
  })
})

test.describe('accounts are separated', () => {
  test('one account cannot see another’s tasks', async ({ page }) => {
    await signIn(page, ADA)
    await expect(
      page.getByText('Wire optimistic updates into the toggle mutation'),
    ).toBeVisible()
    // Grace's seeded tasks say her name in the title.
    await expect(
      page.getByText("Grace's private note about the release"),
    ).toHaveCount(0)
  })

  test('signing out makes the session useless immediately', async ({
    page,
  }) => {
    await signIn(page, ADA)
    await expect(
      page.getByText('Wire optimistic updates into the toggle mutation'),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()

    // Back to a guest, and Ada's tasks are gone from the page.
    await expect(page.getByText('You are not signed in')).toBeVisible()
    await expect(
      page.getByText('Wire optimistic updates into the toggle mutation'),
    ).toHaveCount(0)

    await page.reload()
    await expect(
      page.getByText('Wire optimistic updates into the toggle mutation'),
    ).toHaveCount(0)
  })
})

test.describe('credentials', () => {
  test('rejects a wrong password without saying which field was wrong', async ({
    page,
  }) => {
    await gotoHydrated(page, '/sign-in')
    await page.getByLabel('Email').fill(ADA.email)
    await page.getByLabel('Password').fill('definitely-not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('do not match an account')
    // Must not reveal that the address exists.
    await expect(alert).not.toContainText('password is')
    await expect(alert).not.toContainText('no account')
  })

  test('gives an unknown address the same message as a wrong password', async ({
    page,
  }) => {
    await gotoHydrated(page, '/sign-in')
    await page.getByLabel('Email').fill(`nobody-${Date.now()}@example.com`)
    await page.getByLabel('Password').fill('definitely-not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('alert')).toContainText(
      'do not match an account',
    )
  })

  test('refuses a short password on sign-up', async ({ page }) => {
    await gotoHydrated(page, '/sign-up')
    await page.getByLabel('Email').fill(`short-${Date.now()}@example.com`)
    await page.getByLabel('Password').fill('tooshort')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('alert')).toContainText(
      'at least 12 characters',
    )
  })

  test('refuses an email that is already taken', async ({ page }) => {
    await gotoHydrated(page, '/sign-up')
    await page.getByLabel('Email').fill(ADA.email)
    await page.getByLabel('Password').fill('a-long-enough-password')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('alert')).toContainText('already exists')
  })

  test('the session cookie is httpOnly, so script cannot read it', async ({
    page,
  }) => {
    await signIn(page, ADA)

    const cookies = await page.context().cookies()
    const session = cookies.find((c) => c.name === 'tasker_session')
    expect(session).toBeDefined()
    expect(session?.httpOnly).toBe(true)
    expect(session?.sameSite).toBe('Lax')

    // The definitive check: JavaScript cannot see it at all.
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      'tasker_session',
    )
  })
})
