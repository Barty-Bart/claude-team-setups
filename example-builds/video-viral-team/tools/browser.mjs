// Shared Playwright setup: launch Chromium and open the stage page in render mode.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// This machine keeps Playwright's browsers in /opt/ms-playwright; use it if no path is configured.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/ms-playwright')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/ms-playwright';
}
const { chromium } = await import('playwright');

export async function launch() {
  return chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
}

export async function openStage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  page.on('request', (r) => {
    if (!r.url().startsWith('file:')) console.error('unexpected network request:', r.url());
  });
  const url = pathToFileURL(path.join(ROOT, 'src', 'index.html')).href + '?render=1';
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    // make sure every face used is actually loaded before any capture
    await Promise.all(['600', '700', '800'].map((w) => document.fonts.load(`${w} 40px Sora`)));
    await Promise.all(['500', '600', '700'].map((w) => document.fonts.load(`${w} 40px Manrope`)));
    await document.fonts.ready;
  });
  const ok = await page.evaluate(() => document.fonts.check('800 40px Sora') && document.fonts.check('600 40px Manrope'));
  if (!ok) throw new Error('Fonts failed to load');
  return page;
}

export async function shoot(page, frame, file) {
  await page.evaluate((f) => window.renderFrameIndex(f), frame);
  await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
}
