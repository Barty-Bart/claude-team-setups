"""Shared helpers for the round-2 hidden checkers."""
import os, json, time, threading, functools, http.server, socketserver, subprocess
results = []; T0 = time.time()
NODE = os.environ.get("NODE_DIR", "/usr/local")
IMAGE = "ghcr.io/firecrawl/playwright-service:latest"
def add(cid, desc, ok, detail="", core=True):
    st = "skip" if ok is None else ("pass" if ok else "fail")
    results.append({"id": cid, "desc": desc, "status": st, "detail": str(detail)[:300], "core": core})
    print(f"  [{st:4}] {cid} {desc} | {str(detail)[:140]}", flush=True)
def guard(cid, desc, fn, core=True):
    """Run fn() -> (ok, detail) or ok; an exception is a failure."""
    try:
        r = fn(); ok, det = r if isinstance(r, tuple) else (r, "")
        add(cid, desc, bool(ok), det, core)
    except Exception as e:
        add(cid, desc, False, "EXC " + repr(e)[:250], core)
def finish(out, extra=None):
    core = [r for r in results if r["core"]]
    s = {"passed": sum(r["status"] == "pass" for r in core), "total": sum(r["status"] != "skip" for r in core),
         "failed": [r["id"] for r in core if r["status"] == "fail"], "extra_failed": [r["id"] for r in results if not r["core"] and r["status"] == "fail"],
         "skipped": [r["id"] for r in core if r["status"] == "skip"], "secs": round(time.time() - T0)}
    s.update(extra or {})
    json.dump({"summary": s, "results": results}, open(os.path.join(out, "checks.json"), "w"), indent=1)
    print(json.dumps(s))
class _Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve(directory):
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(_Q, directory=directory))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd.server_address[1]
def node_container(mounts, args, network="none", timeout=600, workdir="/w", env=None, name=None, detach=False):
    """Run node inside the sealed base image. mounts: list of 'host:container[:ro]'."""
    cmd = ["docker", "run", "--rm", "--network", network, "--user", "1000:109", "--memory", "3g", "--cpus", "2",
           "-v", "/usr:/usr:ro", "-v", "/etc:/etc:ro", "-v", f"{NODE}:/opt/node:ro", "--tmpfs", "/tmp:exec,mode=1777,size=512m",
           "-e", "HOME=/tmp", "-e", "PATH=/opt/node/bin:/usr/bin:/bin", "-w", workdir]
    for m in mounts: cmd += ["-v", m]
    for k, v in (env or {}).items(): cmd += ["-e", f"{k}={v}"]
    if name: cmd += ["--name", name]
    if detach: cmd += ["-d"]
    cmd += ["--entrypoint", "node", IMAGE] + args
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
