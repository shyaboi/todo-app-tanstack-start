import { test, expect } from '@playwright/test'

test('app boots and server-renders its shell', async ({ page }) => {
  await page.goto('/')
  // Both the frame and the page inside it arrive in the first HTML.
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox')
})
