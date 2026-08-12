import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const password = 'password123';
const cookieDecision = {
  noticeVersion: '1.0',
  decidedAt: '2026-08-12T00:00:00.000Z',
  categories: { necessary: true, analytics: false },
};

async function register(page: Page, email: string) {
  await page.addInitScript((decision) => {
    localStorage.setItem('quiz_cookie_notice_acknowledgement', JSON.stringify(decision));
  }, cookieDecision);
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

test.beforeEach(async ({ page }) => {
  await expect.poll(async () => {
    try {
      return (await page.request.get('http://localhost:3001/api/health')).status();
    } catch {
      return 0;
    }
  }, { timeout: 10_000 }).toBe(200);
});

test('history is protected and works through desktop and mobile navigation, retry, empty and clear states', async ({ page, browser }, testInfo) => {
  await page.goto('/history');
  await expect(page).toHaveURL(/\/login$/);

  await page.setViewportSize({ width: 375, height: 812 });
  await register(page, `history-${Date.now()}-${testInfo.workerIndex}@example.test`);

  const failHistory = (route: Route) => route.fulfill({ status: 500, json: { error: 'Временная ошибка истории' } });
  await page.route('**/api/history?*', failHistory);
  await page.getByRole('button', { name: 'Открыть историю игр' }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('alert')).toContainText('Временная ошибка истории');
  await page.unroute('**/api/history?*', failHistory);
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByRole('heading', { name: 'История пока пуста' })).toBeVisible();

  await page.getByRole('button', { name: 'Открыть главную' }).click();
  await page.getByRole('button', { name: 'Создать игру' }).click();
  await expect(page).toHaveURL(/\/host\/room\//);
  await page.getByRole('button', { name: 'QR-код' }).click();
  const joinUrl = await page.getByRole('dialog', { name: 'Пригласить игроков' }).getByRole('textbox').inputValue();
  const roomCode = joinUrl.match(/\/room\/([^/]+)$/)?.[1];
  expect(roomCode).toBeTruthy();
  await page.keyboard.press('Escape');

  const participantContext = await browser.newContext();
  await participantContext.addInitScript((decision) => {
    localStorage.setItem('quiz_cookie_notice_acknowledgement', JSON.stringify(decision));
  }, cookieDecision);
  const participantPage = await participantContext.newPage();
  await participantPage.goto(joinUrl);
  await participantPage.getByPlaceholder('Имя или игровой псевдоним').fill('ТестИгрок');
  await participantPage.getByRole('button', { name: 'Войти в игру' }).click();
  await expect(page.getByText('ТестИгрок')).toBeVisible();

  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  const finishDialog = page.getByRole('dialog', { name: 'Завершить игру?' });
  await finishDialog.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Игра завершена' })).toBeVisible();
  await participantContext.close();
  await page.getByRole('button', { name: 'На главную' }).click();
  await page.getByRole('button', { name: 'Открыть историю игр' }).click();

  await expect(page.getByText(roomCode!)).toBeVisible();
  await expect(page.getByText('Без победителя', { exact: true })).toBeVisible();
  await expect(page.getByText('Участников: 1')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  const accessibility = await new AxeBuilder({ page })
    .include('#main-content')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('button', { name: 'Очистить историю' }).click();
  const clearDialog = page.getByRole('dialog', { name: 'Очистить историю?' });
  const clearButton = clearDialog.getByRole('button', { name: 'Удалить всю историю' });
  await clearDialog.getByLabel('Введите ОЧИСТИТЬ').fill('очистить');
  await expect(clearButton).toBeDisabled();
  await clearDialog.getByLabel('Введите ОЧИСТИТЬ').fill('ОЧИСТИТЬ');
  await expect(clearButton).toBeEnabled();
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
  });
  const clearAccessibility = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(clearAccessibility.violations).toEqual([]);
  await clearButton.click();
  await expect(page.getByRole('heading', { name: 'История пока пуста' })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'История игр', exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
});
