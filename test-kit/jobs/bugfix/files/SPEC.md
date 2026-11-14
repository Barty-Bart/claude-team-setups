# Arena Survival: build spec

Build a complete, polished top-down arena survival game that runs in desktop and mobile browsers.

## Deliverable
- `index.html` in this folder is the entry point. The game must run when the file is opened directly (`file://`) and when served by any static file server.
- No build step, no server code, no network requests at runtime (no CDNs, web fonts or external assets). Plain HTML, CSS and JavaScript. You may split the code into several files.
- Graphics are drawn in code on a canvas. Sound, if any, is synthesised with WebAudio, and the game must work when sound is blocked.

## Game
1. The player controls a character in a bounded arena seen from above and survives waves of enemies.
2. Movement: WASD and the arrow keys. On touch screens, dragging a finger anywhere on the play area works as a virtual joystick (drag direction = movement direction). The player can never leave the arena.
3. The player's weapon fires automatically at the nearest enemy. No aiming input is needed.
4. Enemies: at least three types that look different and behave differently (for example a fast weak chaser, a slow tank and a ranged shooter). All three types must have appeared by wave 3.
5. Waves: each wave spawns a finite set of enemies and ends when all of them are dead. Each wave is harder than the one before. Wave 1 must be easy enough for a first-time player to clear.
6. Enemies that touch the player, and enemy projectiles that hit, reduce the player's HP. At 0 HP the game is over.
7. Killing enemies gives score and coins.
8. Shop: after each wave a shop screen offers at least four different upgrades (for example damage, fire rate, move speed, max HP) paid for with coins. Each upgrade can be bought several times and its price rises with each level. An upgrade the player cannot afford cannot be bought. A "continue" action starts the next wave.
9. High score: the best score is saved in localStorage, shown on the title screen and on the game-over screen, and survives a page reload.
10. Screens: title, playing (with a HUD showing HP, wave, score and coins), shop, game over.
11. Keyboard: Enter starts the game from the title screen and restarts it from the game-over screen. In the shop, keys 1 to 9 buy the corresponding upgrade and Enter starts the next wave.
12. Touch and mouse: every screen is fully usable by tap or click alone. The controls on the title, shop and game-over screens are real HTML `<button>` elements.
13. Layout: the game fills the window and adapts to any size from 360x640 (portrait phone) to 1920x1080, and to the window being resized, with no page scrollbars.
14. Feel: readable visuals, clear feedback when something is hit or dies, and a smooth frame rate with 100 or more enemies on screen.

## QA interface (required, our QA tooling depends on it)
`window.game.getState()` returns a plain-object snapshot of the current game:

```js
{
  screen: 'title' | 'playing' | 'shop' | 'gameover',
  wave: 0,            // current wave number, 1-based; 0 on the title screen
  score: 0,
  highScore: 0,
  coins: 0,
  player: { x, y, hp, maxHp },
  enemies: [ { id, type, x, y, hp } ],   // living enemies only; id is unique per enemy, type is a string
  upgrades: { /* upgradeId: level bought so far */ },
  arena: { width, height }
}
```

Positions are in arena units: `0 <= x <= arena.width`, `0 <= y <= arena.height`, +x is right and +y is down on screen.

Two URL parameters for QA:
- `?wave=N` makes a new game start at wave N instead of wave 1.
- `?god=1` makes the player take no damage.
They can be combined (`?wave=5&god=1`). Without them the game behaves normally.

## Project structure (required)
This is the start of a longer-lived project, so structure it for other developers:
- Split the code into focused classic-script files under `js/` (for example config, state, entities, waves, shop, input, render, audio, ui, main), loaded with plain `<script src>` tags so `file://` still works. Styles go in `css/`.
- Keep game rules (wave composition, upgrade prices and effects, damage, collisions) in pure functions that do not touch the DOM, so they can be unit-tested.
- Add unit tests for those pure functions under `tests/`, runnable with `node --test`.
- Add a short `README.md`: how to run, how to test, and a map of the files.
- Do not implement pausing or boss enemies; they are planned for a later milestone.
