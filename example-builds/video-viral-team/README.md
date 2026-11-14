# Why starting early beats saving more — code-rendered explainer

A 36-second motion-graphics explainer (1920x1080, 30 fps, H.264/yuv420p MP4, no audio), drawn entirely in
HTML/SVG and captured frame by frame with Playwright Chromium, then encoded with ffmpeg.

## Render (one command)

```bash
npm install && npm run render
```

Output: `out/explainer.mp4` (1080 frames = 36.0 s). Takes about 5 minutes on 8 cores.
Needs Node 18+ and `ffmpeg` on PATH. `playwright` is pinned to 1.65.0 so it uses the Chromium already
installed on this machine (`/opt/ms-playwright`, picked up automatically if `PLAYWRIGHT_BROWSERS_PATH` is unset).
On another machine run `npx playwright install chromium` once first.

Options: `WORKERS=4 npm run render` sets the number of parallel pages; `KEEP_FRAMES=1` keeps the PNGs in `out/frames/`.

## Preview

Open `src/index.html` in Chromium (after `npm install`, which provides the fonts):

- no query string: plays in real time, looping
- `src/index.html?t=12.3`: frozen at 12.3 s
- `npm run snap -- 0 12.3 35.9`: writes stills to `out/snaps/`

## How it works

- `src/app.js` builds the scene once, then `window.renderFrame(t)` sets every element's state as a pure
  function of `t` (seconds). No CSS animations or transitions, no clock-driven state, so any frame can be rendered in isolation.
- All figures come from one formula (deposits at the end of each month, 7%/12 monthly compounding):
  `balance(P, n) = P * ((1 + r)^n - 1) / r`. Ana: $200 x 480 months = $524,963. Ben: $400 x 300 months = $324,029.
- Fonts: Sora (headings, numbers with tabular figures) and Manrope (body), loaded from `@fontsource` packages in `node_modules`.
  The page makes no network requests.
- `render.mjs` captures the frames with several pages in parallel, then encodes with
  `libx264 -crf 16 -pix_fmt yuv420p -r 30 -movflags +faststart` (BT.709 tags).

## Timeline

Scenes overlap: each one starts arriving while the previous one is still leaving with a push to the left.
Outgoing headings and titles leave whole (slide + fade, never sliced by a mask).
All timings are in `T` near the top of `src/app.js`.

| Time | Scene |
| --- | --- |
| 0–4.45 s | Title card complete on frame 0 (title + subtitle), rule and growth curve animate on, slow push-in; title block slides left + fades 4.05–4.45 s, curve sinks until 4.7 s |
| 4.1–12.65 s | Meet Ana and Ben: heading from 4.1 s, Ana card 4.4 s (content by 4.8 s), Ben card 5.6 s, timeline skeleton from 6.25 s, shared facts at 7.0 s, spans 7.9–9.65 s, playhead sweep 9.9–11.7 s; exit 11.9–12.65 s |
| 12.15–13.2 s | Avatars fly from the cards into the chart legend |
| 12.1–24.95 s | The race: chart pushes in from 12.1 s, lines draw 13.2–20.4 s, "Ben never catches up" and the gap bracket from 20.4 s, "$201k gap" label from 21.4 s, slow push-in; exit 24.25–24.95 s |
| 24.3–25.2 s | Avatars fly from the legend to the bar chart |
| 24.05–31.85 s | The result at 65: heading 24.95 s, paid-in bars from 24.3 s, growth 24.8–26.65 s, gap callout 27.0–28.0 s, badge 27.95 s, paid-in glow 28.4–29.4 s, then "$201,000 more" breathes; whole scene incl. heading and avatars exits 31.45–31.85 s |
| 31.3–36 s | Takeaway: curve from 31.3 s, words from 31.6 s, "Start early." from 32.85 s, push-in and curve drawing to the last frame |

## QA helper

`node tools/fgcheck.mjs` renders every frame with the background layers hidden and reports the longest stretch where
fewer than 0.2% of pixels change (foreground stillness).
