# Claude Team Setups: the files from my test

Fable 5.2 came out, and a "team" setup went viral: Fable as the boss, Opus building, Sonnet testing, Haiku scouting.
I tested it against every other way to run these models: 82 tests across 9 jobs (a game, an app, a website, a code-made video, a data report, bug fixes and more).

**Short answer: one model working alone matched every team on quality, for a fraction of the price.**

## Which setup to use (copy the folder into your project)

| Job | Use this folder |
|---|---|
| Most new builds, websites, code-made videos | `setups/01-opus-alone-DEFAULT` (Opus 5.5, medium effort) |
| Anything on a tight budget, data work | `setups/02-sonnet-alone-high-BUDGET` |
| Adding a feature, fixing bugs | `setups/03-sonnet-alone-small-jobs` |
| The hardest builds, quality first | `setups/04-fable-alone-hardest-builds` |
| Lots of separate pieces you want done fast | `setups/05-parallel-team-separate-pieces` |
| A hard build on a budget | `setups/06-budget-team-hard-builds` |
| The viral team, so you can test it yourself | `setups/07-the-viral-team-tested` |
| The team Fable designed for itself | `setups/08-fables-own-team-pick` |

## How to use a setup
1. Copy everything inside the folder (including the hidden `.claude` folder) into your project folder.
2. Open Claude Code there and set the model and effort from `SETTINGS.txt`, e.g. `/model opus` then `/effort medium`.
3. Single-model setups are just the settings. Team setups add a `CLAUDE.md` and agents in `.claude/agents/`.

## What else is in here
- `results/which-setup-for-which-job.md`: the full recommendations with the numbers.
- `results/round1-full-results.md` and `round2-full-results.md`: every run, cost, time and score.
- `example-builds/`: the same game and the same video, built by Opus alone and by the viral team. Compare them yourself (the video cost $1.81 alone vs $21.73 with the team).
- `test-kit/`: the job briefs and the hidden checks used to score each build, if you want to rerun the test.

Scores came from two AI judges (Opus and Sonnet) who didn't know which setup made each build. Round 2 ran each setup once per job, so treat single results as a guide, not proof.
