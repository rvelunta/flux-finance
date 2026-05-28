// Mobile screenshot pass for manual layout review.
//
//   1. Start the dev server:   npm run dev
//   2. In another terminal:    npm run shots
//   3. Open ./mobile-shots/ and eyeball the PNGs for overflow / clipping.
//
// Add a new state by appending a step to STEPS below. Each step gets a
// screenshot per device. Selectors use Playwright locators — see
// https://playwright.dev/docs/locators
//
// Note: this only validates *layout*. Real-device-only concerns (iOS keyboard
// pushing the input off-screen, safe-area insets, touch feel) still need a
// physical phone — run `npm run dev:lan` and open the LAN URL on your device.

import { chromium, devices } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.env.FLUX_URL || 'http://localhost:3000/';
const OUT = new URL('../mobile-shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// Devices to capture. Mix of Playwright presets and a tight custom width.
const TARGETS = [
  { tag: 'iphone', ...devices['iPhone 13'] },
  { tag: 'small', viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];

const settle = (page, ms = 350) => page.waitForTimeout(ms);

// Close any open modal by clicking the backdrop corner (modals close on
// backdrop click; their Escape handler only fires when a child is focused).
async function closeOverlay(page) {
  await page.mouse.click(5, 5);
  await page.locator('.modal-overlay').waitFor({ state: 'detached' }).catch(() => {});
  await settle(page, 250);
}

// Each step: [name, async fn that leaves the desired state on screen].
// The runner screenshots after each step, then the step should clean up
// (close modals/menus) so the next starts from the toolbar.
const STEPS = [
  ['01-home', async () => {}],
  ['02-scenario-menu', async (p) => { await p.locator('.scenario-menu-trigger').click(); await settle(p); }],
  ['__close-2', async (p) => { await p.keyboard.press('Escape'); await settle(p); }, true],
  ['03-account-menu', async (p) => { await p.locator('.account-trigger').click(); await settle(p); }],
  ['__close-3', async (p) => { await p.keyboard.press('Escape'); await settle(p); }, true],
  ['04-ai-edit', async (p) => { await p.locator('.ai-btn').click(); await settle(p, 500); }],
  ['__close-4', async (p) => closeOverlay(p), true],
  ['05-wizard-pick', async (p) => {
    await p.locator('.scenario-menu-trigger').click(); await settle(p);
    await p.getByText('New from template').click(); await settle(p, 400);
  }],
  ['06-wizard-fill', async (p) => { await p.getByText('W-2 employee, homeowner').click(); await settle(p, 400); }],
  ['07-wizard-preview', async (p) => { await p.getByRole('button', { name: 'Preview →' }).click(); await settle(p, 400); }],
  ['__close-7', async (p) => closeOverlay(p), true],
  ['08-accounts', async (p) => {
    const tab = p.locator('.tab-menu-trigger');
    if (await tab.isVisible()) {
      await tab.click(); await settle(p);
      await p.locator('.tab-menu-list').getByText('Accounts', { exact: true }).click(); await settle(p, 400);
    }
  }],
  ['09-flows', async (p) => {
    const tab = p.locator('.tab-menu-trigger');
    if (await tab.isVisible()) {
      await tab.click(); await settle(p);
      await p.locator('.tab-menu-list').getByText('Flows', { exact: true }).click(); await settle(p, 400);
    }
  }],
];

const browser = await chromium.launch();
for (const target of TARGETS) {
  const { tag, ...deviceOpts } = target;
  const ctx = await browser.newContext(deviceOpts);
  const page = await ctx.newPage();
  console.log(`\n=== ${tag} ===`);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await settle(page, 600);

  for (const [name, fn, hidden] of STEPS) {
    await fn(page);
    if (!hidden) {
      await page.screenshot({ path: `${OUT}${tag}-${name}.png` });
      console.log(`  ✓ ${tag}-${name}`);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(`\nScreenshots in ${OUT}`);
