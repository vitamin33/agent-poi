import { test } from '@playwright/test';

test('screenshot: A2A section focused', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4000);

  // Scroll to A2A section
  const a2aHeading = page.getByText('Agent-to-Agent Protocol');
  if (await a2aHeading.count() > 0) {
    await a2aHeading.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
  }

  // Take focused screenshot of the viewport (A2A section visible)
  await page.screenshot({
    path: 'e2e-screenshots/a2a-section-focused.png',
    fullPage: false,
  });

  // Now scroll to interaction feed and expand first interaction
  const feedHeading = page.getByText('Interaction Feed');
  if (await feedHeading.count() > 0) {
    await feedHeading.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  }

  // Expand first interaction
  const interactions = page.locator('[class*="rounded-lg"][class*="border"][class*="cursor-pointer"]');
  const count = await interactions.count();
  if (count > 0) {
    await interactions.first().click();
    await page.waitForTimeout(500);
    // Scroll the expanded content into view
    await interactions.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }

  await page.screenshot({
    path: 'e2e-screenshots/a2a-interaction-detail.png',
    fullPage: false,
  });

  // Expand a second interaction to show variety
  if (count > 1) {
    await interactions.nth(1).click();
    await page.waitForTimeout(500);
    await interactions.nth(1).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }

  await page.screenshot({
    path: 'e2e-screenshots/a2a-interactions-multiple.png',
    fullPage: false,
  });
});
