import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('component inventory', () => {
  test('renders every control group, server-side', async ({ page }) => {
    await page.goto('/dev/components')
    await expect(
      page.getByRole('heading', { name: 'Components' }),
    ).toBeVisible()
    for (const s of [
      'Buttons',
      'Fields',
      'Pills & chips',
      'Keys',
      'Skeleton',
    ]) {
      await expect(page.getByRole('heading', { name: s })).toBeVisible()
    }
  })

  test('status is never colour alone', async ({ page }) => {
    await page.goto('/dev/components')
    for (const label of ['To do', 'In progress', 'Done']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible()
    }
  })

  test('resolves modifier glyphs for the running platform', async ({
    page,
  }) => {
    await page.goto('/dev/components')
    // CI and local dev both run Linux/Windows, where the design says ⌘ reads
    // as Ctrl. This is the assertion that would catch a hard-coded glyph.
    // Spelled out and split into keycaps: a <kbd>Ctrl</kbd>, a plus, a <kbd>K</kbd>.
    const keys = page.getByRole('heading', { name: 'Keys' }).locator('..')
    await expect(
      keys.locator('kbd', { hasText: /^Ctrl$/ }).first(),
    ).toBeVisible()
    await expect(keys.locator('kbd', { hasText: /^K$/ }).first()).toBeVisible()
  })

  // The real contrast check: axe cannot evaluate colour under jsdom, so the
  // §4.6 ratios are only ever verified here, against a real rendered page.
  test('has no accessibility violations, contrast included', async ({
    page,
  }) => {
    await page.goto('/dev/components')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})
