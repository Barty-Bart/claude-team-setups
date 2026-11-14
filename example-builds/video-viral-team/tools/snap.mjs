// Dev helper: node tools/snap.mjs 0 2.5 12.3 ...  -> out/snaps/t<time>.png
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launch, openStage, shoot } from './browser.mjs';
const times = process.argv.slice(2).map(Number);
const dir = path.join(ROOT, 'out', 'snaps');
fs.mkdirSync(dir, { recursive: true });
const browser = await launch();
const page = await openStage(browser);
for (const t of times) {
  const f = Math.min(1079, Math.round(t * 30));
  await shoot(page, f, path.join(dir, `t${t.toFixed(2)}.png`));
}
await browser.close();
console.log('wrote', times.length, 'snaps to', dir);
