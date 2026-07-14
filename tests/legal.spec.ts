import { test, expect } from '@playwright/test';

test.describe('Legal Pages', () => {
  test('should display terms page and draft notice', async ({ page }) => {
    // Go to terms page
    await page.goto('/legal/terms');

    // Wait for the page to load
    await expect(page.getByRole('heading', { name: 'Пользовательское соглашение' })).toBeVisible();

    // Since PAYMENTS_ENABLED is false, it should show the draft notice
    await expect(page.getByText('Документы находятся в разработке (черновик)')).toBeVisible();

    // Verify footer is present
    await expect(page.locator('footer').getByText(/Тумакин Алексей Анатольевич/)).toBeVisible();
  });

  test('should link to all legal documents from footer', async ({ page }) => {
    await page.goto('/');

    // Check footer links
    const footerLinks = [
      'Пользовательское соглашение',
      'Публичная оферта',
      'Возврат средств',
      'Политика конфиденциальности',
      'Реквизиты'
    ];

    for (const linkText of footerLinks) {
      const link = page.getByRole('link', { name: linkText });
      await expect(link).toBeVisible();
    }
  });

  test('Host registration should require terms acceptance', async ({ page }) => {
    await page.goto('/login');

    // Click register tab
    await page.getByRole('button', { name: /Нет аккаунта\? Зарегистрируйтесь/i }).click();

    // Fill registration form
    await page.getByPlaceholder('Email').fill('testplaywright@example.com');
    await page.getByPlaceholder('Пароль', { exact: true }).fill('password123');
    await page.getByPlaceholder('Повторите пароль').fill('password123');

    // The checkbox should be visible
    const checkbox = page.getByRole('checkbox', { name: /Я принимаю/i });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    // Cannot submit if not checked (we mock API or just assert on UI validation)
    await page.getByRole('button', { name: /Зарегистрироваться/i }).click();
    
    // There should be an error (either HTML5 validation or our error message)
    // Wait for error text
    await expect(page.getByText('Необходимо принять Пользовательское соглашение')).toBeVisible();

    // Check it
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });
});
