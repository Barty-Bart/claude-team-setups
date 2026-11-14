// Renders src/index.html frame by frame with Playwright Chromium and encodes out/explainer.mp4 with ffmpeg.
// Usage: npm run render            (all 1080 frames, parallel pages)
//        WORKERS=4 npm run render  (override parallelism)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, launch, openStage, shoot } from './tools/browser.mjs';

const FPS = 30;
const FRAMES = 36 * FPS; // 1080 frames = 36.0 s
const OUT_DIR = path.join(ROOT, 'out');
const FRAME_DIR = path.join(OUT_DIR, 'frames');
const OUT_FILE = path.join(OUT_DIR, 'explainer.mp4');
const WORKERS = Math.max(1, Number(process.env.WORKERS) || Math.min(6, os.cpus().length - 1 || 1));

const ff = spawnSync('ffmpeg', ['-version']);
if (ff.status !== 0) { console.error('ffmpeg not found on PATH'); process.exit(1); }

fs.rmSync(FRAME_DIR, { recursive: true, force: true });
fs.mkdirSync(FRAME_DIR, { recursive: true });

const t0 = Date.now();
const browser = await launch();
let next = 0, done = 0;
async function worker() {
  const page = await openStage(browser);
  for (;;) {
    const f = next++;
    if (f >= FRAMES) break;
    await shoot(page, f, path.join(FRAME_DIR, `f${String(f).padStart(5, '0')}.png`));
    done++;
    if (done % 60 === 0 || done === FRAMES) {
      process.stdout.write(`\r  captured ${done}/${FRAMES} frames (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  }
  await page.context().close();
}
console.log(`Capturing ${FRAMES} frames at 1920x1080 with ${WORKERS} parallel pages...`);
await Promise.all(Array.from({ length: WORKERS }, worker));
await browser.close();
process.stdout.write('\n');
if (process.exitCode) { console.error('Page errors occurred; aborting before encode.'); process.exit(1); }

console.log('Encoding with ffmpeg (H.264, yuv420p, 30 fps)...');
const args = [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', path.join(FRAME_DIR, 'f%05d.png'),
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
  '-r', String(FPS), '-frames:v', String(FRAMES), '-an', '-movflags', '+faststart',
  OUT_FILE,
];
const enc = spawnSync('ffmpeg', args, { stdio: 'inherit' });
if (enc.status !== 0) { console.error('ffmpeg failed'); process.exit(1); }
if (!process.env.KEEP_FRAMES) fs.rmSync(FRAME_DIR, { recursive: true, force: true });
console.log(`Done: ${path.relative(process.cwd(), OUT_FILE)} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
