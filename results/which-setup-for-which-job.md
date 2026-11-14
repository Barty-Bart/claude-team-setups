# Which Claude setup to use for which job

**Short answer: across both rounds, one model working alone beat every team.** In nine different jobs, no team scored higher than the best single model by more than the noise, and every team cost more. A team was faster in exactly one case. There is no "ultimate Fable team" for work of this size. Fable 5.2 is best used alone, on the hardest jobs.

**Did round 2 change my mind?** Not on the main point. Round 1 said solo beats the team on small jobs; round 2 tried five very different jobs, including a large build in separate parts and a job made of independent pieces, and the answer was the same. It did change two smaller things:
- **Parallel builders are worth having for one kind of job.** When the work is a set of pieces that share nothing, a lead with parallel builders finished a third sooner than a solo model, at nearly twice the cost and the same quality. I did not have that setup in round 1.
- **Sonnet alone on high is better value than I said.** In round 1 I called it the budget option for new builds. In round 2 it passed every hidden check on all five jobs and scored within 0.2 of Opus on average at half the price.

This rests on 82 sealed test runs: 57 in round 1 (about $241 of a $250 budget) and 25 in round 2 (about $153 against a $150 budget; one run cost three times its estimate). "Works" means the build passed hidden checks the building models never saw. "Quality" is the average score out of 10 from two blind judges (Opus 5.5 and Sonnet 5.5), so it is a model's opinion, and differences under about 0.3 mean nothing. Cost and time are measured. Round 1 repeated its main setups three times on one job; round 2 ran each setup once on each of five jobs, so its single results are leans, and what carries weight is that all five point the same way. The full tables are in `round1-full-results.md` and `round2-full-results.md`.

## Use this setup when

| Job | Use | What you get | Backed by | How sure |
|---|---|---|---|---|
| New build from a spec | **Opus 5.5 alone, medium** | Quality 7.2, $1.64, 10 min, worked 3 times out of 3 | `g-opus-solo-med-1` to `-3` | High for this game |
| New build on a small budget | **Sonnet 5.5 alone, high** | Quality 6.6, $0.75, 7 min, worked 2 of 3 (one run failed one phone check) | `g-sonnet-solo-high-1` to `-3` | Medium |
| Quick working draft | **Sonnet 5.5 alone, medium**, or Haiku alone | Sonnet: quality 5.3, $0.29, 3 min. Haiku: 5.6, $0.10, 14 min. Both worked 3 of 3 | `g-sonnet-solo-med-1` to `-3`, `g-haiku-solo-med-1` to `-3` | High |
| Feature in an existing project | **Sonnet 5.5 alone, medium** | Quality 7.8, $0.77, 6 min, all 97 checks | `f-sonnet-solo-med-1` | Medium-low (one run each) |
| Bug fixes from user reports | **Sonnet 5.5 alone, medium** | Quality 7.8, $0.18, 1 min, all six bugs fixed | `b-sonnet-solo-med-1` | Medium-low (one run each) |
| Hard, algorithm-heavy build, quality first | **Fable 5.2 alone, medium** | Quality 8.2, $10.21, 31 min, all 41 checks | `p-fable-solo-med-1` | Low-medium (one run) |
| Hard build on a budget | **Budget team**: Opus lead, Sonnet builder, Haiku tester | Quality 7.4, $3.00, 35 min, all 41 checks | `p-budget-team-1` | Low (one run) |

### Added by round 2 (one run per setup per job)

| Job | Use | What you get | Backed by | How sure |
|---|---|---|---|---|
| Large build in separate parts (API, front end, tests, docs) | **Opus 5.5 alone, medium**; Fable 5.2 alone if quality comes first | Opus: quality 7.8, $3.07, 12 min. Fable: 8.2, $6.43, 15 min. Both passed all 77 checks | `w2-opus-solo-med-1`, `w2-fable-solo-med-1` | Medium-low |
| Many independent pieces, and you want it sooner | **Parallel team**: Fable lead, four Opus builders at once | Quality 8.5, $4.01, 6 min, all 80 checks. Opus alone: 8.6, $2.27, 9 min | `k2-parallel-team-1`, `k2-opus-solo-med-1` | Low-medium |
| Multi-page website | **Opus 5.5 alone, medium** | Quality 8.0, $1.68, 7 min, all 45 checks | `s2-opus-solo-med-1` | Medium-low |
| Motion-graphics video made with code | **Opus 5.5 alone, medium** | Quality 7.6, $1.81, 11 min, all 13 checks | `v2-opus-solo-med-1` | Medium-low |
| Data analysis with a written report | **Sonnet 5.5 alone, high** | Quality 8.2, $0.68, 4 min, all twelve answers right | `d2-sonnet-solo-high-1` | Medium-low |
| Any of the above on a small budget | **Sonnet 5.5 alone, high** | Passed every hidden check on all five jobs; average quality 7.8 against 8.0 for Opus; $5.26 for all five against $10.57 | the five `*-sonnet-solo-high-1` runs in round 2 | Medium |

## The reasoning behind each line

**New build: Opus alone on medium.** Fable alone scored the same (7.3 against 7.2) for about twice the money ($3.11, `g-fable-solo-med-1` to `-3`). Raising Opus to high added 0.2 for 45% more money in one run (`g-opus-solo-high-1`), which is inside the noise. Do not go below medium for building: Opus on low fell to 5.6 (`g-opus-solo-low-1`), and Fable on low shipped a game whose first wave sometimes never ends (`g-fable-solo-low-1`).

**Feature in an existing project: Sonnet alone.** Every setup passed all 97 hidden checks. Opus scored 8.1 for $2.67 and Fable 8.2 for $5.13 (`f-opus-solo-med-1`, `f-fable-solo-med-1`), so you would pay 3 to 7 times more for 0.3 or 0.4 of a point. Haiku also passed everything, at 7.5 for $0.61 (`f-haiku-solo-med-1`).

**Bug fixes: Sonnet alone, or Fable if the explanation matters.** Every setup fixed all six bugs. Haiku did it for $0.04 (`b-haiku-solo-med-1`). Fable alone had the best-judged fixes, 8.4 for $1.31 (`b-fable-solo-med-1`), mostly for finding and explaining the real cause. That is one run, so treat it as a lean, not a fact.

**Hard build: Fable alone if quality comes first.** On the physics engine Fable scored 8.2 and Opus 7.9 at nearly the same price ($10.21 and $9.51, `p-opus-solo-med-1`), so here Fable costs almost nothing extra. This is the one job where the expensive models clearly pulled away: Sonnet alone on medium scored 6.0 and shipped no tests (`p-sonnet-solo-med-1`, `-2`).

**Hard build on a budget: this is the one place a team earned its keep.** The budget team got within half a point of Opus alone for a third of the price, because Opus only planned and checked while Sonnet did the expensive writing. Haiku alone was the surprise of the experiment: 7.2 for $0.82 across two runs (`p-haiku-solo-med-1`, `-2`), ahead of Sonnet on medium both times. If money is very tight, try Haiku alone before paying for a team.

**Round 2, large build: still a single model.** I expected the parallel team to win here, since the app splits cleanly into an API, screens, tests and docs. It was slower than both solo models (18 minutes against 12 and 15) and cost $8.30 against $3.07 for Opus alone, with quality inside the noise (`w2-parallel-team-1`). The lead's time writing the contract and joining the parts ate what the five parallel builders saved. Fable alone had the best score (8.2), so it is the pick if quality matters more than money.

**Round 2, independent pieces: the one job where a team was faster.** Eight modules that share nothing let the parallel team finish in 6 minutes against 9, at the same quality (`k2-parallel-team-1`). You pay $4.01 where Opus alone costs $2.27, so use it when time matters more than money. If it does not, Opus alone is still the better buy.

**Round 2, website, video and data analysis: a single model again.** On each of these the teams scored within 0.2 of the best solo model and cost two to twelve times as much (`s2-*`, `v2-*`, `d2-*`). On the data analysis Sonnet alone on high matched the most expensive setups for $0.68.

## What not to use

- **The tip from online (Fable lead, Opus builder, Sonnet tester, Haiku scout).** On the game it averaged 7.1, the same as Opus alone, for $5.75 and 61 minutes against $1.64 and 10 minutes. One of its three runs was stopped after 88 minutes with real defects in the build (`g-viral-team-1` to `-3`). On the feature and the bug fixes it also matched the solo models at several times the cost (`f-viral-team-1`, `b-viral-team-1`). I am confident about the game (three runs) and fairly confident elsewhere (one run each). I have no valid run of it on the physics job. Round 2 agreed on five more jobs: it never beat the best solo model, it was the slowest setup on every job (176 minutes in total against 45 for Opus alone), and it cost $47.14 against $10.57. Its video run alone cost $21.73 and took 78 minutes (`w2-viral-team-1`, `k2-viral-team-1`, `s2-viral-team-1`, `v2-viral-team-1`, `d2-viral-team-1`).
- **The parallel team for work whose parts have to fit together.** On the app, the website, the video and the data analysis it was no faster than Opus alone and cost three to four times as much (`w2-parallel-team-1`, `s2-parallel-team-1`, `v2-parallel-team-1`, `d2-parallel-team-1`). Keep it for independent pieces.
- **My own pick from before the tests (Fable lead, Sonnet builder, Opus reviewer, Sonnet tester, Haiku scout).** I was wrong about this one. In every run Fable built everything itself and only called the reviewer, so it is Fable alone plus about a dollar for a review that did not raise the score: 7.0 for $4.15 on the game (`g-fable-pick-1` to `-3`), and 8.0 for $19.30 on physics against 8.2 for $10.21 for Fable alone (`p-fable-pick-1`).
- **The budget team for ordinary builds.** On the game it averaged 5.7, which is Sonnet's quality at close to Opus's price, and took 48 minutes (`g-budget-team-1` to `-3`). Opus alone costs 18 cents more and scores 7.2.
- **A stronger critic on top of a weaker builder.** Sonnet with an Opus critic scored 5.5 for $1.21 (`g-sonnet-opus-critic-1` to `-3`), no better than Sonnet alone at $0.29. Raising Sonnet's effort to high buys far more for less. Opus with a Fable critic scored 6.6 for $6.01, below Opus alone (`g-opus-fable-critic-1`). That is one run, because two more would have passed the budget cap, so I am not sure about it.

## Things worth knowing

- **Teams are slow and unpredictable in time.** Two of the six viral-team and budget-team runs on the game hit the time limit, both while the tester was running slow browser tests. Solo runs never came close to the limit.
- **Telling Opus to review its own work once before finishing** scored 7.5 for $2.28 in a single run (`g-opus-selfreview-1`). It is the only "second look" that seemed to help, but one run is not proof.
- **Sonnet on xhigh** scored 7.5 for $1.98 in a single run (`g-sonnet-solo-xhigh-1`), which would make it a match for Opus on medium. Also one run.

## What I did not test

Round 2 covered different kinds of work, but not much bigger work. The largest job, the full-stack app, still took a single model 10 to 15 minutes. With these models a job has to be many times that size before one session runs short, and one comparison at that size would have cost more than the round's budget. So for jobs that take a solo model several hours, or that do not fit in one session, I have no evidence either way. Every job was also built from scratch, not inside a large existing codebase, and no human has scored the builds yet. The `example-builds/` folder has the same game and the same video built by Opus alone and by the viral team, so you can compare them yourself.

The exact files for every setup are in `setups/`; the parallel team is `setups/05-parallel-team-separate-pieces/`.
