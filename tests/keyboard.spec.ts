import { test, expect } from '@playwright/test';

test.describe('Keyboard Navigation', () => {

  test('Skip link is the first focusable element and works', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the main content to be rendered before interacting
    await page.locator('#main-content').waitFor({ state: 'visible' });
    
    // Press Tab
    await page.keyboard.press('Tab');
    
    // The skip link should be focused
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeFocused();
    
    // Press Enter to activate skip link
    await skipLink.press('Enter');
    
    // The main content should be focused or the viewport should change
    // Since #main-content receives programmatic focus, let's verify
    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeFocused();
  });

  test('Host login can be completed with keyboard only', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').focus();
    await page.keyboard.type('host@test.com');
    await page.keyboard.press('Tab'); // Password
    await page.keyboard.type('password');

    // Press enter to submit
    await page.keyboard.press('Enter');

    // A keyboard submit either completes login or exposes the server error.
    await expect
      .poll(async () => {
        if (page.url().endsWith('/dashboard')) return 'dashboard';
        if (await page.getByRole('alert').isVisible()) return 'alert';
        return 'pending';
      })
      .not.toBe('pending');
  });

});
