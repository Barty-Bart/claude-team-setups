// Renders src/index.html frame by frame with Playwright (Chromium) and encodes with ffmpeg.
// Usage: node render.mjs                 -> out/explainer.mp4
//        node render.mjs --stills 0,5.5   -> out/stills/t_<sec>.png (preview frames)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Playwright may be installed locally or globally (resolved via NODE_PATH), so load it with require().
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, 'out');
mkdirSync(outDir, { recursive: true });
const args = process.argv.slice(2);
const stillsIdx = args.indexOf('--stills');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { console.error('page error:', e); process.exitCode = 1; });
await page.goto(pathToFileURL(path.join(root, 'src', 'index.html')).href);
await page.evaluate(() => window.fontsReady);
const { FPS, frames } = await page.evaluate(() => window.VIDEO);

async function grab(t) {
  const dataUrl = await page.evaluate((tt) => { window.renderFrame(tt); return document.getElementById('c').toDataURL('image/png'); }, t);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

if (stillsIdx >= 0) {
  const dir = path.join(outDir, 'stills');
  mkdirSync(dir, { recursive: true });
  for (const s of args[stillsIdx + 1].split(',')) {
    const t = Number(s);
    writeFileSync(path.join(dir, `t_${t.toFixed(2).padStart(5, "0")}.png`), await grab(t));
  }
  console.log('stills written to', dir);
} else {
  const out = path.join(outDir, 'explainer.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  for (let f = 0; f < frames; f++) {
    const png = await grab(f / FPS);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 60 === 0) process.stdout.write(`frame ${f}/${frames}\r`);
  }
  ff.stdin.end();
  await done;
  console.log(`\nwrote ${out}`);
}
await browser.close();
