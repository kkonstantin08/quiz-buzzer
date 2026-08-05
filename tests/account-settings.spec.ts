import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quiz_cookie_notice_acknowledgement', JSON.stringify({
    noticeVersion: '1.0',
    decidedAt: '2026-08-05T00:00:00.000Z',
    categories: { necessary: true, analytics: false },
  })));

  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      email: 'host@example.test',
      name: 'Ведущий',
      hasActiveSubscription: true,
      subscription: null,
    }),
  }));
  await page.route('**/api/auth/sessions', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      sessions: [
        {
          id: 'current-session',
          device: 'iPhone',
          browser: 'Safari',
          ipAddress: '198.51.100.10',
          createdAt: '2026-08-05T08:00:00.000Z',
          lastSeenAt: '2026-08-05T09:00:00.000Z',
          isCurrent: true,
        },
        {
          id: 'legacy-session',
          device: 'Неизвестное устройство',
          browser: 'Неизвестный браузер',
          ipAddress: null,
          createdAt: '2026-08-04T08:00:00.000Z',
          lastSeenAt: null,
          isCurrent: false,
        },
      ],
    }),
  }));
  await page.route('**/api/settings', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(route.request().method() === 'GET' ? {
      soundEnabled: true,
      soundTheme: 'classic',
      customLogoUrl: null,
      customBgUrl: null,
      bgTheme: 'light',
    } : { success: true }),
  }));
});

test('account security settings stay usable on mobile and with a keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/settings');

  const sessions = page.locator('#account-sessions');
  await expect(sessions.getByRole('heading', { name: 'Активные сессии' })).toBeVisible();
  await expect(sessions.getByText('Текущая сессия')).toBeVisible();
  await expect(sessions.getByText('Неизвестное устройство · Неизвестный браузер')).toBeVisible();
  await expect(sessions.getByText('IP неизвестен')).toBeVisible();

  const logoutAll = sessions.getByRole('button', { name: 'Выйти на всех устройствах' });
  await logoutAll.scrollIntoViewIfNeeded();
  const bounds = await logoutAll.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await logoutAll.focus();
  await expect(logoutAll).toBeFocused();
  await page.keyboard.press('Enter');
  const logoutDialog = page.getByRole('dialog', { name: 'Выйти на всех устройствах?' });
  await expect(logoutDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(logoutDialog).toBeHidden();

  const deleteAccount = page.getByRole('button', { name: 'Удалить аккаунт', exact: true });
  await deleteAccount.focus();
  await expect(deleteAccount).toBeFocused();
  await page.keyboard.press('Space');
  const deleteDialog = page.getByRole('dialog', { name: 'Удалить аккаунт навсегда?' });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByLabel('Текущий пароль')).toBeVisible();
  await expect(deleteDialog.getByRole('checkbox', { name: 'Я понимаю, что аккаунт и данные нельзя восстановить' })).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
