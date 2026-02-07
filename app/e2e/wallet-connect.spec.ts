import { test, expect } from '@playwright/test';

test.describe('Mock Wallet Auto-Connect', () => {
  test('should auto-connect mock wallet and show agents', async ({ page }) => {
    // Collect console logs
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Go to dashboard
    await page.goto('/');

    // Check if TEST MODE banner is visible
    const testModeBanner = page.locator('text=TEST MODE - Mock Wallet Active');
    await expect(testModeBanner).toBeVisible({ timeout: 5000 });
    console.log('TEST MODE banner visible: true');

    // Wait for wallet auto-connect and UI update
    await page.waitForTimeout(5000);

    // Screenshot after waiting
    await page.screenshot({ path: 'e2e-screenshots/wallet-test-1.png', fullPage: true });

    // Check if "Connect Your Wallet" prompt is gone OR loading/agents shown
    const connectPrompt = page.getByText('Connect Your Wallet');
    const loadingIndicator = page.getByText('Loading agents from Solana');
    const noAgentsText = page.getByText('No Agents Registered');

    const promptVisible = await connectPrompt.isVisible().catch(() => false);
    const loadingVisible = await loadingIndicator.isVisible().catch(() => false);
    const noAgentsVisible = await noAgentsText.isVisible().catch(() => false);

    console.log('Connect prompt visible:', promptVisible);
    console.log('Loading indicator visible:', loadingVisible);
    console.log('No agents message visible:', noAgentsVisible);

    // Take final screenshot
    await page.screenshot({ path: 'e2e-screenshots/wallet-test-final.png', fullPage: true });

    // Print console logs
    console.log('\n=== Console Logs ===');
    consoleLogs.forEach(log => console.log(log));
    console.log('===================\n');

    // Verify auto-connect was successful
    const connectSuccessLog = consoleLogs.find(log => log.includes('Connected successfully'));
    expect(connectSuccessLog).toBeDefined();
    console.log('Wallet connected: true');

    // Either wallet connected (no connect prompt) OR still loading
    // The wallet should have connected based on logs
  });

  test('should display agent leaderboard when connected', async ({ page }) => {
    await page.goto('/');

    // Wait for wallet to connect and agents to load
    await page.waitForTimeout(5000);

    // Check for leaderboard
    await expect(page.getByText('Agent Leaderboard')).toBeVisible();

    // Look for either agents or the connect prompt
    const hasAgents = await page.locator('text=/reputation|verified|TestAgent/i').count();
    const hasConnectPrompt = await page.getByText('Connect Your Wallet').isVisible().catch(() => false);

    console.log('Has agents displayed:', hasAgents > 0);
    console.log('Shows connect prompt:', hasConnectPrompt);

    // Take screenshot
    await page.screenshot({ path: 'e2e-screenshots/leaderboard-state.png', fullPage: true });
  });
});
