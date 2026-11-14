#!/usr/bin/env python3
"""Hidden checks for the physics job. Usage: check_phys.py <build_dir> <out_dir>
Runs rig.js in a no-network container, then loads the demo page in Chromium (errors, canvas drawn) and takes screenshots."""
import sys, os, json, subprocess, time, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
build, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
H = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(out, "shots"), exist_ok=True)
NODE = os.environ.get("NODE_DIR", "/usr/local")
results = []
def add(cid, desc, ok, detail="", core=True):
    results.append({"id": cid, "desc": desc, "status": "pass" if ok else "fail", "detail": str(detail)[:300], "core": core})
    print(f"  [{'pass' if ok else 'fail'}] {cid} {str(detail)[:130]}", flush=True)
t0 = time.time()
if not os.path.exists(os.path.join(build, "physics.js")):
    add("A0_file", "physics.js exists", False, "missing")
else:
    cmd = ["docker", "run", "--rm", "--network", "none", "--user", "1000:109", "--memory", "3g", "--cpus", "2",
           "-v", "/usr:/usr:ro", "-v", "/etc:/etc:ro", "-v", f"{NODE}:/opt/node:ro", "-v", f"{build}:/w:ro", "-v", f"{H}/rig.js:/rig/rig.js:ro",
           "--tmpfs", "/tmp:exec,mode=1777,size=256m", "-e", "HOME=/tmp", "-e", "PATH=/opt/node/bin:/usr/bin:/bin",
           "-w", "/tmp", "--entrypoint", "node", "ghcr.io/firecrawl/playwright-service:latest", "/rig/rig.js", "/w/physics.js", "all"] + (["xl"] if "--xl" in sys.argv else [])
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=3000)
        for t in json.loads(r.stdout.strip().splitlines()[-1]):
            add(t["id"], t["id"], t["ok"], t.get("detail", ""))
    except Exception as e:
        add("A0_rig", "test rig ran", False, repr(e)[:200])

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Q, directory=build))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
errs, ext = [], []
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(); ctx = b.new_context(viewport={"width": 1280, "height": 720}); page = ctx.new_page()
        page.on("pageerror", lambda e: errs.append(str(e)[:150])); page.on("console", lambda m: errs.append(m.text[:150]) if m.type == "error" else None)
        page.on("request", lambda r: ext.append(r.url[:100]) if not r.url.startswith((f"http://127.0.0.1:{httpd.server_address[1]}/", "data:", "blob:")) else None)
        page.goto(f"http://127.0.0.1:{httpd.server_address[1]}/index.html", wait_until="load"); page.wait_for_timeout(2500)
        has = page.evaluate("() => typeof window.Physics === 'object' && typeof window.Physics.createWorld === 'function'")
        drawn = page.evaluate("""() => { const c = document.querySelector('canvas'); if (!c) return false; try { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4 * 97) s.add(d[i] + ',' + d[i+1] + ',' + d[i+2]); return s.size > 2; } catch (e) { return 'webgl-or-tainted'; } }""")
        page.screenshot(path=os.path.join(out, "shots", "1-demo-start.png"))
        btns = page.evaluate("() => [...document.querySelectorAll('button, select, [role=button]')].length")
        # try each scene control and screenshot a few
        n = 0
        for el in page.query_selector_all("button")[:12]:
            try:
                if el.is_visible(): el.click(timeout=1000); page.wait_for_timeout(1800); n += 1; page.screenshot(path=os.path.join(out, "shots", f"{n+1}-after-button-{n}.png"))
            except Exception: pass
            if n >= 6: break
        add("H1_demo_loads", "demo page loads, defines window.Physics, no errors, no external requests", bool(has) and not errs and not ext, f"Physics={has} errors={errs[:2]} ext={ext[:2]}")
        add("H2_demo_draws", "demo draws on a canvas and has controls", bool(drawn) and btns >= 3, f"drawn={drawn} controls={btns}")
        ctx.close()
        ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2); page = ctx.new_page()
        page.goto(f"http://127.0.0.1:{httpd.server_address[1]}/index.html", wait_until="load"); page.wait_for_timeout(2500)
        sc = page.evaluate("() => ({sw: document.documentElement.scrollWidth, w: innerWidth})")
        page.screenshot(path=os.path.join(out, "shots", "9-phone.png"))
        add("H3_demo_phone", "demo fits a phone screen without sideways scrolling", sc["sw"] <= sc["w"] + 1, sc)
        b.close()
except Exception as e:
    add("H0_demo", "demo page checks ran", False, repr(e)[:200])
if "--xl" in sys.argv:
    u = subprocess.run([sys.executable, os.path.join(H, "unit.py"), build], capture_output=True, text=True).stdout.strip()
    try: uj = json.loads(u.splitlines()[-1])
    except Exception: uj = {"tests": -1, "pass": -1, "fail": -1}
    add("U1_unit_tests", "the project's own unit tests exist and pass (node --test)", uj["tests"] >= 10 and uj["fail"] == 0 and uj["pass"] == uj["tests"], uj)
    rd = os.path.join(build, "README.md")
    add("U2_readme", "README documents the API", os.path.exists(rd) and all(k in open(rd, errors="ignore").read() for k in ("addJoint", "raycast", "toJSON", "applyForce")), os.path.exists(rd))
core = [r for r in results if r["core"]]
summary = {"passed": sum(r["status"] == "pass" for r in core), "total": len(core), "failed": [r["id"] for r in core if r["status"] == "fail"],
           "extra_failed": [], "skipped": [], "secs": round(time.time() - t0)}
json.dump({"summary": summary, "results": results}, open(os.path.join(out, "checks.json"), "w"), indent=1)
print(json.dumps(summary))
