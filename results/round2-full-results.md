# Round 2: does "solo beats the team" hold across different kinds of work?

Round 1 found that one model working alone beat every team, but all of its jobs were small and fitted in one session. Round 2 tests the same question on five new jobs that differ from each other and from round 1, including the kinds of work where a team should have its best chance: a large build in separate parts, and a job made of independent pieces. Each setup ran once per job, so this round is about breadth, and single results should be read with that in mind.

The short "use this when" list for both rounds is in `which-setup-for-which-job.md`. The explainer video built by Opus alone and by the viral team is in `example-builds/`.

## The five jobs

- **Full-stack app** (`app`, run names start with `w2-`): a help-desk ticket tracker from a 2,000-word spec. It has a JSON API with 23 endpoints, a single-page front end with eight screens, an automated test suite, a seed script and a README. This is the large job in separate parts, where parallel builders should have the best chance.
- **Eight independent modules** (`kit`, `k2-`): eight small JavaScript libraries (CSV, semantic versions, cron times, a cache, a line diff, a template engine, an expression evaluator, glob matching), none depending on another. This is the job made of independent pieces.
- **Multi-page website** (`site`, `s2-`): a nine-page static site for a made-up bike shop, with a hire-price calculator, a validated contact form and a phone layout.
- **Motion-graphics explainer** (`video`, `v2-`): a 32 to 40 second animated explainer about compound interest, made entirely with code and rendered to a 1080p MP4. Every setup got the same five-scene script.
- **Data analysis** (`data`, `d2-`): three messy exports from a made-up subscription business (duplicates, mixed date formats, test accounts, three currencies). The job is to clean them, answer twelve questions exactly, and write a report with charts for a chief executive.

## The setups

- **Opus 5.5 alone, medium** and **Fable 5.2 alone, medium**: one model, no subagents.
- **Sonnet 5.5 alone, high**: the cheap reference point. I ran it on all five jobs because it cost about a dollar each time.
- **Viral team**: the setup from online, unchanged from round 1. Fable leads and writes no code, an Opus builder builds, a Sonnet tester tests, a Haiku scout looks things up.
- **Parallel team**: the team I designed to beat the solo models on jobs that split. Fable leads: it writes a short contract (file layout, interfaces, shared styles), splits the work into two to five parts with separate files, starts one Opus builder per part at the same moment, then integrates and checks the whole result itself. There is no separate tester. The files are in `setups/teams-tested/parallel-team/`.

## What was measured and what is judgement

- **Worked** is measured: hidden checks the building models never saw. The app is started and driven through its API and its screens (77 checks), the modules are run against 75 hidden test groups plus five project checks (80), the website is driven in a browser on desktop and phone (45), the video file is probed and sampled for motion (13), and the twelve answers are compared with the true values, which I know because I generated the data (23 with the report checks).
- **Cost** is measured: Claude Code's own `total_cost_usd` for the whole run, lead and subagents together. **Time** is measured, start to finish of the sealed container. The limit was 100 minutes; the longest run took 78.
- **Quality** is a model's opinion. Two blind judges (Opus 5.5 and Sonnet 5.5, each in a fresh sealed session, seeing one build with the setup files removed) scored five aspects from 1 to 10, and the number shown is the average. For the video, the judges were given contact sheets with one frame per second, ten full frames, and strips of six frames a tenth of a second apart, and could pull more frames from the MP4 themselves. No human has scored the builds.
- With one run per cell, I treat quality differences under about 0.3 as no difference, as in round 1, where repeated runs of one setup usually landed within 0.3 of each other.
- The conclusions below the tables are my own judgement.

Every run was sealed as in round 1: its own Docker container, a new empty Claude config folder, a randomly named project folder, no notes or git history from other runs, and at most two of my builds at a time.

## Notes

1. **The app job was enlarged after a pilot.** My first version of the spec was finished by Sonnet alone in six minutes, which was no test of a large build. I roughly tripled it (audit trail, user administration, canned replies, bulk changes, CSV import and export, reports) before any of the compared runs. Even so, the solo models finished it in 10 to 15 minutes. See "What this round still does not cover".
2. **I corrected four of my own hidden checks during the round**, each time after reading the failing build and finding that the build was right and the check was wrong: a test user called "Una" that also matched the word "Unassigned", a bar count that looked at the whole page instead of one chart, a footer check that read an article's footer, and a recommendations check that needed the word "recommend". Every build of the affected job was re-checked with the corrected version.
3. **One pilot is not in the tables**: the Sonnet run on the first, small app spec ($0.96). Its cost counts toward the budget.
4. **One build has only one judge.** The viral team's video run cost $21.73 where I had expected about $6.50, which took the round to its $150 cap while that run was still going. To stop spending I cancelled the Opus judge for that one build and used only the Sonnet judge ($0.13). Its 7.6 should be compared with the Sonnet judge's scores for the other videos: 7.8 for Opus alone, 7.6 for Sonnet alone, 7.4 for the parallel team and 7.0 for Fable alone.
5. **Two team builds carried a hint that a team made them.** The judges never saw the setup files, but the parallel team's video source had comments such as "Owner: builder C", and the viral team's modules had test names containing "builder choice". Their scores are in line with the rest, so I do not think it mattered, but those two were not perfectly blind.
6. **Spend.** By my estimate round 2 cost about $153 against the $150 cap: $115.35 for the 26 sealed runs, $15.35 for judging, and about $22 for my own session (an estimate; the first two figures are exact). I went over by about $3 because the last run to finish cost more than three times its estimate and my guard only checks before a run starts. I started nothing after that point.

## Results
### At a glance: quality, cost and time for every setup on every job

Every one of the 25 builds passed all of its hidden checks, so this table shows only quality (in bold), cost and wall time.

| Job | Sonnet alone, high | Opus alone, medium | Fable alone, medium | Viral team | Parallel team |
|---|---|---|---|---|---|
| Full-stack app | **7.8**, $1.54, 10 min | **7.8**, $3.07, 12 min | **8.2**, $6.43, 15 min | **7.9**, $8.74, 45 min | **8.0**, $8.30, 18 min |
| Eight modules | **8.2**, $1.16, 7 min | **8.6**, $2.27, 9 min | **8.1**, $3.81, 9 min | **8.4**, $4.70, 12 min | **8.5**, $4.01, 6 min |
| Website | **7.7**, $0.95, 7 min | **8.0**, $1.68, 7 min | **8.2**, $4.72, 12 min | **8.1**, $3.56, 17 min | **8.1**, $6.54, 9 min |
| Explainer video | **7.2**, $0.93, 11 min | **7.6**, $1.81, 11 min | **7.3**, $3.14, 12 min | **7.6***, $21.73, 78 min | **7.6**, $5.64, 11 min |
| Data analysis | **8.2**, $0.68, 4 min | **8.0**, $1.73, 6 min | **8.3**, $3.73, 7 min | **8.2**, $8.41, 25 min | **8.0**, $5.12, 9 min |
| **All five jobs** | **7.82** average, $5.26, 38 min | **8.00** average, $10.57, 45 min | **8.02** average, $21.83, 55 min | **8.04** average, $47.14, 176 min | **8.04** average, $29.61, 53 min |

\* Scored by the Sonnet judge only; see note 4.

The full tables follow, one per job.

### Multi-page website (`site`)

| Run | Setup (lead and subagents, effort) | Cost | Wall time | Hidden checks | Works | Quality (Opus judge / Sonnet judge) | Fixes needed | Subagent calls | Cost by model |
|---|---|---|---|---|---|---|---|---|---|
| `s2-sonnet-solo-high-1` | Sonnet 5.5 alone, high | $0.95 | 7 min | 45/45 | Yes | **7.7** (7.6 / 7.8) | 0 | none | sonnet $0.95 |
| `s2-opus-solo-med-1` | Opus 5.5 alone, medium | $1.68 | 7 min | 45/45 | Yes | **8.0** (8.0 / 8.0) | 0 | none | opus $1.68 |
| `s2-fable-solo-med-1` | Fable 5.2 alone, medium | $4.72 | 12 min | 45/45 | Yes | **8.2** (8.4 / 8.0) | 0 | none | fable $4.72 |
| `s2-viral-team-1` | Viral team: Fable lead, Opus builder, Sonnet tester, Haiku scout | $3.56 | 17 min | 45/45 | Yes | **8.1** (8.2 / 8.0) | 0 | builder x1, tester x1 | fable $0.77, opus $2.35, sonnet $0.44 |
| `s2-parallel-team-1` | Parallel team: Fable lead writes the contract and integrates, Opus builders work in parallel | $6.54 | 9 min | 45/45 | Yes | **8.1** (8.2 / 8.0) | 0 | builder x4 | fable $2.12, opus $4.42 |

### Full-stack app (API, front end, tests, seed) (`app`)

| Run | Setup (lead and subagents, effort) | Cost | Wall time | Hidden checks | Works | Quality (Opus judge / Sonnet judge) | Fixes needed | Subagent calls | Cost by model |
|---|---|---|---|---|---|---|---|---|---|
| `w2-sonnet-solo-high-1` | Sonnet 5.5 alone, high | $1.54 | 10 min | 77/77 | Yes | **7.8** (7.8 / 7.8) | 0 | none | sonnet $1.54 |
| `w2-opus-solo-med-1` | Opus 5.5 alone, medium | $3.07 | 12 min | 77/77 | Yes | **7.8** (8.0 / 7.6) | 0 | none | opus $3.07 |
| `w2-fable-solo-med-1` | Fable 5.2 alone, medium | $6.43 | 15 min | 77/77 | Yes | **8.2** (8.6 / 7.8) | 0 | none | fable $6.43 |
| `w2-viral-team-1` | Viral team: Fable lead, Opus builder, Sonnet tester, Haiku scout | $8.74 | 45 min | 77/77 | Yes | **7.9** (8.0 / 7.8) | 0 | builder x3, tester x3 | fable $1.77, opus $5.11, sonnet $1.86 |
| `w2-parallel-team-1` | Parallel team: Fable lead writes the contract and integrates, Opus builders work in parallel | $8.30 | 18 min | 77/77 | Yes | **8.0** (8.2 / 7.8) | 0 | builder x5 | fable $3.20, opus $5.10 |

### Eight independent modules (`kit`)

| Run | Setup (lead and subagents, effort) | Cost | Wall time | Hidden checks | Works | Quality (Opus judge / Sonnet judge) | Fixes needed | Subagent calls | Cost by model |
|---|---|---|---|---|---|---|---|---|---|
| `k2-sonnet-solo-high-1` | Sonnet 5.5 alone, high | $1.16 | 7 min | 80/80 | Yes | **8.2** (8.4 / 8.0) | 0 | none | sonnet $1.16 |
| `k2-opus-solo-med-1` | Opus 5.5 alone, medium | $2.27 | 9 min | 80/80 | Yes | **8.6** (8.8 / 8.4) | 0 | none | opus $2.27 |
| `k2-fable-solo-med-1` | Fable 5.2 alone, medium | $3.81 | 9 min | 80/80 | Yes | **8.1** (8.2 / 8.0) | 0 | none | fable $3.81 |
| `k2-viral-team-1` | Viral team: Fable lead, Opus builder, Sonnet tester, Haiku scout | $4.70 | 12 min | 80/80 | Yes | **8.4** (8.6 / 8.2) | 0 | builder x2, tester x3 | fable $1.25, opus $2.17, sonnet $1.28 |
| `k2-parallel-team-1` | Parallel team: Fable lead writes the contract and integrates, Opus builders work in parallel | $4.01 | 6 min | 80/80 | Yes | **8.5** (8.8 / 8.2) | 0 | builder x4 | fable $0.93, opus $3.08 |

### Motion-graphics explainer video (`video`)

| Run | Setup (lead and subagents, effort) | Cost | Wall time | Hidden checks | Works | Quality (Opus judge / Sonnet judge) | Fixes needed | Subagent calls | Cost by model |
|---|---|---|---|---|---|---|---|---|---|
| `v2-sonnet-solo-high-1` | Sonnet 5.5 alone, high | $0.93 | 11 min | 13/13 | Yes | **7.2** (6.8 / 7.6) | 0 | none | sonnet $0.93 |
| `v2-opus-solo-med-1` | Opus 5.5 alone, medium | $1.81 | 11 min | 13/13 | Yes | **7.6** (7.4 / 7.8) | 0 | none | opus $1.81 |
| `v2-fable-solo-med-1` | Fable 5.2 alone, medium | $3.14 | 12 min | 13/13 | Yes | **7.3** (7.6 / 7.0) | 0 | none | fable $3.14 |
| `v2-viral-team-1` | Viral team: Fable lead, Opus builder, Sonnet tester, Haiku scout | $21.73 | 78 min | 13/13 | Yes | **7.6** (- / 7.6) | 0 | builder x1, tester x3 | fable $1.66, opus $17.38, sonnet $2.69 |
| `v2-parallel-team-1` | Parallel team: Fable lead writes the contract and integrates, Opus builders work in parallel | $5.64 | 11 min | 13/13 | Yes | **7.6** (7.8 / 7.4) | 0 | builder x3 | fable $2.49, opus $3.15 |

### Data analysis and report (`data`)

| Run | Setup (lead and subagents, effort) | Cost | Wall time | Hidden checks | Works | Quality (Opus judge / Sonnet judge) | Fixes needed | Subagent calls | Cost by model |
|---|---|---|---|---|---|---|---|---|---|
| `d2-sonnet-solo-high-1` | Sonnet 5.5 alone, high | $0.68 | 4 min | 23/23 | Yes | **8.2** (8.6 / 7.8) | 0 | none | sonnet $0.68 |
| `d2-opus-solo-med-1` | Opus 5.5 alone, medium | $1.73 | 6 min | 23/23 | Yes | **8.0** (8.0 / 8.0) | 0 | none | opus $1.73 |
| `d2-fable-solo-med-1` | Fable 5.2 alone, medium | $3.73 | 7 min | 23/23 | Yes | **8.3** (8.6 / 8.0) | 0 | none | fable $3.73 |
| `d2-viral-team-1` | Viral team: Fable lead, Opus builder, Sonnet tester, Haiku scout | $8.41 | 25 min | 23/23 | Yes | **8.2** (8.2 / 8.2) | 0 | builder x3, tester x4 | fable $2.54, opus $4.75, sonnet $1.12 |
| `d2-parallel-team-1` | Parallel team: Fable lead writes the contract and integrates, Opus builders work in parallel | $5.12 | 9 min | 23/23 | Yes | **8.0** (8.4 / 7.6) | 0 | builder x4 | fable $1.98, opus $3.14 |

## Conclusions

### Does "solo beats the team" still hold?

Yes, on all five jobs. This is what I measured:

- **Every build worked.** All 25 builds passed every hidden check, including the five from Sonnet alone. So teams had no reliability advantage to offer on these jobs: there were no failures for a tester or a second builder to catch.
- **No team beat the best single model on quality.** On each job the best team score was within 0.2 of the best solo score, which is inside the noise: 8.0 against 8.2 on the app, 8.5 against 8.6 on the modules, 8.1 against 8.2 on the website, 7.6 against 7.6 on the video and 8.2 against 8.3 on the data analysis. Averaged over the five jobs, Opus alone, Fable alone and both teams all scored between 8.00 and 8.04.
- **Every team cost more than Opus alone, on every job.** Over the five jobs Opus alone cost $10.57, Fable alone $21.83, the parallel team $29.61 and the viral team $47.14. The viral team cost between 2 and 12 times what Opus alone cost for the same job.
- **The viral team was the slowest setup on every job**, taking 176 minutes in total against 45 for Opus alone. Its builder-then-tester loop is where the time goes: on the app the tester's last regression pass alone ran for 19 minutes.

### Where did a team win, and why?

In one place, on one measure. **The parallel team finished the eight independent modules in 6 minutes, against 9 minutes for Opus alone and for Fable alone**, with the same quality (8.5 against 8.6) and all 80 checks passing. It cost $4.01 against $2.27. The reason is the shape of the job: eight pieces that share nothing, so the lead could hand two modules to each of four builders within the first minute and had almost nothing to integrate afterwards.

That win did not carry over to the job I expected it to. **On the full-stack app the parallel team was slower than both solo models**: 18 minutes against 12 for Opus alone and 15 for Fable alone, at $8.30 against $3.07. Its five builders did run at the same time and were all finished within ten minutes of starting, but the lead spent about four minutes writing the contract before they could start and another four checking and joining the parts afterwards. A single model writes the whole app in 12 minutes, so there was not enough building time for five builders to save more than the coordination cost. The same thing happened on the website, the video and the data analysis, where the parallel team was level with or slower than Opus alone and cost three to four times as much.

So the pattern, in my judgement, is this: **parallel builders save time only when the pieces are truly independent, and they always cost more.** When the parts have to fit together (an API and its front end, pages that share a design, scenes that share a style), the time saved by building in parallel is spent again on the contract and the integration.

### What surprised me

- **The parallel team did not win the big build.** I designed it for exactly that job and expected at least a clear time win. It lost on time, cost and (within noise) quality to Fable alone.
- **Sonnet alone on high was much closer to the top than in round 1.** It passed every hidden check on all five jobs, averaged 7.8 against 8.0 for Opus, cost half as much ($5.26 for all five jobs) and was the fastest setup overall. On the data analysis it scored 8.2 for $0.68, level with setups that cost five to twelve times more. In round 1 it trailed Opus by 0.6 on the game, so I had it down as a budget option; on these jobs it is simply the best value.
- **Fable alone was not clearly better than Opus alone this time.** It scored highest on the app, the website and the data analysis (by 0.2 to 0.4) and lower on the modules and the video, for about twice the money. One run each, so these gaps mean little.
- **The viral team's video cost $21.73.** Almost all of that ($17.38) was its Opus builder, which read about 19 million tokens of context over three rounds of tester feedback. I believe most of that was rendered frames being looked at again and again, though I did not audit it. The result scored slightly below the $1.81 video from Opus alone on the one judge that saw both (7.6 against 7.8).

### What this round still does not cover

The honest limit is size. I tried to make the app a large build and it still took a single model 10 to 15 minutes and under 110,000 tokens of output, far from filling one session. With these models a job has to be many times bigger than that before one session runs out of room or patience, and one comparison of four setups on a job that size would have cost more than this round's whole budget. So I can say that teams did not pay off on jobs of up to roughly 15 minutes of solo work, in five different kinds of work, and that the trend with size on the two jobs designed to split was not in the teams' favour. I cannot say what happens on a job that takes a solo model several hours, or one that does not fit in a single session. Each cell is also a single run, the jobs were all greenfield (nothing was built on a large existing codebase), and quality was scored by models.
