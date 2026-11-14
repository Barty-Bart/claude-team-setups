# Results: every setup tested

This file lists all 57 valid test runs across four jobs, then explains how my thinking changed from round to round. The short "use this when" list is in `which-setup-for-which-job.md`. Two of the builds (the game by Opus alone and by the viral team) are in `example-builds/`.

## The four jobs

- **One-shot game** (`game`, run names start with `g-`): build a complete browser arena-survival game from a one-page spec, starting from an empty folder.
- **Feature in an existing project** (`feature`, `f-`): add a pause menu and boss fights to an existing, tested game project. Every setup started from the same starter project.
- **Six bug reports** (`bugfix`, `b-`): the same project with six planted bugs, described only as vague player reports. Find the causes, fix them and add regression tests.
- **Physics engine** (`phys`, `p-`): write a 2D rigid-body physics library and a demo page. This is the hardest job and the most expensive one.

## What was measured and what is judgement

- **Works** is measured. Each build was run against hidden checks that the building models never saw: a Playwright bot that plays the game (up to 67 checks for the game, 97 for the feature, 73 for the bug fixes) and a Node test rig for the physics engine (41 checks). "Fixes needed" is the number of failed checks.
- **Cost** is measured. It is Claude Code's own `total_cost_usd` for the whole run, covering the lead and every subagent. Two runs that hit the time limit have no such figure, so their cost is my estimate from token counts and is marked "est.".
- **Wall time** is measured, from the start of the sealed container to its end. The limit was 75 minutes.
- **Quality** is a model's opinion, not a measurement. Two blind judges (Opus 5.5 and Sonnet 5.5, each in a fresh sealed session that saw one build, with the setup files removed) scored five aspects from 1 to 10. The number shown is the average of the two judges. No human has scored the builds yet.
- **How much the quality score wobbles**: the same setup run three times usually lands within 0.3 of its average, and at worst within 0.8 (Sonnet on high: 7.4, 6.2, 6.3). I treat differences under about 0.3 as no difference.
- Everything in the "how my thinking changed" section and in `which-setup-for-which-job.md` beyond these numbers is my own judgement.

Every run was sealed: its own Docker container, a new empty Claude config folder, a randomly named project folder, and no git history or notes from other runs. At most two builds ran at once.

## Notes on the tables

1. **Runs stopped at the time limit.** `g-viral-team-2` was stopped after 88 minutes (I let it run past the 75-minute limit to see if it would finish) and `g-budget-team-3` after 75 minutes. In both, the tester was still running slow browser tests and the lead had not done its final check. The build on disk at that moment was checked and judged.
2. **Two first-round team runs were cut short by my harness.** In `g-viral-team-1` and `g-budget-team-1` the lead ended its turn while a teammate was still working in the background, and headless Claude Code stopped the teammate ten minutes later. I fixed this for all later runs. Both builds were complete and passed every hidden check, but the lead never did its last re-test, so read those two rows as slightly unfair to the teams.
3. **The six failed checks in `g-viral-team-2` come from two real defects.** I reproduced the main one by hand: in the required QA "god mode", enemies pile onto the player, the player's shots start beyond them, and the wave never ends. The other is that coins must be walked over to be collected, where the spec says kills give coins.
4. **Missing cells.** There is no valid viral-team run on the physics job: two attempts were lost to the fault in note 2 and a third was killed when my own session ran out of usage. The Opus-plus-Fable-critic setup has one run on the game, not three, because two more would have passed the $250 cap.
5. **Runs not in the tables.** 21 runs were thrown away: 17 that the account usage limit stopped part-way (all re-run later), the three physics runs in note 4, and one game run killed with them. They cost $18.59, which counts toward the budget.

## Spend

Valid runs cost $154.49 (including $4.21 to build the starter project), thrown-away runs $18.59, blind judging $37.06, and my own sessions about $31 (an estimate, since only one of my three sessions reported an exact figure). The total is about $241 of the $250 cap.

## All runs

### One-shot game (`game`)

| Run | Setup (lead and subagents, effort) | Cost | Wall time | Hidden checks | Works | Quality (Opus judge / Sonnet judge) | Fixes needed | Subagent calls | Cost by model |
|---|---|---|---|---|---|---|---|---|---|
| `g-haiku-solo-med-1` | Haiku alone, medium | $0.06 | 7 min | 67/67 | Yes | **5.8** (5.6 / 6.0) | 0 | none | haiku $0.06 |
| `g-haiku-solo-med-2` | Haiku alone, medium | $0.19 | 29 min | 66/66 | Yes | **5.7** (5.2 / 6.2) | 0 | none | haiku $0.19 |
| `g-haiku-solo-med-3` | Haiku alone, medium | $0.05 | 6 min | 66/66 | Yes | **5.4** (5.4 / 5.4) | 0 | none | haiku $0.05 |
| `g-haiku-solo-high-1` | Haiku alone, high | $0.79 | 14 min | 67/67 | Yes | **6.3** (6.4 / 6.2) | 0 | none | haiku $0.79 |
| `g-sonnet-solo-med-1` | Sonnet 5.5 alone, medium | $0.32 | 3 min | 67/67 | Yes | **5.7** (5.6 / 5.8) | 0 | none | sonnet $0.32 |
| `g-sonnet-solo-med-2` | Sonnet 5.5 alone, medium | $0.27 | 3 min | 66/66 | Yes | **5.2** (5.2 / 5.2) | 0 | none | sonnet $0.27 |
| `g-sonnet-solo-med-3` | Sonnet 5.5 alone, medium | $0.27 | 3 min | 67/67 | Yes | **5.1** (5.0 / 5.2) | 0 | none | sonnet $0.27 |
| `g-sonnet-solo-high-1` | Sonnet 5.5 alone, high | $0.73 | 6 min | 66/66 | Yes | **7.4** (7.0 / 7.8) | 0 | none | sonnet $0.73 |
| `g-sonnet-solo-high-2` | Sonnet 5.5 alone, high | $0.75 | 9 min | 66/67 | No: T6 | **6.2** (6.2 / 6.2) | 1 | none | sonnet $0.75 |
| `g-sonnet-solo-high-3` | Sonnet 5.5 alone, high | $0.79 | 5 min | 67/67 | Yes | **6.3** (6.2 / 6.4) | 0 | none | sonnet $0.79 |
| `g-sonnet-solo-xhigh-1` | Sonnet 5.5 alone, xhigh | $1.98 | 20 min | 67/67 | Yes | **7.5** (7.4 / 7.6) | 0 | none | sonnet $1.98 |
| `g-opus-solo-low-1` | Opus 5.5 alone, low | $0.59 | 3 min | 66/66 | Yes | **5.6** (5.2 / 6.0) | 0 | none | opus $0.59 |
| `g-opus-solo-med-1` | Opus 5.5 alone, medium | $1.79 | 12 min | 67/67 | Yes | **7.3** (7.0 / 7.6) | 0 | none | opus $1.79 |
| `g-opus-solo-med-2` | Opus 5.5 alone, medium | $1.67 | 11 min | 66/66 | Yes | **7.2** (7.2 / 7.2) | 0 | none | opus $1.67 |
| `g-opus-solo-med-3` | Opus 5.5 alone, medium | $1.47 | 8 min | 67/67 | Yes | **7.2** (7.0 / 7.4) | 0 | none | opus $1.47 |
| `g-opus-solo-high-1` | Opus 5.5 alone, high | $2.40 | 18 min | 67/67 | Yes | **7.4** (7.2 / 7.6) | 0 | none | opus $2.40 |
| `g-opus-selfreview-1` | Opus alone, medium, with a self-review step in CLAUDE.md | $2.28 | 22 min | 67/67 | Yes | **7.5** (7.2 / 7.8) | 0 | none | opus $2.28 |
| `g-fable-solo-low-1` | Fable 5.2 alone, low | $2.13 | 9 min | 57/65 | No: W1, W2, S2, S3, W3, W4, W5, T6 | **6.4** (6.2 / 6.6) | 8 | none | fable $2.13 |
| `g-fable-solo-med-1` | Fable 5.2 alone, medium | $2.88 | 9 min | 67/67 | Yes | **7.3** (6.8 / 7.8) | 0 | none | fable $2.88 |
| `g-fable-solo-med-2` | Fable 5.2 alone, medium | $3.31 | 16 min | 67/67 | Yes | **7.5** (7.4 / 7.6) | 0 | none | fable $3.31 |
| `g-fable-solo-med-3` | Fable 5.2 alone, medium | $3.16 | 17 min | 67/67 | Yes | **7.2** (7.2 / 7.2) | 0 | none | fable $3.16 |
| `g-sonnet-opus-critic-1` | Sonnet lead builds, Opus critic (high, read-only) once at the end | $1.22 | 13 min | 66/66 | Yes | **5.5** (5.4 / 5.6) | 0 | critic x1 | sonnet $0.46, opus $0.75 |
| `g-sonnet-opus-critic-2` | Sonnet lead builds, Opus critic (high, read-only) once at the end | $1.16 | 11 min | 67/67 | Yes | **5.3** (5.2 / 5.4) | 0 | critic x1 | sonnet $0.37, opus $0.79 |
| `g-sonnet-opus-critic-3` | Sonnet lead builds, Opus critic (high, read-only) once at the end | $1.25 | 29 min | 67/67 | Yes | **5.7** (5.2 / 6.2) | 0 | critic x1 | sonnet $0.46, opus $0.79 |
| `g-opus-fable-critic-1` | Opus lead builds, Fable critic (high, read-only) once at the end | $6.01 | 33 min | 66/66 | Yes | **6.6** (6.2 / 7.0) | 0 | critic x1 | opus $1.97, fable $4.04 |
| `g-budget-team-1` | Budget: Opus lead, Sonnet builder, Haiku tester and scout | $1.15 | 32 min | 67/67 | Yes (lead cut off before its last re-test, see note 2) | **5.4** (5.4 / 5.4) | 0 | builder x1, tester x1 | opus $0.34, sonnet $0.47, haiku $0.34 |
| `g-budget-team-2` | Budget: Opus lead, Sonnet builder, Haiku tester and scout | $1.38 | 35 min | 67/67 | Yes | **5.7** (5.2 / 6.2) | 0 | builder x1, tester x1 | opus $0.43, sonnet $0.53, haiku $0.41 |
| `g-budget-team-3` | Budget: Opus lead, Sonnet builder, Haiku tester and scout | ~$1.85 (est.) | 75 min | 67/67 | Yes (run stopped at the time limit) | **5.9** (5.6 / 6.2) | 0 | builder x1, tester x1 | opus $0.29, sonnet $0.86, haiku $0.70 |
| `g-viral-team-1` | Viral team: Fable lead, Opus builder, Sonnet tester, Haiku scout | $3.75 | 52 min | 67/67 | Yes (lead cut off before its last re-test, see note 2) | **6.4** (6.0 / 6.8) | 0 | builder x1, tester x1 | fable $0.60, opus $2.46, sonnet $0.69 |
| `g-viral-team-2` | Viral team: Fable lead, Opus builder, Sonnet tester, Haiku scout | ~$7.82 (est.) | 88 min | 54/60 | No: P9, W3, W4, W5, S4, T6 (run stopped at the time limit) | **7.3** (7.0 / 7.6) | 6 | builder x1, tester x1 | fable $0.74, opus $4.24, sonnet $2.84 |
| `g-viral-team-3` | Viral team: Fable lead, Opus builder, Sonnet tester, Haiku scout | $5.69 | 42 min | 67/67 | Yes | **7.5** (7.2 / 7.8) | 0 | builder x1, tester x2 | fable $1.16, opus $3.32, sonnet $1.21 |
| `g-fable-pick-1` | Fable pick: Fable lead, Sonnet builder, Opus reviewer (read-only, high), Sonnet tester, Haiku scout | $3.94 | 16 min | 67/67 | Yes | **7.0** (7.2 / 6.8) | 0 | reviewer x1 | fable $3.20, opus $0.73 |
| `g-fable-pick-2` | Fable pick: Fable lead, Sonnet builder, Opus reviewer (read-only, high), Sonnet tester, Haiku scout | $3.99 | 31 min | 67/67 | Yes | **7.0** (7.0 / 7.0) | 0 | reviewer x1 | fable $3.13, opus $0.86 |
| `g-fable-pick-3` | Fable pick: Fable lead, Sonnet builder, Opus reviewer (read-only, high), Sonnet tester, Haiku scout | $4.52 | 21 min | 67/67 | Yes | **7.1** (6.8 / 7.4) | 0 | reviewer x1 | fable $3.59, opus $0.93 |

Averages over repeated runs (One-shot game):

| Setup | Runs | Mean cost | Mean time | Quality: mean (each run) | All checks passed in |
|---|---|---|---|---|---|
| Haiku alone, medium | 3 | $0.10 | 14 min | 5.63 (5.8, 5.7, 5.4) | 3/3 |
| Sonnet 5.5 alone, medium | 3 | $0.29 | 3 min | 5.33 (5.7, 5.2, 5.1) | 3/3 |
| Sonnet 5.5 alone, high | 3 | $0.75 | 7 min | 6.63 (7.4, 6.2, 6.3) | 2/3 |
| Opus 5.5 alone, medium | 3 | $1.64 | 10 min | 7.23 (7.3, 7.2, 7.2) | 3/3 |
| Fable 5.2 alone, medium | 3 | $3.11 | 14 min | 7.33 (7.3, 7.5, 7.2) | 3/3 |
| Sonnet lead builds, Opus critic (high, read-only) once at the end | 3 | $1.21 | 18 min | 5.50 (5.5, 5.3, 5.7) | 3/3 |
| Budget: Opus lead, Sonnet builder, Haiku tester and scout | 3 | $1.46 | 48 min | 5.67 (5.4, 5.7, 5.9) | 3/3 |
| Viral team: Fable lead, Opus builder, Sonnet tester, Haiku scout | 3 | $5.75 | 61 min | 7.07 (6.4, 7.3, 7.5) | 2/3 |
| Fable pick: Fable lead, Sonnet builder, Opus reviewer (read-only, high), Sonnet tester, Haiku scout | 3 | $4.15 | 23 min | 7.03 (7.0, 7.0, 7.1) | 3/3 |

### Feature in existing project (`feature`)

| Run | Setup (lead and subagents, effort) | Cost | Wall time | Hidden checks | Works | Quality (Opus judge / Sonnet judge) | Fixes needed | Subagent calls | Cost by model |
|---|---|---|---|---|---|---|---|---|---|
| `f-haiku-solo-med-1` | Haiku alone, medium | $0.61 | 9 min | 97/97 | Yes | **7.5** (7.6 / 7.4) | 0 | none | haiku $0.61 |
| `f-sonnet-solo-med-1` | Sonnet 5.5 alone, medium | $0.77 | 6 min | 97/97 | Yes | **7.8** (8.0 / 7.6) | 0 | none | sonnet $0.77 |
| `f-opus-solo-med-1` | Opus 5.5 alone, medium | $2.67 | 13 min | 97/97 | Yes | **8.1** (8.2 / 8.0) | 0 | none | opus $2.67 |
| `f-fable-solo-med-1` | Fable 5.2 alone, medium | $5.13 | 26 min | 97/97 | Yes | **8.2** (8.4 / 8.0) | 0 | none | fable $5.13 |
| `f-budget-team-1` | Budget: Opus lead, Sonnet builder, Haiku tester and scout | $2.74 | 29 min | 97/97 | Yes | **8.0** (8.0 / 8.0) | 0 | builder x1, tester x1 | opus $0.58, sonnet $1.40, haiku $0.76 |
| `f-viral-team-1` | Viral team: Fable lead, Opus builder, Sonnet tester, Haiku scout | $4.06 | 31 min | 97/97 | Yes | **8.0** (8.0 / 8.0) | 0 | builder x1, tester x1 | fable $0.67, opus $2.83, sonnet $0.55 |
| `f-fable-pick-1` | Fable pick: Fable lead, Sonnet builder, Opus reviewer (read-only, high), Sonnet tester, Haiku scout | $6.56 | 24 min | 97/97 | Yes | **8.2** (8.4 / 8.0) | 0 | reviewer x2 | fable $4.69, opus $1.86 |

### Six bug reports (`bugfix`)

| Run | Setup (lead and subagents, effort) | Cost | Wall time | Hidden checks | Works | Quality (Opus judge / Sonnet judge) | Fixes needed | Subagent calls | Cost by model |
|---|---|---|---|---|---|---|---|---|---|
| `b-haiku-solo-med-1` | Haiku alone, medium | $0.04 | 3 min | 73/73 | Yes | **7.7** (7.8 / 7.6) | 0 | none | haiku $0.04 |
| `b-sonnet-solo-med-1` | Sonnet 5.5 alone, medium | $0.18 | 1 min | 73/73 | Yes | **7.8** (7.6 / 8.0) | 0 | none | sonnet $0.18 |
| `b-opus-solo-med-1` | Opus 5.5 alone, medium | $0.65 | 3 min | 73/73 | Yes | **7.9** (7.8 / 8.0) | 0 | none | opus $0.65 |
| `b-fable-solo-med-1` | Fable 5.2 alone, medium | $1.31 | 3 min | 73/73 | Yes | **8.4** (8.6 / 8.2) | 0 | none | fable $1.31 |
| `b-budget-team-1` | Budget: Opus lead, Sonnet builder, Haiku tester and scout | $0.67 | 5 min | 73/73 | Yes | **8.0** (7.8 / 8.2) | 0 | builder x1, tester x1 | opus $0.57, sonnet $0.08, haiku $0.01 |
| `b-viral-team-1` | Viral team: Fable lead, Opus builder, Sonnet tester, Haiku scout | $2.61 | 52 min | 73/73 | Yes | **8.3** (8.0 / 8.6) | 0 | builder x1, tester x2 | fable $0.83, opus $0.96, sonnet $0.82 |
| `b-fable-pick-1` | Fable pick: Fable lead, Sonnet builder, Opus reviewer (read-only, high), Sonnet tester, Haiku scout | $2.30 | 7 min | 73/73 | Yes | **8.1** (8.0 / 8.2) | 0 | reviewer x1 | fable $1.64, opus $0.66 |

### Physics engine (`phys`)

| Run | Setup (lead and subagents, effort) | Cost | Wall time | Hidden checks | Works | Quality (Opus judge / Sonnet judge) | Fixes needed | Subagent calls | Cost by model |
|---|---|---|---|---|---|---|---|---|---|
| `p-haiku-solo-med-1` | Haiku alone, medium | $1.06 | 19 min | 41/41 | Yes | **6.9** (6.4 / 7.4) | 0 | none | haiku $1.06 |
| `p-haiku-solo-med-2` | Haiku alone, medium | $0.59 | 13 min | 41/41 | Yes | **7.4** (7.2 / 7.6) | 0 | none | haiku $0.59 |
| `p-sonnet-solo-med-1` | Sonnet 5.5 alone, medium | $0.70 | 5 min | 41/41 | Yes | **6.1** (5.6 / 6.6) | 0 | none | sonnet $0.70 |
| `p-sonnet-solo-med-2` | Sonnet 5.5 alone, medium | $0.94 | 7 min | 41/41 | Yes | **5.8** (5.4 / 6.2) | 0 | none | sonnet $0.94 |
| `p-sonnet-solo-high-1` | Sonnet 5.5 alone, high | $3.10 | 22 min | 41/41 | Yes | **6.4** (6.2 / 6.6) | 0 | none | sonnet $3.10 |
| `p-opus-solo-med-1` | Opus 5.5 alone, medium | $9.51 | 37 min | 41/41 | Yes | **7.9** (7.6 / 8.2) | 0 | none | opus $9.51 |
| `p-fable-solo-med-1` | Fable 5.2 alone, medium | $10.21 | 31 min | 41/41 | Yes | **8.2** (8.0 / 8.4) | 0 | none | fable $10.21 |
| `p-budget-team-1` | Budget: Opus lead, Sonnet builder, Haiku tester and scout | $3.00 | 35 min | 41/41 | Yes | **7.4** (6.8 / 8.0) | 0 | builder x1, tester x2 | opus $0.95, sonnet $1.68, haiku $0.38 |
| `p-fable-pick-1` | Fable pick: Fable lead, Sonnet builder, Opus reviewer (read-only, high), Sonnet tester, Haiku scout | $19.30 | 62 min | 41/41 | Yes | **8.0** (8.0 / 8.0) | 0 | tester x1, reviewer x1 | fable $15.54, sonnet $0.84, opus $2.91 |

Averages over repeated runs (Physics engine):

| Setup | Runs | Mean cost | Mean time | Quality: mean (each run) | All checks passed in |
|---|---|---|---|---|---|
| Haiku alone, medium | 2 | $0.82 | 16 min | 7.15 (6.9, 7.4) | 2/2 |
| Sonnet 5.5 alone, medium | 2 | $0.82 | 6 min | 5.95 (6.1, 5.8) | 2/2 |

## How my thinking changed from round to round

**Before any run.** I expected a Fable-led team to give the best quality, and thought the open question was whether it was worth the money. My own pick, written before the first test, was Fable leading with a Sonnet builder, an Opus reviewer, a Sonnet tester and a Haiku scout.

**Round 1: seven setups on the game, then the feature and the bug fixes.** Opus alone on medium matched Fable alone on the game (both about 7.3) for a little over half the money, and neither team that cost more did better. On the feature and the bug fixes, every setup passed every hidden check, and quality ran only from 7.5 (Haiku) to 8.4 (Fable). That changed my view of small jobs in existing code: the model barely matters there, so price and speed should decide. It also showed that my own pick did not behave like a team. In all of its runs Fable did the building itself and called only the Opus reviewer.

**Round 2: effort levels and critics.** If teams did not help, I wanted to know whether effort or a second opinion was a cheaper way to buy quality. Effort mattered a great deal for Sonnet on the game (5.3 on medium, 6.6 on high, 7.5 in one run on xhigh) and little for Opus (7.2 on medium, 7.4 on high for 45% more money). Low effort was a false economy: Opus on low dropped to 5.6, and Fable on low shipped a game whose first wave sometimes never ends. A stronger critic did not lift a weaker builder. Sonnet with an Opus critic scored 5.5, the same as Sonnet alone at a quarter of the price, and Opus with a Fable critic scored 6.6, below Opus alone, with $4 of its $6 spent on the single critique. That surprised me, because "cheap builder, expensive reviewer" sounds like the efficient design. Telling Opus to review its own work scored 7.5 in one run, which is promising but is one run.

**Round 3: a harder job, and repeats.** I added the physics engine to see whether difficulty changes the ranking, and ran each solo setup three times on the game to see how much results wobble. Difficulty did change things. Opus and Fable pulled well clear of Sonnet (7.9 and 8.2 against 6.0), though at $9.50 to $10 a run. The budget team scored 7.4 for $3.00, the one place where a team clearly earned its keep, because Opus only planned and checked while Sonnet did the expensive typing. Haiku alone scored 7.2 for $0.82, ahead of Sonnet on medium in both of its runs, mostly because Haiku wrote and shipped tests and Sonnet did not. I had not expected that. The repeats showed solo results are stable: Opus alone scored 7.3, 7.2 and 7.2.

**Round 4: team repeats on the game.** Three runs each made the team picture clearer and somewhat worse. The viral team averaged 7.1, no better than Opus alone at 7.2, for 3.5 times the cost and six times the wall time, and one of its three runs shipped real defects after 88 minutes. The budget team averaged 5.7, which is Sonnet's quality for Opus's price. Two of the four new viral-team and budget-team runs hit the time limit, both while the tester was running slow browser tests. My own pick was steady at 7.0 for $4.15, which is Fable alone plus about a dollar for a review that did not raise the score.

**Where I ended up.** For jobs of this size, one good model working alone beat every team on cost and time and was never beaten on quality by more than the noise. The lead's brief seems to cap the result at the builder's level, and the tester adds time without catching much, because the solo models already test their own work (19 of 21 solo game runs passed every hidden check). This went against my own earlier advice.

**What this does not cover.** Every job fitted comfortably in one model's context and finished within about an hour. I did not test jobs large enough to overflow one context, long-running work on a big real codebase, or several independent tasks at once, and those are the cases where subagents are most likely to pay off. All four jobs were browser JavaScript. Quality was scored by models, not people.
