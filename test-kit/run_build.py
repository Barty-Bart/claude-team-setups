#!/usr/bin/env python3
"""Run one sealed build.
Usage: run_build.py <run_id> <job> <setup> [timeout_min]
- new random parent folder ~/zz-<rand>/<rand>/ holding only the job files + the setup's
  .claude/ and CLAUDE.md files; fixed mtimes; no notes from other runs
- new empty CLAUDE_CONFIG_DIR
- Docker container that sees only that folder, the claude binary, node (+playwright) and browsers
- output: runs/<run_id>/{stream.jsonl, meta.json, build/, transcripts/}
"""
import sys, os, json, time, subprocess, signal, shutil, secrets, re

H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(H)
run_id, job, setup = sys.argv[1], sys.argv[2], sys.argv[3]
timeout_min = float(sys.argv[4]) if len(sys.argv) > 4 else 75
OUT = os.path.join(ROOT, "runs", run_id)
if os.path.exists(os.path.join(OUT, "meta.json")):
    sys.exit(f"{run_id} already exists")
os.makedirs(OUT, exist_ok=True)
JOB = os.path.join(H, "jobs", job)
SETUP = os.path.join(H, "setups", setup)
cfgj = json.load(open(os.path.join(SETUP, "setup.json")))
model, effort = cfgj["model"], cfgj.get("effort", "medium")
CFGBASE = os.environ.get("CTS_SCRATCH", os.path.expanduser("~/.cache/claude-team-setups"))
CLAUDE_BIN = os.path.realpath(os.path.expanduser("~/.local/bin/claude"))
NODE_DIR = os.environ.get("NODE_DIR", "/usr/local")
IMAGE = "ghcr.io/firecrawl/playwright-service:latest"  # only its debian base is used
FIXED = 1767225600


def token():
    if os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return os.environ["CLAUDE_CODE_OAUTH_TOKEN"]
    for ln in open(os.path.expanduser(os.environ.get("CTS_ENV_FILE", "~/.env"))):
        m = re.match(r"^(?:export )?CLAUDE_CODE_OAUTH_TOKEN=(.*)$", ln.strip())
        if m:
            return m.group(1).strip().strip("'\"")
    raise SystemExit("no token")


rand = secrets.token_hex(4)
parent = os.path.join(os.path.expanduser("~"), f"zz-{rand}")
proj = os.path.join(parent, "p" + secrets.token_hex(3))
cfg = os.path.join(CFGBASE, f"cc-{secrets.token_hex(4)}")
os.makedirs(parent)
os.makedirs(cfg)
shutil.copytree(os.path.join(JOB, "files"), proj, symlinks=True)
sf = os.path.join(SETUP, "files")
if os.path.isdir(sf):
    shutil.copytree(sf, proj, dirs_exist_ok=True)
os.makedirs(os.path.join(proj, ".claude"), exist_ok=True)
sj = os.path.join(proj, ".claude", "settings.json")
if not os.path.exists(sj):
    json.dump({"model": model}, open(sj, "w"), indent=2)
if os.path.exists(os.path.join(JOB, "git")):  # job wants an existing repo with one commit
    env = dict(os.environ, GIT_AUTHOR_NAME="dev", GIT_AUTHOR_EMAIL="dev@example.com",
               GIT_COMMITTER_NAME="dev", GIT_COMMITTER_EMAIL="dev@example.com",
               GIT_AUTHOR_DATE="2026-01-01T00:00:00Z", GIT_COMMITTER_DATE="2026-01-01T00:00:00Z",
               HOME=parent)
    for c in (["git", "init", "-q", "-b", "main"], ["git", "config", "user.name", "dev"],
              ["git", "config", "user.email", "dev@example.com"], ["git", "add", "-A"],
              ["git", "commit", "-q", "-m", "Initial commit"]):
        subprocess.run(c, cwd=proj, env=env, check=True)
for dp, dns, fns in os.walk(parent):
    for x in dns + fns:
        try:
            os.utime(os.path.join(dp, x), (FIXED, FIXED))
        except Exception:
            pass
prompt = open(os.path.join(JOB, "prompt.txt")).read().strip() + os.environ.get("PROMPT_SUFFIX", "")
cname = f"cc-{rand}"
cmd = ["docker", "run", "--rm", "--name", cname, "--user", "1000:109", "--memory", os.environ.get("RUN_MEM", "9g"), "--cpus", os.environ.get("RUN_CPUS", "4"),
       "-v", "/usr:/usr:ro", "-v", "/etc:/etc:ro",
       "-v", f"{CLAUDE_BIN}:/opt/cc/claude:ro", "-v", f"{NODE_DIR}:/opt/node:ro",
       "-v", os.path.expanduser("~/.cache/ms-playwright") + ":/opt/ms-playwright:ro",
       "-v", f"{parent}:{parent}", "-v", f"{cfg}:/opt/ccfg",
       "--tmpfs", "/tmp:exec,mode=1777,size=2g",
       "-e", f"HOME={parent}", "-e", "CLAUDE_CONFIG_DIR=/opt/ccfg", "-e", "CLAUDE_CODE_OAUTH_TOKEN",
       "-e", "PATH=/opt/cc:/opt/node/bin:/usr/local/bin:/usr/bin:/bin",
       "-e", "NODE_PATH=/opt/node/lib/node_modules",
       "-e", "PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright", "-e", "LANG=C.UTF-8",
       "-e", "CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0",   # headless mode otherwise kills background subagents 10 min after the lead's last turn
       "-w", proj, "--entrypoint", "claude", IMAGE,
       "-p", prompt, "--model", model, "--effort", effort,
       "--dangerously-skip-permissions", "--output-format", "stream-json", "--verbose"]
env = dict(os.environ, CLAUDE_CODE_OAUTH_TOKEN=token())
t0 = time.time()
rc = None
with open(os.path.join(OUT, "stream.jsonl"), "w") as so, open(os.path.join(OUT, "stderr.log"), "w") as se:
    p = subprocess.Popen(cmd, stdout=so, stderr=se, stdin=subprocess.DEVNULL, env=env, start_new_session=True)
    try:
        rc = p.wait(timeout=timeout_min * 60)
    except subprocess.TimeoutExpired:
        subprocess.run(["docker", "kill", cname], capture_output=True)
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except Exception:
            pass
        p.wait()
        rc = "timeout"
secs = time.time() - t0

# parse the stream
result, agents, models_seen, turns = None, [], {}, 0
for ln in open(os.path.join(OUT, "stream.jsonl")):
    try:
        d = json.loads(ln)
    except Exception:
        continue
    if d.get("type") == "result":
        result = d
    elif d.get("type") == "assistant":
        msg = d.get("message") or {}
        if not d.get("parent_tool_use_id"):
            turns += 1
        for c in msg.get("content") or []:
            if isinstance(c, dict) and c.get("type") == "tool_use" and c.get("name") in ("Task", "Agent"):
                i = c.get("input") or {}
                agents.append({"type": i.get("subagent_type"), "desc": i.get("description"),
                               "model": i.get("model"), "bg": i.get("run_in_background")})
meta = {"run_id": run_id, "job": job, "setup": setup, "model": model, "effort": effort,
        "rc": rc, "wall_s": round(secs, 1), "started": int(t0),
        "cost_usd": (result or {}).get("total_cost_usd"),
        "duration_ms": (result or {}).get("duration_ms"),
        "num_turns": (result or {}).get("num_turns"),
        "is_error": (result or {}).get("is_error"),
        "subtype": (result or {}).get("subtype"),
        "modelUsage": {k: {"cost": round(v.get("costUSD", 0), 4), "out": v.get("outputTokens"),
                           "in": v.get("inputTokens"), "cr": v.get("cacheReadInputTokens"),
                           "cw": v.get("cacheCreationInputTokens")}
                       for k, v in ((result or {}).get("modelUsage") or {}).items()},
        "agent_calls": agents, "prompt_suffix": os.environ.get("PROMPT_SUFFIX", ""),
        "final_text": ((result or {}).get("result") or "")[:3000]}
if result is None:
    # timeout or crash: no total_cost_usd, so estimate the cost from the token counts in the stream
    PR = {"fable": (40, 16, 0.2, 0.44), "opus": (20, 8, 0.2, 0.70), "sonnet": (10, 4, 0.1, 0.73), "haiku": (1.4, 0.56, 0.03, 1.12)}   # $/M out, cache write, cache read; output tokens per visible char
    seen, chars = {}, {}
    for ln in open(os.path.join(OUT, "stream.jsonl")):
        try: d = json.loads(ln)
        except Exception: continue
        if d.get("type") == "assistant":
            m = d.get("message") or {}; mod = m.get("model") or "?"
            if m.get("id") and m.get("usage"): seen[m["id"]] = (mod, m["usage"])
            for c in m.get("content") or []:
                if isinstance(c, dict): chars[mod] = chars.get(mod, 0) + len(c.get("text") or "") + len(c.get("thinking") or "") + (len(json.dumps(c.get("input"))) if c.get("type") == "tool_use" else 0)
    mu = {}
    for mod, ch in chars.items():
        fam = [f for f in PR if f in mod]
        if not fam: continue
        po, pw, pr, tpc = PR[fam[0]]
        cr = sum(u.get("cache_read_input_tokens", 0) for m_, u in seen.values() if m_ == mod); cw = sum(u.get("cache_creation_input_tokens", 0) for m_, u in seen.values() if m_ == mod)
        o = int(ch * tpc); mu[mod] = {"cost": round((o * po + cw * pw + cr * pr) / 1e6, 4), "out": o, "in": 0, "cr": cr, "cw": cw}
    meta["modelUsage"] = mu; meta["cost_usd"] = round(sum(v["cost"] for v in mu.values()), 2); meta["cost_estimated"] = True
    meta["note"] = "no result line (stopped at the time limit or crashed); cost is an estimate from the token counts in the stream"
# archive the build and transcripts, then delete the sealed folders
bd = os.path.join(OUT, "build")
shutil.copytree(proj, bd, symlinks=True,
                ignore=shutil.ignore_patterns("node_modules", ".git", "test-results", "playwright-report"))
td = os.path.join(cfg, "projects")
if os.path.isdir(td):
    shutil.copytree(td, os.path.join(OUT, "transcripts"), dirs_exist_ok=True)
shutil.rmtree(parent, ignore_errors=True)
shutil.rmtree(cfg, ignore_errors=True)
json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), indent=1)
if (result or {}).get("is_error") and "limit" in (meta["final_text"] or "").lower():
    # the account's usage limit stopped this run: it is not a valid test of the setup
    dst = os.path.join(ROOT, "runs", "_invalid", f"{run_id}-limit-{int(time.time())}")
    os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.move(OUT, dst)
    print("LIMIT", run_id, meta.get("cost_usd")); sys.exit(42)
with open(os.path.join(ROOT, "runs", "ledger.jsonl"), "a") as f:
    f.write(json.dumps({k: meta[k] for k in ("run_id", "job", "setup", "rc", "wall_s", "cost_usd", "num_turns")}) + "\n")
print(json.dumps({k: meta[k] for k in ("run_id", "job", "setup", "rc", "wall_s", "cost_usd", "num_turns", "modelUsage")}))
print("agents:", [(a["type"]) for a in agents])
