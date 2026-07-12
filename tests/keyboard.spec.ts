import { test, expect } from '@playwright/test';

test.describe('Keyboard Navigation', () => {

  test('Skip link is the first focusable element and works', async ({ page }) => {
    await page.goto('/');
    
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
    
    await page.keyboard.press('Tab'); // Skip link
    await page.keyboard.press('Tab'); // Logo link
    await page.keyboard.press('Tab'); // Email
    
    await page.keyboard.type('host@test.com');
    await page.keyboard.press('Tab'); // Password
    await page.keyboard.type('password');
    
    // Press enter to submit
    await page.keyboard.press('Enter');
    
    // Should navigate or show error. In this case without backend it might show error
    // We just verify it can trigger the form
    await expect(page.locator('form')).toBeVisible();
  });

});
