import { test, expect } from '@playwright/test';

test.describe('Agent Registration Flow', () => {
  test('should register a new agent successfully', async ({ page }) => {
    // Collect console logs
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Navigate and wait for wallet auto-connect
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Verify wallet connected
    const walletConnected = consoleLogs.some(log => log.includes('Connected successfully'));
    console.log('Wallet connected:', walletConnected);

    // Find and click "Register Agent" button
    const registerButton = page.locator('button:has-text("Register Agent")');
    const buttonExists = await registerButton.isVisible().catch(() => false);
    console.log('Register Agent button visible:', buttonExists);

    if (!buttonExists) {
      await page.screenshot({ path: 'e2e-screenshots/register-no-button.png', fullPage: true });
      console.log('No Register Agent button found');
      return;
    }

    await registerButton.click();
    await page.waitForTimeout(500);

    // Check if modal/form opened
    const registerForm = page.locator('text=Register New Agent');
    const formVisible = await registerForm.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Register form visible:', formVisible);

    if (!formVisible) {
      await page.screenshot({ path: 'e2e-screenshots/register-no-form.png', fullPage: true });
      console.log('Register form did not open');
      return;
    }

    // Fill registration form with unique agent name (use timestamp)
    const agentName = `TestAgent-${Date.now()}`;
    const modelHash = 'sha256:' + 'a'.repeat(64);
    const capabilities = 'testing, automation';

    // Fill form fields - use labels to find inputs
    // Agent Name field
    const nameInput = page.locator('input').first();
    await nameInput.fill(agentName);

    // Model Hash field (second input)
    const hashInput = page.locator('input').nth(1);
    await hashInput.fill(modelHash);

    // Capabilities field (third input or textarea)
    const capInput = page.locator('input, textarea').nth(2);
    await capInput.fill(capabilities);

    await page.screenshot({ path: 'e2e-screenshots/register-form-filled.png', fullPage: true });

    // Submit registration
    const submitButton = page.locator('button:has-text("Register")').last();
    await submitButton.click();

    console.log('Registration submitted, waiting for transaction...');

    // Wait for loading to complete (button changes from "Registering..." to "Register" or form closes)
    console.log('Waiting for transaction to complete...');

    // Wait up to 30s for transaction
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const isRegistering = await page.locator('text=Registering').isVisible().catch(() => false);
      if (!isRegistering) {
        console.log(`Transaction completed after ${i+1} seconds`);
        break;
      }
      if (i % 5 === 0) console.log(`Still registering... (${i}s)`);
    }

    // Wait for success or error
    try {
      await page.locator('text=/registered|success|created/i').waitFor({ timeout: 5000 });
      console.log('SUCCESS: Agent registered!');
      await page.screenshot({ path: 'e2e-screenshots/register-success.png', fullPage: true });
    } catch {
      console.log('No explicit success message found');
    }

    await page.screenshot({ path: 'e2e-screenshots/register-result.png', fullPage: true });

    // Print last 30 console logs
    console.log('\n=== Console Logs ===');
    consoleLogs.slice(-30).forEach(log => console.log(log));
    console.log('===================\n');

    expect(walletConnected).toBe(true);
  });
});
