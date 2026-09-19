import { test, expect } from '@playwright/test'

test('app boots and server-renders its shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Tasker' })).toBeVisible()
})
