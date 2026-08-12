import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('unknown routes show an accessible 404 page with a home link', async ({ page }) => {
  await page.goto('/definitely-missing');

  await expect(page).toHaveURL(/\/definitely-missing$/);
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');

  const accessibility = await new AxeBuilder({ page })
    .include('#main-content')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
