# Milestone 2: pause menu and boss fights

Add the two features below to this game. Everything that works today must keep working, including the QA interface described in SPEC.md and the existing unit tests. Follow the structure and conventions already used in the project.

## 1. Pause menu
- During play, pressing P or Escape pauses the game, and pressing either again resumes it. There is also an on-screen pause `<button>` during play that works by tap and click.
- While paused the simulation is completely frozen: nothing moves, spawns, fires, takes damage or counts down. When play resumes it continues exactly where it stopped, with no jump.
- The pause menu is an overlay with three real `<button>` elements: Resume, Restart (starts a new game immediately) and Quit (back to the title screen).
- The game pauses by itself when the tab is hidden or the window loses focus.
- Pausing is only possible during play, not on the title, shop or game-over screens.
- `getState().screen` is `'paused'` while the game is paused.

## 2. Boss fights
- Every fifth wave (5, 10, 15 and so on) is a boss wave. It has exactly one boss, with enemy type `'boss'`, clearly bigger than normal enemies. It may also bring a few normal enemies.
- The boss has far more HP than any normal enemy, and its health is shown in a boss health bar while it is alive.
- The boss has at least two different attacks (for example a charge and a ring of projectiles). At half health it enters a second phase in which it is clearly more dangerous.
- The boss wave ends when the boss and any other enemies are dead. Killing the boss pays a score and coin bonus much larger than any normal enemy.
- Later bosses are tougher: the wave 10 boss has more HP than the wave 5 boss.
- QA interface: the boss appears in `getState().enemies` with `type: 'boss'`. Add `getState().boss`, which is `null` when no boss is alive and otherwise `{ hp, maxHp, phase }` with `phase` 1 or 2.

## Housekeeping
- Add unit tests for the new pure rules, and keep `node --test` passing.
- Update README.md.
