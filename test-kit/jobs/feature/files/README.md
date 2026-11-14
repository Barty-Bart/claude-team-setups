# Arena Survival

A top-down arena survival game for desktop and mobile browsers. Move around a
walled arena while your gun automatically fires at the nearest enemy. Clear
waves, collect coins and buy upgrades between waves.

Plain HTML, CSS and JavaScript: no build step, no dependencies, no network
requests. Graphics are drawn on a canvas and sound is synthesised with
WebAudio. The game still works if sound is blocked.

## Run

- Open `index.html` directly in a browser (`file://` works), or
- serve the folder with any static server, e.g. `python3 -m http.server` and
  open <http://localhost:8000/>.

Controls:

| Action | Keyboard | Touch / mouse |
| --- | --- | --- |
| Move | WASD or arrow keys | Drag anywhere on the arena (virtual joystick) |
| Start / restart | Enter | Play / Play again buttons |
| Buy upgrade in shop | 1–9 | Tap the upgrade |
| Next wave | Enter | Start wave button |
| Toggle sound | M | Speaker button |

QA URL parameters, which can be combined (`?wave=5&god=1`):

- `?wave=N`: new games start at wave N.
- `?god=1`: the player takes no damage.

QA hook: `window.game.getState()` returns a plain snapshot
`{ screen, wave, score, highScore, coins, player, enemies, upgrades, arena }`.
See `State.snapshot` in `js/state.js`.

## Test

```sh
node --test                     # unit tests for the pure game rules (tests/*.test.js)
node tools/browser-check.cjs    # optional end-to-end check in Chromium (needs the Node `playwright` module)
```

The browser check plays through the real page: screens, keyboard, touch drag,
shop, game over, high-score persistence across a reload, URL parameters,
layout from 360×640 to 1920×1080, and frame rate with 100+ enemies.
It saves screenshots to `/tmp/arena-*.png`.

## Files

```
index.html            entry point; DOM for HUD and menu screens; loads the scripts in order
css/style.css         layout, HUD, menus, responsive rules
js/config.js          all tuning data: arena, player, enemy types, upgrades, storage keys
js/geometry.js        pure math helpers: clamp, vectors, circle overlap, arena clamping, seeded RNG
js/waves.js           pure wave rules: composition, per-wave enemy stats, spawn schedule/points, rewards
js/shop.js            pure upgrade rules: prices, derived player stats, canBuy/buyUpgrade, shop rows
js/combat.js          pure damage rules: player/enemy damage, bullet volleys, knockback
js/state.js           game-state factory, URL params, high-score storage, getState() snapshot
js/entities.js        entity factories and per-type enemy behaviour (chaser, tank, shooter, charger)
js/world.js           simulation and game flow: waves, shooting, collisions, shop, game over (DOM-free)
js/input.js           keyboard and pointer virtual joystick (keyVector/dragVector are pure)
js/audio.js           WebAudio sound effects (all optional / no-op when blocked)
js/fx.js              cosmetic effects driven by game events: particles, rings, floating text, shake
js/render.js          canvas renderer and camera
js/ui.js              title / shop / game-over screens and HUD
js/main.js            bootstrap, frame loop, keyboard shortcuts, window.game
tests/*.test.js       node:test unit tests
tools/browser-check.cjs  Playwright end-to-end smoke test
```

### Architecture notes

- Every script is a classic script that registers itself on `window.AS`
  (e.g. `AS.Waves`). The rule modules (`config`, `geometry`, `waves`, `shop`,
  `combat`, `state`, `entities`, `world`, `input`) also export through
  `module.exports` under Node, which is how the tests load them. Script order
  in `index.html` follows the dependencies.
- `world.js` changes the game state and appends presentation events
  (`enemyDeath`, `playerHit`, `waveClear`, …) to `game.events`. Each frame
  `main.js` passes them to `fx.js` and `audio.js`, so the rules never touch
  the DOM, canvas or audio.
- Balance numbers live in `js/config.js`. Wave growth is set in
  `js/waves.js` (`waveComposition`, `waveScaling`).
- Enemy types: `chaser` (fast, weak), `tank` (slow, tough, heavy),
  `shooter` (keeps its distance and fires projectiles), `charger` (winds up,
  then dashes). Waves 1–3 add the first three types; chargers join from wave 4.
- Pausing and bosses are out of scope for this milestone.
