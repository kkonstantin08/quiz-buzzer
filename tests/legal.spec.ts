import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quiz_cookie_notice_acknowledgement', JSON.stringify({
    noticeVersion: '1.0',
    decidedAt: '2026-07-23T00:00:00.000Z',
    categories: { necessary: true, analytics: false },
  })));
});

test.describe('Published legal pages', () => {
  test('renders every final route without draft markers', async ({ page }) => {
    const pages = [
      ['/offer', 'ПУБЛИЧНАЯ ОФЕРТА'],
      ['/terms', 'ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ'],
      ['/privacy', 'ПОЛИТИКА В ОТНОШЕНИИ ОБРАБОТКИ ПЕРСОНАЛЬНЫХ ДАННЫХ'],
      ['/cookies', 'ПОЛИТИКА ИСПОЛЬЗОВАНИЯ COOKIE И ЛОКАЛЬНОГО ХРАНИЛИЩА'],
      ['/subscription', 'УСЛОВИЯ ПРЕДОСТАВЛЕНИЯ ДОСТУПА'],
      ['/refunds', 'ПОЛИТИКА ВОЗВРАТОВ'],
      ['/consent', 'СОГЛАСИЕ НА ОБРАБОТКУ ПЕРСОНАЛЬНЫХ ДАННЫХ'],
      ['/legal/details', 'РЕКВИЗИТЫ И КОНТАКТНАЯ ИНФОРМАЦИЯ'],
      ['/tariff', 'Проводите квизы без физических кнопок'],
    ] as const;

    for (const [url, heading] of pages) {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('body')).not.toContainText('TODO_LEGAL');
      await expect(page.locator('body')).not.toContainText('Документ находится в подготовке');
    }
  });

  test('footer links point to the published documents', async ({ page }) => {
    await page.goto('/');
    for (const [name, href] of [
      ['Публичная оферта', '/offer'],
      ['Пользовательское соглашение', '/terms'],
      ['Политика конфиденциальности', '/privacy'],
      ['Условия доступа', '/subscription'],
      ['Согласие на обработку персональных данных', '/consent'],
      ['Реквизиты', '/legal/details'],
      ['Политика Cookie', '/cookies'],
      ['Возврат средств', '/refunds'],
    ] as const) {
      await expect(page.getByRole('link', { name }).last()).toHaveAttribute('href', href);
    }
  });

  test('registration requires each separate consent and exposes its documents', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Email').fill('legal-playwright@example.test');
    await page.getByRole('textbox', { name: 'Пароль', exact: true }).fill('password123');
    await page.getByRole('textbox', { name: 'Повторите пароль' }).fill('password123');

    const checkboxes = page.getByRole('checkbox');
    await expect(checkboxes).toHaveCount(2);
    await expect(checkboxes.nth(0)).not.toBeChecked();
    await expect(checkboxes.nth(1)).not.toBeChecked();
    await expect(checkboxes.nth(0)).toHaveClass(/h-4/);
    await expect(checkboxes.nth(1)).toHaveClass(/h-4/);

    await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
    await expect(page.getByRole('alert')).toContainText('Необходимо принять Пользовательское соглашение');
    await checkboxes.nth(0).check();
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
    await expect(page.getByRole('alert')).toContainText('Необходимо дать согласие на обработку персональных данных');

    const form = page.locator('#main-content');
    await expect(form.getByRole('link', { name: 'Пользовательское соглашение' })).toHaveAttribute('href', '/terms');
    await expect(form.getByRole('link', { name: 'Согласия' })).toHaveAttribute('href', '/consent');
    await expect(form.getByRole('link', { name: 'Политики обработки персональных данных' })).toHaveAttribute('href', '/privacy');
  });

  test('skip link focuses the legal page main content', async ({ page }) => {
    await page.goto('/terms');
    await page.locator('#main-content').waitFor({ state: 'visible' });
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Перейти к основному содержимому' });
    await expect(skipLink).toBeFocused();
    await skipLink.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });
});
