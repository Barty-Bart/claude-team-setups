# "Why starting early beats saving more" — animated explainer

A 35-second, 1920x1080, 30 fps motion-graphics explainer about compound interest.
Each frame is drawn on an HTML canvas (`src/scene.js`) as a pure function of time, captured
with Playwright (Chromium) and encoded with ffmpeg to H.264 / yuv420p.

## Render

```bash
npm install && node render.mjs
```

Output: `out/explainer.mp4` (about 1.5 minutes to render).

Requirements: Node, ffmpeg on the PATH, and the `playwright` module with Chromium. Playwright is
loaded with `require`, so a global install works if `NODE_PATH` points to the global
`node_modules` (it does on this machine). `npm install` only fetches the Inter font
(`@fontsource/inter`).

Preview single frames (seconds) without encoding: `node render.mjs --stills 3.5,16,29`
→ `out/stills/`.

## Numbers
Calculated in `scene.js`: end-of-month deposits, 7%/12 interest each month.
- Ana: $200/mo, ages 25–65 (480 deposits) → paid in $96,000, ends with $524,963 (≈ $525,000)
- Ben: $400/mo, ages 40–65 (300 deposits) → paid in $120,000, ends with $324,029 (≈ $324,000)
- Ana pays in $24,000 less and ends with about $201,000 more.
