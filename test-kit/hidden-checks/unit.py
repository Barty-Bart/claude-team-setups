#!/usr/bin/env python3
"""Run the project's unit tests (node --test) in a no-network container. Usage: unit.py <build_dir> -> prints JSON."""
import sys, os, subprocess, re, json
b = os.path.abspath(sys.argv[1])
NODE = os.environ.get("NODE_DIR", "/usr/local")
cmd = ["docker", "run", "--rm", "--network", "none", "--user", "1000:109", "--memory", "2g", "--cpus", "2",
       "-v", "/usr:/usr:ro", "-v", "/etc:/etc:ro", "-v", f"{NODE}:/opt/node:ro", "-v", f"{b}:/w:ro",
       "--tmpfs", "/tmp:exec,mode=1777,size=512m", "-e", "HOME=/tmp", "-e", "PATH=/opt/node/bin:/usr/bin:/bin",
       "-w", "/w", "--entrypoint", "node", "ghcr.io/firecrawl/playwright-service:latest", "--test"]
try:
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300); o = r.stdout + r.stderr
except subprocess.TimeoutExpired:
    o = "TIMEOUT"
g = lambda k: int((re.search(rf"ℹ {k} (\d+)", o) or [0, -1])[1])
print(json.dumps({"tests": g("tests"), "pass": g("pass"), "fail": g("fail")}))
