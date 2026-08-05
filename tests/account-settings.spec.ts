import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const password = 'password123';
const cookieDecision = {
  noticeVersion: '1.0',
  decidedAt: '2026-08-05T00:00:00.000Z',
  categories: { necessary: true, analytics: false },
};

async function acknowledgeCookieNotice(target: Page | BrowserContext) {
  await target.addInitScript((decision) => {
    localStorage.setItem('quiz_cookie_notice_acknowledgement', JSON.stringify(decision));
  }, cookieDecision);
}

async function register(page: Page, email: string) {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByLabel('Повторите пароль').fill(password);
  for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const activateTrial = page.getByRole('button', { name: 'Активировать бесплатно на 30 дней' });
  await activateTrial.click();
  await expect(activateTrial).toBeHidden();
}

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.beforeEach(async ({ page }) => {
  await acknowledgeCookieNotice(page);
  await expect.poll(async () => {
    try {
      return (await page.request.get('http://localhost:3001/api/health')).status();
    } catch {
      return 0;
    }
  }, { timeout: 10_000 }).toBe(200);
});

test('real session management and account deletion stay usable on mobile and with a keyboard', async ({ page, browser }, testInfo) => {
  const email = `account-settings-${Date.now()}-${testInfo.workerIndex}@example.test`;
  await page.setViewportSize({ width: 375, height: 812 });
  await register(page, email);

  const otherContext = await browser.newContext({
    baseURL: 'http://localhost:5173',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  await acknowledgeCookieNotice(otherContext);
  const otherPage = await otherContext.newPage();
  await login(otherPage, email);
  await otherContext.close();

  await page.goto('/settings');
  const sessions = page.locator('#account-sessions');
  await expect(sessions.getByRole('heading', { name: 'Активные сессии' })).toBeVisible();
  await expect(sessions.getByText('Текущая сессия')).toBeVisible();
  await expect(sessions.getByText('iPhone · Safari')).toBeVisible();
  await expect(sessions.getByText(/^IP: /)).toHaveCount(2);
  await expect(sessions.getByText(/^Вход: /)).toHaveCount(2);
  await expect(sessions.getByText(/^Последняя активность: /)).toHaveCount(2);

  await sessions.getByRole('button', { name: 'Завершить сессию iPhone, Safari' }).click();
  await expect(sessions.getByText('iPhone · Safari')).toBeHidden();
  await expect(sessions.getByText('Текущая сессия')).toBeVisible();

  const logoutAll = sessions.getByRole('button', { name: 'Выйти на всех устройствах' });
  await logoutAll.scrollIntoViewIfNeeded();
  const bounds = await logoutAll.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  const deleteAccount = page.getByRole('button', { name: 'Удалить аккаунт', exact: true });
  await deleteAccount.focus();
  await expect(deleteAccount).toBeFocused();
  await page.keyboard.press('Space');
  const deleteDialog = page.getByRole('dialog', { name: 'Удалить аккаунт навсегда?' });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByLabel('Текущий пароль').fill(password);
  await deleteDialog.getByLabel('Фраза подтверждения').fill('УДАЛИТЬ АККАУНТ');
  await deleteDialog.getByRole('checkbox', { name: 'Я понимаю, что аккаунт и данные нельзя восстановить' }).check();
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
  });

  const accessibility = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await deleteDialog.getByRole('button', { name: 'Удалить аккаунт навсегда' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login$/);
});

test('logout-all uses the real API, clears authentication, and redirects to login', async ({ page }, testInfo) => {
  const email = `logout-all-${Date.now()}-${testInfo.workerIndex}@example.test`;
  await register(page, email);
  await page.goto('/settings');

  const logoutAll = page.getByRole('button', { name: 'Выйти на всех устройствах' });
  await logoutAll.focus();
  await expect(logoutAll).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Выйти на всех устройствах?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Подтвердить выход' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login$/);
});
