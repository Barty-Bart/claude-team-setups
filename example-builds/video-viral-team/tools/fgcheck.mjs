// QA helper: foreground-only stillness check.
// Renders every frame with the background layers hidden (gradient, glows, dot grid, vignette),
// then measures the share of pixels that change between consecutive frames and reports
// the longest stretch where < 0.2% of pixels change.  Usage: node tools/fgcheck.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, launch, openStage } from './browser.mjs';

const DIR = path.join(ROOT, 'out', 'fg');
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });
const browser = await launch();
let next = 0;
async function worker() {
  const page = await openStage(browser);
  await page.evaluate(() => {
    const s = document.getElementById('stage');
    for (let i = 0; i < 5; i++) s.children[i].style.display = 'none';
    s.style.background = '#000';
  });
  for (;;) {
    const f = next++;
    if (f >= 1080) break;
    await page.evaluate((i) => window.renderFrameIndex(i), f);
    await page.screenshot({ path: path.join(DIR, `f${String(f).padStart(5, '0')}.png`), clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  }
}
await Promise.all(Array.from({ length: 7 }, worker));
await browser.close();

const r = spawnSync('ffmpeg', ['-hide_banner', '-framerate', '30', '-i', path.join(DIR, 'f%05d.png'),
  '-vf', "format=gray,tblend=all_mode=difference,lut=y='if(gt(val,4),255,0)',signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
  '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const vals = [...r.stdout.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]) / 255);
// vals[i] = change between frame i and i+1
let best = { len: 0, start: 0 }, cur = 0;
const runs = [];
vals.forEach((v, i) => {
  if (v < 0.002) { cur++; if (cur > best.len) best = { len: cur, start: i - cur + 1 }; }
  else { if (cur >= 15) runs.push([(i - cur + 1) / 30, cur / 30]); cur = 0; }
});
if (cur >= 15) runs.push([(vals.length - cur) / 30, cur / 30]);
console.log(`frames compared: ${vals.length}`);
console.log(`longest foreground-still stretch: ${(best.len / 30).toFixed(2)} s starting at ${(best.start / 30).toFixed(2)} s`);
console.log('stretches >= 0.5 s:', runs.map(([s, d]) => `${s.toFixed(2)}s+${d.toFixed(2)}s`).join(', ') || 'none');
fs.writeFileSync(path.join(ROOT, 'out', 'fg-changes.txt'), vals.map((v, i) => `${(i / 30).toFixed(3)} ${(v * 100).toFixed(3)}%`).join('\n'));
