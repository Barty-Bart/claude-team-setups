#!/usr/bin/env python3
"""Blind quality judging. Each build is copied to a random folder with setup files removed, then scored by a
fresh sealed Claude session that sees only that one build, the spec, the rubric and screenshots.
Usage: judge.py <judge_model> <run_id> [<run_id> ...]     (judge_model: opus | sonnet | fable)
Output: judging/<judge_model>/<run_id>/{scores.json,cost.json}
"""
import sys, os, json, time, subprocess, shutil, secrets, re

H = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(H)
JM = {"opus": "claude-opus-5-5", "sonnet": "claude-sonnet-5-5", "fable": "claude-fable-5-2"}
judge = sys.argv[1]; run_ids = sys.argv[2:]
CFGBASE = os.environ.get("CTS_SCRATCH", os.path.expanduser("~/.cache/claude-team-setups"))
CLAUDE_BIN = os.path.realpath(os.path.expanduser("~/.local/bin/claude"))
NODE_DIR = os.environ.get("NODE_DIR", "/usr/local")
IMAGE = "ghcr.io/firecrawl/playwright-service:latest"
LEAK = re.compile(r"fable|opus|sonnet|haiku|claude|anthropic|subagent|sub-agent|\bbuilder\b|\breviewer\b|\bscout\b|\btester\b", re.I)

RUBRIC_GAME = """# Judging rubric (blind)
You are one of several independent judges. You see ONE build of the game specified in SPEC.md. You do not know who made it.
Evidence: source in `code/` (entry `code/index.html`), screenshots from a scripted play session in `shots/` (look at every image),
and you may run the game yourself with Node + Playwright (`require('playwright')`, Chromium installed) for a few minutes if useful.
Functional correctness against the spec is measured separately by automated checks, so do not re-test the spec line by line.
Judge how GOOD the build is.

Score each dimension from 1 to 10. Use the whole scale. Anchors: 2 = broken or placeholder, 4 = works but crude,
6 = decent, clearly a finished small game, 8 = very good, would impress in a game jam, 10 = exceptional, hard to improve.
- visual: art direction, readability, consistency, HUD and menu design, phone layout.
- feel: feedback and juice (hit flashes, particles, screen shake, damage numbers, sound design, animation, telegraphing).
- depth: enemy variety and behaviour, upgrade variety and meaningful choices, wave design and difficulty curve, extras that add play value.
- ux: clarity of screens and controls, onboarding, touch usability, small details (pause handling, resize, accessibility).
- code: structure, readability, sound architecture (fixed timestep or dt handling, separation of logic/render), maintainability, absence of obvious bugs.
Write `scores.json` in the current folder, exactly:
{"visual": n, "feel": n, "depth": n, "ux": n, "code": n, "defects": ["short description of each real bug or visible flaw you found"], "one_line": "one sentence verdict"}
Then stop. Do not modify anything under code/.
"""
RUBRIC_FEATURE = """# Judging rubric (blind)
You are one of several independent judges. A developer was given an existing game (original in `starter/`) and asked to implement
MILESTONE-2.md (pause menu + boss fights). You see ONE resulting project in `code/` and the full change as `diff.patch`.
You do not know who made it. Evidence: the diff, the code, screenshots from a scripted play session in `shots/` (look at every image),
and you may run the game with Node + Playwright (`require('playwright')`, Chromium installed) or run `node --test` for a few minutes if useful.
Functional correctness against the milestone is measured separately by automated checks, so do not re-test it line by line.
Judge how GOOD the change is.

Score each dimension from 1 to 10. Use the whole scale. Anchors: 2 = broken or placeholder, 4 = works but crude,
6 = decent and mergeable with comments, 8 = very good, would merge as is, 10 = exceptional.
- boss: quality of the boss fight as game design (distinct attacks, telegraphing, phase 2, health bar, balance, spectacle).
- pause: quality of the pause feature (menu design, correctness of freezing, edge cases such as focus loss, held keys, audio).
- fit: how well the change fits the existing project (follows its structure and conventions, pure rules kept pure, no needless churn or duplication, README updated).
- tests: quality and coverage of the new unit tests for the new rules.
- code: readability, correctness and maintainability of the new code; absence of obvious bugs or regressions.
Write `scores.json` in the current folder, exactly:
{"boss": n, "pause": n, "fit": n, "tests": n, "code": n, "defects": ["short description of each real bug or flaw you found"], "one_line": "one sentence verdict"}
Then stop. Do not modify anything under code/ or starter/.
"""

RUBRIC_BUGFIX = """# Judging rubric (blind)
You are one of several independent judges. A developer was given an existing game (original in `starter/`) and the player bug
reports in BUGS.md, and was asked to find and fix the cause of each one. You see ONE resulting project in `code/` and the full
change as `diff.patch`. You do not know who made it. You may run the game with Node + Playwright (`require('playwright')`,
Chromium installed) or run `node --test` for a few minutes if useful.
Whether each bug is actually fixed is measured separately by automated checks, so do not re-test that. Judge how GOOD the fixes are.

Score each dimension from 1 to 10. Use the whole scale. Anchors: 2 = wrong or harmful, 4 = papers over the symptom,
6 = correct but rough, 8 = very good, would merge as is, 10 = exceptional.
- rootcause: does each fix address the real cause rather than a symptom, and is the cause explained (commit notes, comments, report)?
- minimal: is the change focused, with no unrelated rewrites, no behaviour changes nobody asked for, no leftover debug code?
- tests: quality of the regression tests added for the fixes (do they fail on the old code and pass on the new?).
- safety: risk of regressions or new bugs introduced by the change; edge cases handled.
- code: readability and fit with the existing project's conventions.
Write `scores.json` in the current folder, exactly:
{"rootcause": n, "minimal": n, "tests": n, "safety": n, "code": n, "defects": ["short description of each real problem you found"], "one_line": "one sentence verdict"}
Then stop. Do not modify anything under code/ or starter/.
"""

RUBRIC_PHYS = """# Judging rubric (blind)
You are one of several independent judges. You see ONE implementation of the physics engine specified in SPEC.md, in `code/`
(library `code/physics.js`, demo `code/index.html`), plus screenshots of the demo page in `shots/` (look at every image).
You do not know who made it. You may run it with Node, and drive the demo with Playwright (`require('playwright')`, Chromium installed),
for a few minutes if useful. Functional correctness against the spec is measured separately by an automated test rig, so do not
re-test the spec line by line. Judge how GOOD the work is.

Score each dimension from 1 to 10. Use the whole scale. Anchors: 2 = broken or placeholder, 4 = works but crude,
6 = decent, 8 = very good, 10 = exceptional, comparable to a well-known open-source engine.
- solver: soundness and sophistication of the simulation core (integration, collision detection, contact solver, stacking stability, tunnelling prevention, broadphase).
- robust: handling of edge cases and bad input, numerical safety, determinism, absence of obvious bugs.
- demo: quality of the demo page (scenes, interaction, visual clarity, phone usability).
- verify: evidence of verification that ships with the code (tests, checks, documented limits) and quality of any documentation.
- code: readability, structure and maintainability.
Write `scores.json` in the current folder, exactly:
{"solver": n, "robust": n, "demo": n, "verify": n, "code": n, "defects": ["short description of each real bug or flaw you found"], "one_line": "one sentence verdict"}
Then stop. Do not modify anything under code/.
"""

RUBRIC_SITE = """# Judging rubric (blind)
You are one of several independent judges. You see ONE build of the multi-page website specified in BRIEF.md, in `code/`. You do not know who made it.
Evidence: the source, full-page screenshots of the pages on desktop and phone in `shots/` (look at every image), and you may open the pages yourself
with Node + Playwright (`require('playwright')`, Chromium installed) for a few minutes if useful.
Functional correctness against the brief is measured separately by automated checks, so do not re-test the brief line by line. Judge how GOOD the site is.

Score each dimension from 1 to 10. Use the whole scale. Anchors: 2 = broken or placeholder, 4 = works but crude, 6 = decent, a small business could launch it,
8 = very good, looks like the work of a good design studio, 10 = exceptional.
- design: visual identity, typography, colour, imagery made in code, how distinctive and appealing it looks.
- layout: consistency across pages, spacing and hierarchy, how well it adapts to a phone.
- content: quality, completeness and usefulness of the copy (home, services, hire, about, journal posts).
- ux: navigation, the hire calculator, the contact form and its error messages, accessibility details (focus, contrast, semantics).
- code: clean semantic HTML, well-organised CSS and JavaScript, no needless duplication, maintainability.
Write `scores.json` in the current folder, exactly:
{"design": n, "layout": n, "content": n, "ux": n, "code": n, "defects": ["short description of each real bug or visible flaw you found"], "one_line": "one sentence verdict"}
Then stop. Do not modify anything under code/.
"""
RUBRIC_APP = """# Judging rubric (blind)
You are one of several independent judges. You see ONE build of the help-desk application specified in SPEC.md, in `code/`. You do not know who made it.
Evidence: the source, screenshots of the running front end on desktop and phone in `shots/` (look at every image), and you may run it yourself
(`PORT=4000 DATA_DIR=/tmp/dd node server.js`, `node --test`, Node + Playwright with Chromium) for a few minutes if useful.
Functional correctness against the spec is measured separately by automated checks, so do not re-test the spec line by line. Judge how GOOD the work is.

Score each dimension from 1 to 10. Use the whole scale. Anchors: 2 = broken or placeholder, 4 = works but crude, 6 = decent, 8 = very good, would pass a careful code review, 10 = exceptional.
- backend: design and robustness of the server (routing, validation, auth and password handling, persistence, error handling, security).
- frontend: how good the interface is to use and to look at, on desktop and phone (clarity, feedback, empty and error states, polish).
- tests: quality and coverage of the automated test suite.
- docs: README, API reference and the seed script and its demo data.
- code: structure, readability and consistency across the whole project (do the parts fit together as one codebase?).
Write `scores.json` in the current folder, exactly:
{"backend": n, "frontend": n, "tests": n, "docs": n, "code": n, "defects": ["short description of each real bug or flaw you found"], "one_line": "one sentence verdict"}
Then stop. Do not modify anything under code/.
"""
RUBRIC_KIT = """# Judging rubric (blind)
You are one of several independent judges. You see ONE implementation of the eight-module toolkit specified in SPEC.md, in `code/`. You do not know who made it.
You may run it with Node (`node --test`, or your own small scripts) for a few minutes if useful.
Functional correctness against the spec is measured separately by an automated test rig, so do not re-test the spec line by line. Judge how GOOD the work is.

Score each dimension from 1 to 10. Use the whole scale. Anchors: 2 = broken or placeholder, 4 = works but crude, 6 = decent, 8 = very good, would pass a careful code review, 10 = exceptional.
- robustness: handling of edge cases and bad input beyond the obvious, quality of error messages, absence of bugs you can find.
- tests: quality and coverage of the shipped tests (edge cases, error cases, not just the happy path).
- docs: README and in-code documentation: accurate, complete, with useful examples.
- consistency: do the eight modules feel like one library (naming, error style, option handling, file layout)?
- code: readability, structure and maintainability of the implementations.
Write `scores.json` in the current folder, exactly:
{"robustness": n, "tests": n, "docs": n, "consistency": n, "code": n, "defects": ["short description of each real bug or flaw you found"], "one_line": "one sentence verdict"}
Then stop. Do not modify anything under code/.
"""
RUBRIC_VIDEO = """# Judging rubric (blind)
You are one of several independent judges. You see ONE motion-graphics explainer video made for BRIEF.md. You do not know who made it.
Evidence in `shots/` (look at every image): two contact sheets with one frame per second (time stamps in the corner), ten full frames, and five
"motion strips" that each show six frames 0.1 seconds apart so you can see how things move. The video itself is `code/out/explainer.mp4`;
ffmpeg is installed, so you can extract more frames yourself (for example `ffmpeg -ss 12.3 -i code/out/explainer.mp4 -frames:v 1 f.png`) to check
anything you are unsure about. The source is in `code/`.
Technical requirements (resolution, length, codec) are measured separately. Judge how GOOD the video is.

Score each dimension from 1 to 10. Use the whole scale. Anchors: 2 = broken or placeholder, 4 = works but looks like animated slides,
6 = decent, could be posted, 8 = very good, looks like professional motion design, 10 = exceptional.
- design: visual style, typography, colour, composition, how good individual frames look.
- motion: quality of the animation: easing, transitions between scenes, whether movement is purposeful and continuous or just fades and static slides.
- clarity: can a viewer follow the story with the sound off? Pacing, readability and time on screen of the text, and whether the numbers and the chart are right.
- polish: consistency from scene to scene, absence of glitches (overlapping or cut-off text, empty frames, jumps, elements stuck mid-animation).
- code: structure and readability of the source, and how easy it would be to change the script or re-render.
Write `scores.json` in the current folder, exactly:
{"design": n, "motion": n, "clarity": n, "polish": n, "code": n, "defects": ["short description of each real bug or visible flaw you found"], "one_line": "one sentence verdict"}
Then stop. Do not modify anything under code/.
"""
RUBRIC_DATA = """# Judging rubric (blind)
You are one of several independent judges. You see ONE analyst's work for BRIEF.md: `code/report.html`, `code/answers.json` and the analysis code,
with the raw data in `code/data/`. You do not know who made it. Screenshots of the report, top to bottom, are in `shots/` (look at every image).
You may open the report with Node + Playwright (Chromium installed) or run the code for a few minutes if useful.
Whether the twelve answers are numerically right is measured separately, so do not recompute them. Judge how GOOD the work is.

Score each dimension from 1 to 10. Use the whole scale. Anchors: 2 = broken or placeholder, 4 = a dump of numbers, 6 = decent, usable by the reader,
8 = very good, what a strong analyst would hand to a chief executive, 10 = exceptional.
- insight: does it find and explain what matters (beyond restating the twelve answers), and are the recommendations specific and tied to the data?
- charts: are the charts well chosen, correctly drawn, labelled and easy to read?
- writing: is it clear, well organised and right for a busy non-technical reader?
- rigour: cleaning notes with counts, sound method, honest caveats, numbers in the text consistent with each other and with answers.json.
- code: readability and reproducibility of the analysis code.
Write `scores.json` in the current folder, exactly:
{"insight": n, "charts": n, "writing": n, "rigour": n, "code": n, "defects": ["short description of each real problem you found"], "one_line": "one sentence verdict"}
Then stop. Do not modify anything under code/.
"""


def token():
    if os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return os.environ["CLAUDE_CODE_OAUTH_TOKEN"]
    for ln in open(os.path.expanduser(os.environ.get("CTS_ENV_FILE", "~/.env"))):
        m = re.match(r"^(?:export )?CLAUDE_CODE_OAUTH_TOKEN=(.*)$", ln.strip())
        if m: return m.group(1).strip().strip("'\"")


def one(run_id):
    outd = os.path.join(ROOT, "judging", judge, run_id)
    if os.path.exists(os.path.join(outd, "cost.json")):
        print("skip (done)", run_id); return
    meta = json.load(open(os.path.join(ROOT, "runs", run_id, "meta.json")))
    feature = meta["job"] in ("feature", "bugfix"); job = meta["job"]
    rand = secrets.token_hex(4); parent = os.path.join(os.path.expanduser("~"), f"zz-{rand}"); work = os.path.join(parent, "j" + secrets.token_hex(3))
    cfg = os.path.join(CFGBASE, f"cc-{secrets.token_hex(4)}")
    os.makedirs(work); os.makedirs(cfg)
    ign = shutil.ignore_patterns(".claude", "CLAUDE.md", "CONTRACT.md", ".git", "node_modules", "*.log", "test-results")
    shutil.copytree(os.path.join(ROOT, "runs", run_id, "build"), os.path.join(work, "code"), ignore=ign)
    sh = os.path.join(ROOT, "runs", run_id, "checks", "shots")
    if os.path.isdir(sh) and os.listdir(sh): shutil.copytree(sh, os.path.join(work, "shots"))
    for f in ("SPEC.md", "MILESTONE-2.md", "BUGS.md", "BRIEF.md"):
        p = os.path.join(work, "code", f)
        if os.path.exists(p): shutil.move(p, os.path.join(work, f))
    leaks = []
    for dp, dns, fns in os.walk(os.path.join(work, "code")):
        for fn in fns:
            fp = os.path.join(dp, fn)
            try: txt = open(fp, encoding="utf-8", errors="ignore").read()
            except Exception: continue
            for m in LEAK.finditer(txt):
                leaks.append((os.path.relpath(fp, work), txt[max(0, m.start() - 40):m.end() + 40].replace("\n", " ")))
    if feature:
        st = os.path.join(H, "jobs", job, "files")
        shutil.copytree(st, os.path.join(work, "starter"), ignore=shutil.ignore_patterns("SPEC.md", "MILESTONE-2.md", "BUGS.md", ".git"))
        d = subprocess.run(["git", "diff", "--no-index", "--stat", "--patch", "starter", "code"], cwd=work, capture_output=True, text=True).stdout
        open(os.path.join(work, "diff.patch"), "w").write(d)
    open(os.path.join(work, "RUBRIC.md"), "w").write({"feature": RUBRIC_FEATURE, "bugfix": RUBRIC_BUGFIX, "phys": RUBRIC_PHYS, "physxl": RUBRIC_PHYS, "site": RUBRIC_SITE, "app": RUBRIC_APP, "kit": RUBRIC_KIT, "video": RUBRIC_VIDEO, "data": RUBRIC_DATA}.get(job, RUBRIC_GAME))
    prompt = "Read RUBRIC.md and judge the build in this folder exactly as it says. Finish by writing scores.json."
    cmd = ["docker", "run", "--rm", "--name", f"jj-{rand}", "--user", "1000:109", "--memory", "5g", "--cpus", "2",
           "-v", "/usr:/usr:ro", "-v", "/etc:/etc:ro", "-v", f"{CLAUDE_BIN}:/opt/cc/claude:ro", "-v", f"{NODE_DIR}:/opt/node:ro",
           "-v", os.path.expanduser("~/.cache/ms-playwright") + ":/opt/ms-playwright:ro", "-v", f"{parent}:{parent}", "-v", f"{cfg}:/opt/ccfg",
           "--tmpfs", "/tmp:exec,mode=1777,size=1g", "-e", f"HOME={parent}", "-e", "CLAUDE_CONFIG_DIR=/opt/ccfg",
           "-e", "CLAUDE_CODE_OAUTH_TOKEN", "-e", "PATH=/opt/cc:/opt/node/bin:/usr/local/bin:/usr/bin:/bin",
           "-e", "NODE_PATH=/opt/node/lib/node_modules", "-e", "PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright", "-e", "LANG=C.UTF-8",
           "-w", work, "--entrypoint", "claude", IMAGE, "-p", prompt, "--model", JM[judge], "--effort", "medium",
           "--dangerously-skip-permissions", "--output-format", "json"]
    t0 = time.time()
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, env=dict(os.environ, CLAUDE_CODE_OAUTH_TOKEN=token()), timeout=1500)
        res = json.loads(r.stdout.strip().splitlines()[-1])
    except Exception as e:
        subprocess.run(["docker", "kill", f"jj-{rand}"], capture_output=True); res = {"error": repr(e)[:300]}
    if res.get("is_error") or res.get("error") or not os.path.exists(os.path.join(work, "scores.json")):
        print("JUDGE FAILED", run_id, judge, str(res.get("result") or res.get("error"))[:150], flush=True)
        shutil.rmtree(parent, ignore_errors=True); shutil.rmtree(cfg, ignore_errors=True); return
    os.makedirs(outd, exist_ok=True)
    scores = None
    try: scores = json.load(open(os.path.join(work, "scores.json")))
    except Exception as e: scores = {"error": repr(e)}
    json.dump(scores, open(os.path.join(outd, "scores.json"), "w"), indent=1)
    json.dump({"cost_usd": res.get("total_cost_usd"), "secs": round(time.time() - t0), "turns": res.get("num_turns"),
               "leaks": leaks[:10], "err": res.get("error")}, open(os.path.join(outd, "cost.json"), "w"), indent=1)
    shutil.rmtree(parent, ignore_errors=True); shutil.rmtree(cfg, ignore_errors=True)
    print(run_id, judge, {k: v for k, v in scores.items() if k not in ("defects",)}, "cost", res.get("total_cost_usd"), "leaks", len(leaks), flush=True)


for rid in run_ids:
    one(rid)
