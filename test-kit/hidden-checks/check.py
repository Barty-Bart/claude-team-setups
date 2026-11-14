#!/usr/bin/env python3
"""Hidden acceptance checks (never shown to building models).
Usage: check.py <build_dir> <out_dir> [--feature]
Writes <out_dir>/checks.json and screenshots in <out_dir>/shots/.
"""
import sys, os, json, time, threading, functools, http.server, socketserver, re, math, traceback
from playwright.sync_api import sync_playwright

build, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
FEATURE = "--feature" in sys.argv
os.makedirs(os.path.join(out, "shots"), exist_ok=True)

# ---------- static server ----------
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Q, directory=build))
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{PORT}/index.html"

results, errors_seen, ext_requests = [], [], []
def add(cid, desc, ok, detail="", core=True):
    status = "skip" if ok is None else ("pass" if ok else "fail")
    results.append({"id": cid, "desc": desc, "status": status, "detail": str(detail)[:300], "core": core})
    print(f"  [{status:4}] {cid} {desc} {str(detail)[:120]}", flush=True)

def group(fn):
    try:
        fn()
    except Exception as e:
        tb = traceback.format_exc().strip().splitlines()
        add("ERR-" + fn.__name__, f"check group {fn.__name__} aborted", False, f"{e!r} @ {tb[-3:]}"[:300])

SAMPLER = r"""
window.__qa = {waves:{}, log:[], errs:[], shopEnemies:null};
(function(){
  const Q = window.__qa; let prev = {}, prevT = 0, last = null;
  setInterval(()=>{
    let s; try { s = window.game && window.game.getState && window.game.getState(); } catch(e){ if(Q.errs.length<5) Q.errs.push(String(e)); return; }
    if(!s) return;
    const t = performance.now();
    if (s.screen !== last) {
      Q.log.push({t, screen:s.screen, wave:s.wave, n:(s.enemies||[]).length, coins:s.coins, score:s.score});
      if (s.screen==='shop' && last==='playing') { Q.shopEnemies = (s.enemies||[]).length; const pw = Q.waves[s.wave]; if (pw) { pw.shopCoinStep = s.coins - pw.lastCoins; pw.shopScoreStep = s.score - pw.lastScore; } }
      last = s.screen;
    }
    if (s.screen === 'playing' && Array.isArray(s.enemies)) {
      const w = Q.waves[s.wave] = Q.waves[s.wave] || {ids:{}, types:{}, maxAlive:0, minHp:Infinity, maxCoinStep:0, maxScoreStep:0, lastCoins:s.coins, lastScore:s.score, minCoins:s.coins};
      w.maxAlive = Math.max(w.maxAlive, s.enemies.length);
      if (s.player) w.minHp = Math.min(w.minHp, s.player.hp);
      w.maxCoinStep = Math.max(w.maxCoinStep, s.coins - w.lastCoins); w.lastCoins = s.coins;
      w.maxScoreStep = Math.max(w.maxScoreStep, s.score - w.lastScore); w.lastScore = s.score;
      const dt = (t - prevT)/1000, cur = {};
      for (const e of s.enemies) {
        if (!(e.id in w.ids)) w.ids[e.id] = {type:e.type, hp0:e.hp};
        const ty = w.types[e.type] = w.types[e.type] || {hp0:e.hp, sp:[]};
        const p = prev[e.id];
        if (p && dt>0 && dt<0.2 && ty.sp.length<600) ty.sp.push(Math.hypot(e.x-p.x, e.y-p.y)/dt);
        cur[e.id] = {x:e.x, y:e.y};
      }
      prev = cur;
    } else prev = {};
    prevT = t;
  }, 50);
})();
"""
BUTTONS = r"""() => [...document.querySelectorAll('button')].map((b,i)=>{
  const r=b.getBoundingClientRect(), cs=getComputedStyle(b);
  let vis = r.width>4 && r.height>4 && cs.visibility!=='hidden' && cs.display!=='none' && parseFloat(cs.opacity)>0.05;
  const cx=r.left+r.width/2, cy=r.top+r.height/2;
  if (vis) { if (cx<0||cy<0||cx>innerWidth||cy>innerHeight) vis=false; else { const el=document.elementFromPoint(cx,cy); vis = !!el && (el===b || b.contains(el)); } }
  return {i, text:(b.innerText||b.textContent||'').replace(/\s+/g,' ').trim().slice(0,80), x:cx, y:cy, w:r.width, h:r.height, vis, disabled:b.disabled};
}).filter(b=>b.vis)"""
STATE = "() => { try { return JSON.parse(JSON.stringify(window.game.getState())); } catch(e) { return {__err:String(e)}; } }"

def st(page):
    try:
        return page.evaluate(STATE) or {}
    except Exception as e:
        return {"__err": str(e)}

def new_ctx(browser, mobile=False, w=1280, h=720):
    if mobile:
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
    else:
        ctx = browser.new_context(viewport={"width": w, "height": h})
    ctx.add_init_script(SAMPLER)
    return ctx

def new_page(ctx):
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors_seen.append("pageerror: " + str(e)[:200]))
    page.on("console", lambda m: errors_seen.append("console.error: " + m.text[:200]) if m.type == "error" else None)
    def onreq(r):
        u = r.url
        if not (u.startswith(f"http://127.0.0.1:{PORT}/") or u.startswith(("data:", "blob:", "file:", "about:"))):
            ext_requests.append(u[:150])
    page.on("request", onreq)
    return page

def load(page, params=""):
    page.goto(BASE + params, wait_until="load")
    try:
        page.wait_for_function("() => window.game && typeof window.game.getState === 'function'", timeout=8000)
    except Exception:
        pass
    page.wait_for_timeout(400)

def wait_screen(page, names, timeout=10):
    if isinstance(names, str): names = [names]
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = st(page)
        if s.get("screen") in names:
            return s
        page.wait_for_timeout(80)
    return st(page)

def start(page, params="?god=1"):
    load(page, params)
    page.keyboard.press("Enter")
    return wait_screen(page, "playing", 6)

def release(page, held):
    for k in list(held):
        try: page.keyboard.up(k)
        except Exception: pass
    held.clear()

def drive(page, until, timeout=120, chase=True, on_tick=None):
    """Chase the nearest enemy with WASD until until(state) is true. Returns the last state."""
    held, t0, s = set(), time.time(), {}
    while time.time() - t0 < timeout:
        s = st(page)
        if until(s):
            break
        want = set()
        if chase and s.get("screen") == "playing" and s.get("enemies") and s.get("player"):
            p = s["player"]; a = s.get("arena") or {}
            thr = max(a.get("width", 800), a.get("height", 600)) * 0.015
            e = min(s["enemies"], key=lambda e: (e["x"] - p["x"]) ** 2 + (e["y"] - p["y"]) ** 2)
            dx, dy = e["x"] - p["x"], e["y"] - p["y"]
            if dx > thr: want.add("d")
            elif dx < -thr: want.add("a")
            if dy > thr: want.add("s")
            elif dy < -thr: want.add("w")
        for k in held - want: page.keyboard.up(k)
        for k in want - held: page.keyboard.down(k)
        held = want
        if on_tick: on_tick(s)
        page.wait_for_timeout(110)
    release(page, held)
    if s.get("screen") in ("shop", "gameover"):
        page.wait_for_timeout(800)   # let entry animations / tap guards finish
        s = st(page)
    return s

def buttons(page):
    try: return page.evaluate(BUTTONS)
    except Exception: return []

def shot(page, name):
    try: page.screenshot(path=os.path.join(out, "shots", name + ".png"))
    except Exception as e: print("shot fail", name, e)

def num_in_text(page, n):
    try:
        txt = page.evaluate("() => document.body.innerText")
    except Exception:
        return False
    return str(int(n)) in re.sub(r"[,\.\s '_]", "", txt)

CONT = re.compile(r"continue|next|start|wave|ready|fight|begin|skip|done|go\b|play|resume|proceed", re.I)
qa = lambda page: page.evaluate("() => JSON.parse(JSON.stringify(window.__qa))")
shared = {}

# =====================================================================
def g_load(browser):
    ctx = new_ctx(browser); page = new_page(ctx)
    load(page)
    s = st(page)
    add("L1", "window.game.getState() exists and returns an object", "__err" not in s and isinstance(s, dict) and bool(s), s.get("__err", ""))
    keys = ["screen", "wave", "score", "highScore", "coins", "player", "enemies", "upgrades", "arena"]
    miss = [k for k in keys if k not in s]
    add("L2", "state has all required keys", not miss, f"missing {miss}")
    add("L3", "title screen: screen=='title' and wave==0", s.get("screen") == "title" and s.get("wave") == 0, f"{s.get('screen')} wave={s.get('wave')}")
    a = s.get("arena") or {}
    add("L4", "arena has positive width and height", isinstance(a.get("width"), (int, float)) and a.get("width", 0) > 0 and a.get("height", 0) > 0, a)
    b = buttons(page)
    add("L5", "title screen has a visible <button>", len(b) >= 1, [x["text"] for x in b])
    shot(page, "1-title")
    ctx.close()
    # file:// load
    ctx = new_ctx(browser); page = new_page(ctx)
    try:
        page.goto("file://" + os.path.join(build, "index.html"), wait_until="load")
        page.wait_for_timeout(1200)
        s = st(page)
        page.keyboard.press("Enter"); page.wait_for_timeout(1500)
        s2 = st(page)
        add("L6", "works when opened via file:// (title, then Enter starts)", s.get("screen") == "title" and s2.get("screen") == "playing", f"{s.get('screen')}/{s2.get('screen')} {s.get('__err','')}")
    finally:
        ctx.close()

def g_play(browser):
    ctx = new_ctx(browser); page = new_page(ctx)
    load(page, "?god=1")
    for _ in range(4): page.keyboard.press("Enter")   # impatient player
    s = wait_screen(page, "playing", 6)
    add("P1", "Enter on the title starts wave 1", s.get("screen") == "playing" and s.get("wave") == 1, f"{s.get('screen')} wave={s.get('wave')}")
    p, a = s.get("player") or {}, s.get("arena") or {}
    add("P2", "player starts inside the arena with full HP", 0 <= p.get("x", -1) <= a.get("width", 0) and 0 <= p.get("y", -1) <= a.get("height", 0) and p.get("hp", 0) > 0 and p.get("hp") == p.get("maxHp"), p)
    a_ = a or {'width': 1}
    # enemies spawn
    t0 = time.time(); s = st(page)
    while time.time() - t0 < 12 and not s.get("enemies"):
        page.wait_for_timeout(150); s = st(page)
    en = s.get("enemies") or []
    okshape = bool(en) and all(isinstance(e.get("type"), str) and all(isinstance(e.get(k), (int, float)) for k in ("x", "y", "hp")) and "id" in e for e in en)
    add("P6", "enemies spawn with id/type/x/y/hp", okshape, en[:2])
    # enemies approach a standing player
    def mind(s):
        p = s.get("player") or {}
        return min([math.hypot(e["x"] - p["x"], e["y"] - p["y"]) for e in s.get("enemies") or []] or [1e9])
    d0 = mind(st(page)); best = d0
    for _ in range(25):
        page.wait_for_timeout(120); best = min(best, mind(st(page)))
    add("P7", "enemies move toward the player", best < d0 - 1e-6 or d0 < 0.05 * a_.get("width", 1), f"{d0:.1f}->{best:.1f}")
    shot(page, "2-wave1")
    # auto-fire kills things without any aiming input
    s0 = st(page); t0 = time.time(); s1 = s0
    while time.time() - t0 < 30 and not (s1.get("score", 0) > 0):
        page.wait_for_timeout(200); s1 = st(page)
    add("P8", "auto-fire kills enemies with no aiming input (score rises)", s1.get("score", 0) > 0, f"score {s0.get('score')}->{s1.get('score')} in {time.time()-t0:.0f}s")
    add("P9", "kills give coins", s1.get("coins", 0) > 0 or st(page).get("coins", 0) > 0, s1.get("coins"))
    # clear wave 1 (chasing) -> shop
    s = drive(page, lambda s: s.get("screen") != "playing", 150)
    add("W1", "clearing wave 1 opens the shop", s.get("screen") == "shop", s.get("screen"))
    q = qa(page)
    add("W2", "no living enemies when the wave ends", q.get("shopEnemies") == 0, q.get("shopEnemies"))
    add("G1", "?god=1: player takes no damage", q["waves"].get("1", {}).get("minHp") is not None and q["waves"].get("1", {}).get("minHp", 0) >= p.get("maxHp", 1), q["waves"].get("1", {}).get("minHp"))
    shot(page, "3-shop")
    s = st(page)
    add("S1", "shop offers at least four upgrades (state.upgrades)", isinstance(s.get("upgrades"), dict) and len(s["upgrades"]) >= 4, list((s.get("upgrades") or {}).keys()))
    b = buttons(page)
    add("S2", "shop has at least five visible <button>s (4 upgrades + continue)", len(b) >= 5, [x["text"][:20] for x in b])
    # Enter -> wave 2
    page.keyboard.press("Enter"); s = wait_screen(page, "playing", 6)
    add("S3", "Enter in the shop starts wave 2", s.get("screen") == "playing" and s.get("wave") == 2, f"{s.get('screen')} wave={s.get('wave')}")
    s = drive(page, lambda s: s.get("screen") != "playing", 180)
    if s.get("screen") == "shop":
        page.keyboard.press("Enter"); wait_screen(page, "playing", 6)
        s = drive(page, lambda s: s.get("screen") != "playing", 200)
    q = qa(page); W = q["waves"]
    types = set()
    for w in ("1", "2", "3"):
        types |= set((W.get(w) or {}).get("types", {}).keys())
    add("W3", "at least three enemy types seen by the end of wave 3", len(types) >= 3 and s.get("wave") == 3, f"{sorted(types)} reached wave {s.get('wave')}")
    def tot(w):
        ids = (W.get(w) or {}).get("ids", {})
        return len(ids), sum(v["hp0"] for v in ids.values())
    n1, h1 = tot("1"); n3, h3 = tot("3")
    add("W4", "wave 3 is harder than wave 1 (more enemies or more total HP)", n3 > 0 and (n3 > n1 or h3 > h1), f"w1 n={n1} hp={h1:.0f}; w3 n={n3} hp={h3:.0f}")
    shared["types_early"] = {w: {t: {"hp0": v["hp0"], "speed": (sorted(v["sp"])[len(v["sp"]) // 2] if v["sp"] else 0)} for t, v in (W.get(w) or {}).get("types", {}).items()} for w in W}
    allt = {}
    for w in W.values():
        for t, v in w["types"].items():
            allt.setdefault(t, {"hp0": v["hp0"], "sp": []})["sp"] += v["sp"]
    sig = {t: (round(v["hp0"], 1), round(sorted(v["sp"])[int(len(v["sp"]) * 0.75)] if v["sp"] else 0, 0)) for t, v in allt.items()}
    add("W5", "enemy types differ in HP or speed", len(set(sig.values())) >= min(3, len(sig)) and len(sig) >= 3, sig)
    ctx.close()

def g_move(browser):
    ctx = new_ctx(browser); page = new_page(ctx)
    start(page, "?god=1&wave=3")
    def ensure():
        s = st(page)
        if s.get("screen") == "shop":
            page.wait_for_timeout(700); page.keyboard.press("Enter"); wait_screen(page, "playing", 5)
    def move(key, axis, sign, cid, label):
        d = 0
        for _ in range(3):
            ensure()
            s0 = st(page); page.keyboard.down(key); page.wait_for_timeout(450); s1 = st(page); page.keyboard.up(key)
            page.wait_for_timeout(120)
            if s0.get("screen") == "playing" and s1.get("screen") == "playing":
                d = (s1.get("player", {}).get(axis, 0) - s0.get("player", {}).get(axis, 0)) * sign
                if d > 0: break
        add(cid, f"{label} moves the player", d > 0, f"delta={d:.2f}")
    move("d", "x", 1, "P3a", "D"); move("a", "x", -1, "P3b", "A"); move("w", "y", -1, "P3c", "W (up = -y)"); move("s", "y", 1, "P3d", "S (down = +y)")
    move("ArrowRight", "x", 1, "P4a", "ArrowRight"); move("ArrowLeft", "x", -1, "P4b", "ArrowLeft"); move("ArrowUp", "y", -1, "P4c", "ArrowUp"); move("ArrowDown", "y", 1, "P4d", "ArrowDown")
    ensure()
    s0 = st(page); page.wait_for_timeout(400); s1 = st(page)
    a_ = s1.get("arena") or {"width": 1}
    drift = math.hypot(s1["player"]["x"] - s0["player"]["x"], s1["player"]["y"] - s0["player"]["y"]) if s1.get("player") and s0.get("player") else 0
    add("P5", "player stops when keys are released", drift < 0.03 * a_.get("width", 1), f"drift={drift:.2f}", core=False)
    ctx.close()

def g_shop(browser):
    ctx = new_ctx(browser); page = new_page(ctx)
    s = start(page, "?wave=4&god=1")
    add("G2", "?wave=4 starts a new game at wave 4", s.get("screen") == "playing" and s.get("wave") == 4, f"{s.get('screen')} wave={s.get('wave')}")
    s = drive(page, lambda s: s.get("screen") != "playing", 240)
    if s.get("screen") != "shop":
        add("S4", "reach the shop after wave 4 (god mode)", False, s.get("screen")); ctx.close(); return
    s0 = st(page)
    # click purchase
    clicked = None
    for bt in [x for x in buttons(page) if not CONT.search(x["text"])]:
        a = st(page)
        if a.get("screen") != "shop": break
        page.mouse.click(bt["x"], bt["y"]); page.wait_for_timeout(150); b = st(page)
        if b.get("coins", 0) < a.get("coins", 0) and sum(b["upgrades"].values()) == sum(a["upgrades"].values()) + 1:
            clicked = bt["text"][:30]; break
    add("S6", "clicking a shop button buys an upgrade", clicked is not None, f"{clicked} coins at shop open {s0.get('coins')}")
    # keyboard purchase: try keys 1..9
    bought = None
    for k in "123456789":
        a = st(page); page.keyboard.press(k); page.wait_for_timeout(150); b = st(page)
        ups = [u for u in b.get("upgrades", {}) if b["upgrades"][u] == a.get("upgrades", {}).get(u, 0) + 1]
        if b.get("coins", 0) < a.get("coins", 0) and len(ups) == 1:
            bought = (k, ups[0], a["coins"] - b["coins"]); break
    add("S4", "a number key buys an upgrade (coins down, one level up)", bought is not None, f"{bought} coins {s0.get('coins')}")
    if bought:
        k, u, c1 = bought
        a = st(page); page.keyboard.press(k); page.wait_for_timeout(150); b = st(page)
        if b["upgrades"].get(u) == a["upgrades"].get(u) + 1:
            c2 = a["coins"] - b["coins"]
            add("S5", "price rises with each level", c2 > c1, f"{c1} then {c2}")
        else:
            add("S5", "price rises with each level", None, "could not afford a second level")
    # spam: can never overspend
    neg = False
    for _ in range(12):
        for k in "123456789":
            page.keyboard.press(k)
        page.wait_for_timeout(30)
        if st(page).get("coins", 0) < 0: neg = True
    a = st(page)
    for k in "123456789": page.keyboard.press(k)
    page.wait_for_timeout(120); b = st(page)
    for bt in [x for x in buttons(page) if not CONT.search(x["text"])]:
        page.mouse.click(bt["x"], bt["y"])
    page.wait_for_timeout(120); c = st(page)
    add("S7", "cannot buy what you cannot afford (coins never negative, no free levels)", not neg and c.get("coins", 0) >= 0 and c.get("screen") == "shop" and sum(c["upgrades"].values()) == sum(a["upgrades"].values()) if a.get("coins", 0) < min([1e9]) else None, f"coins {a.get('coins')}->{c.get('coins')} lv {sum(a['upgrades'].values())}->{sum(c['upgrades'].values())}")
    shot(page, "4-shop-after-buying")
    lv = dict(c.get("upgrades", {}))
    # continue by click
    cb = [x for x in buttons(page) if CONT.search(x["text"])]
    if cb:
        page.mouse.click(cb[-1]["x"], cb[-1]["y"])
        s = wait_screen(page, "playing", 5)
        if s.get("screen") != "playing":
            for x in cb[:-1]:
                page.mouse.click(x["x"], x["y"]); s = wait_screen(page, "playing", 2)
                if s.get("screen") == "playing": break
    else:
        s = st(page)
    add("S8", "a continue button starts the next wave by click", s.get("screen") == "playing" and s.get("wave") == 5, f"{[x['text'][:20] for x in cb]} -> {s.get('screen')} wave={s.get('wave')}")
    if s.get("screen") != "playing":
        page.keyboard.press("Enter"); s = wait_screen(page, "playing", 5)
    add("S9", "upgrade levels carry into the next wave", s.get("upgrades") == lv and sum(lv.values()) > 0, s.get("upgrades"))
    ctx.close()

def g_death(browser):
    ctx = new_ctx(browser); page = new_page(ctx)
    s = start(page, "?wave=6")
    hp0 = (s.get("player") or {}).get("hp", 0)
    seen = {"hurt": False}
    def watch(s):
        if (s.get("player") or {}).get("hp", hp0) < hp0: seen["hurt"] = True
    def nxt(s):
        watch(s)
        if s.get("screen") == "shop": page.keyboard.press("Enter")
        return s.get("screen") == "gameover"
    for attempt in range(3):
        # stand still until the auto-fire has scored something, then run into the enemies until dead
        drive(page, lambda s: watch(s) or s.get("screen") != "playing" or s.get("score", 0) > 0, 40, chase=False)
        s = drive(page, nxt, 240)
        if s.get("screen") != "gameover" or s.get("score", 0) > 0 or attempt == 2: break
        page.keyboard.press("Enter"); wait_screen(page, "playing", 6)
    add("D1", "enemies damage the player (no god mode)", seen["hurt"] or s.get("screen") == "gameover", f"hp0={hp0} hurt={seen['hurt']}")
    add("D2", "at 0 HP the game is over", s.get("screen") == "gameover", f"{s.get('screen')} hp={(s.get('player') or {}).get('hp')}")
    if s.get("screen") != "gameover":
        ctx.close(); return
    page.wait_for_timeout(700)
    s = st(page); final = s.get("score", 0)
    shot(page, "6-gameover")
    add("D3", "highScore equals the best score so far", final > 0 and s.get("highScore") == final, f"score={final} high={s.get('highScore')}")
    ls = page.evaluate("() => Object.fromEntries(Object.entries(localStorage))")
    add("D4", "something is saved in localStorage", len(ls) > 0, list(ls.keys()))
    add("D5", "game-over screen shows the high score", final > 0 and num_in_text(page, final), "")
    add("D6", "game-over screen has a visible <button>", len(buttons(page)) >= 1, [x["text"] for x in buttons(page)])
    page.wait_for_timeout(600)
    page.keyboard.press("Enter"); s = wait_screen(page, "playing", 6)
    p = s.get("player") or {}
    add("D7", "Enter restarts: playing, score 0, full HP, upgrades reset", s.get("screen") == "playing" and s.get("score") == 0 and p.get("hp") == p.get("maxHp") and p.get("hp", 0) > 0 and sum((s.get("upgrades") or {"x": 1}).values()) == 0 and s.get("coins") == 0, f"{s.get('screen')} score={s.get('score')} hp={p.get('hp')}/{p.get('maxHp')} coins={s.get('coins')}")
    add("D8", "restart keeps the high score", s.get("highScore") == final, s.get("highScore"))
    # die again with a lower score -> high score unchanged; restart by button
    s = drive(page, lambda s: s.get("screen") == "gameover" or s.get("score", 0) > 0, 120, chase=False)
    s = drive(page, nxt, 240)
    if s.get("screen") == "gameover":
        page.wait_for_timeout(900)
        b = buttons(page)
        b = [x for x in b if re.search(r"again|restart|retry|play|new|title|menu|start", x["text"], re.I)] + [x for x in b if not re.search(r"again|restart|retry|play|new|title|menu|start", x["text"], re.I)]
        s2 = {}
        for x in b:
            page.mouse.click(x["x"], x["y"]); s2 = wait_screen(page, ["playing", "title"], 3)
            if s2.get("screen") in ("playing", "title"): break
        add("D9", "game-over button works by click", s2.get("screen") in ("playing", "title"), f"{[x['text'] for x in b]} -> {s2.get('screen')}")
    # reload: persists
    load(page, "")
    s = st(page)
    add("D10", "high score survives a reload", s.get("screen") == "title" and s.get("highScore", 0) >= final > 0, f"high={s.get('highScore')} expected>={final}")
    add("D11", "title screen shows the high score", final > 0 and num_in_text(page, s.get("highScore", -1)), "")
    shot(page, "7-title-with-highscore")
    # robustness extra: corrupted storage
    page.evaluate("() => { for (const k of Object.keys(localStorage)) localStorage.setItem(k, '{garbage'); }")
    load(page, "?god=1"); page.keyboard.press("Enter"); s = wait_screen(page, "playing", 5)
    add("X1", "survives corrupted localStorage (still starts)", s.get("screen") == "playing", s.get("screen") or s.get("__err"), core=False)
    ctx.close()

def touch_drag(page, cdp, x0, y0, x1, y1, hold=600):
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0, "id": 1}]})
    for i in range(1, 9):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 + (x1 - x0) * i / 8, "y": y0 + (y1 - y0) * i / 8, "id": 1}]})
        page.wait_for_timeout(16)
    a = st(page); page.wait_for_timeout(hold); b = st(page)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    pa, pb = a.get("player") or {}, b.get("player") or {}
    return pb.get("x", 0) - pa.get("x", 0), pb.get("y", 0) - pa.get("y", 0)

def g_touch(browser):
    ctx = new_ctx(browser, mobile=True); page = new_page(ctx)
    load(page, "?god=1&wave=3")
    sc = page.evaluate("() => ({sw:document.documentElement.scrollWidth, sh:document.documentElement.scrollHeight, w:innerWidth, h:innerHeight})")
    add("T1", "phone portrait (390x844): no page scrolling", sc["sw"] <= sc["w"] + 1 and sc["sh"] <= sc["h"] + 1, sc)
    b = buttons(page)
    pref = [x for x in b if re.search(r"start|play|begin|go", x["text"], re.I)] or b
    if pref:
        page.touchscreen.tap(pref[0]["x"], pref[0]["y"])
    s = wait_screen(page, "playing", 6)
    add("T2", "tapping the title button starts the game", s.get("screen") == "playing", f"{[x['text'] for x in b]} -> {s.get('screen')}")
    if s.get("screen") != "playing":
        page.keyboard.press("Enter"); s = wait_screen(page, "playing", 5)
    cdp = ctx.new_cdp_session(page)
    cv = page.evaluate("() => { const c=document.querySelector('canvas'); if(!c) return null; const r=c.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; }")
    add("T3", "canvas fits inside the phone viewport and covers at least half of it", bool(cv) and cv["x"] >= -1 and cv["y"] >= -1 and cv["x"] + cv["w"] <= 391 and cv["y"] + cv["h"] <= 845 and cv["w"] * cv["h"] >= 0.5 * 390 * 844, cv)
    cx, cy = 195, 560
    page.wait_for_timeout(300)
    def drag(cid, label, ox, oy, axis, sign):
        d = 0
        for _ in range(3):
            if st(page).get("screen") == "shop":
                page.wait_for_timeout(700); page.keyboard.press("Enter"); wait_screen(page, "playing", 5); page.wait_for_timeout(300)
            r = touch_drag(page, cdp, cx, cy, cx + ox, cy + oy); d = r[axis] * sign
            page.wait_for_timeout(200)
            if d > 0 and st(page).get("screen") == "playing": break
        add(cid, f"touch drag {label} moves the player {label}", d > 0, f"{d:.2f}")
    drag("T4a", "right", 90, 0, 0, 1); drag("T4b", "left", -90, 0, 0, -1); drag("T4c", "up", 0, -90, 1, -1); drag("T4d", "down", 0, 90, 1, 1)
    if st(page).get("screen") == "shop":
        page.wait_for_timeout(700); page.keyboard.press("Enter"); wait_screen(page, "playing", 5)
    page.wait_for_timeout(250)
    a = st(page); page.wait_for_timeout(400); b2 = st(page)
    ar = (b2.get("arena") or {}).get("width", 1)
    dr = math.hypot(b2["player"]["x"] - a["player"]["x"], b2["player"]["y"] - a["player"]["y"]) if a.get("player") and b2.get("player") else 0
    add("T5", "player stops when the finger lifts", dr < 0.03 * ar, f"{dr:.2f}")
    # mid-wave screenshot on phone, then clear the wave (keyboard, to save time) and use the shop by tap
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": cx, "y": cy, "id": 1}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": cx + 50, "y": cy - 40, "id": 1}]})
    page.wait_for_timeout(500); shot(page, "8-phone-playing")
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    s = drive(page, lambda s: s.get("screen") != "playing", 150)
    if s.get("screen") == "shop":
        page.wait_for_timeout(500); shot(page, "9-phone-shop")
        sc = page.evaluate("() => ({sw:document.documentElement.scrollWidth, w:innerWidth})")
        bs = buttons(page)
        small = [x["text"][:15] for x in bs if min(x["w"], x["h"]) < 30]
        add("T6", "phone shop: at least five buttons reachable, none tiny (<30px)", len(bs) >= 5 and not small, f"n={len(bs)} small={small}")
        got = None
        for bt in [x for x in bs if not CONT.search(x["text"])]:
            a = st(page); page.touchscreen.tap(bt["x"], bt["y"]); page.wait_for_timeout(200); b3 = st(page)
            if b3.get("coins", 0) < a.get("coins", 0): got = bt["text"][:25]; break
        add("T7", "phone shop: tapping buys an upgrade", got is not None, got)
        cb = [x for x in buttons(page) if CONT.search(x["text"])]
        s2 = st(page)
        for x in reversed(cb):
            page.touchscreen.tap(x["x"], x["y"]); s2 = wait_screen(page, "playing", 3)
            if s2.get("screen") == "playing": break
        add("T8", "phone shop: tapping continue starts the next wave", s2.get("screen") == "playing" and s2.get("wave") == s.get("wave", 0) + 1, f"{s2.get('screen')} wave={s2.get('wave')}")
    else:
        add("T6", "phone: wave 1 can be cleared to reach the shop", False, s.get("screen"))
    ctx.close()

def g_layout(browser):
    ctx = new_ctx(browser, w=1920, h=1080); page = new_page(ctx)
    s = start(page, "?god=1&wave=2")
    def fit(cid, w, h):
        page.set_viewport_size({"width": w, "height": h}); page.wait_for_timeout(500)
        m = page.evaluate("() => { const c=document.querySelector('canvas'); const r=c?c.getBoundingClientRect():{left:0,top:0,width:0,height:0}; return {sw:document.documentElement.scrollWidth, sh:document.documentElement.scrollHeight, w:innerWidth, h:innerHeight, cx:r.left, cy:r.top, cw:r.width, ch:r.height}; }")
        ok = m["sw"] <= m["w"] + 1 and m["sh"] <= m["h"] + 1 and m["cx"] >= -1 and m["cy"] >= -1 and m["cx"] + m["cw"] <= w + 1 and m["cy"] + m["ch"] <= h + 1 and m["cw"] * m["ch"] >= 0.5 * w * h
        s = st(page); p = s.get("player") or {}; a = s.get("arena") or {}
        inb = 0 <= p.get("x", -1) <= a.get("width", 0) and 0 <= p.get("y", -1) <= a.get("height", 0)
        add(cid, f"{w}x{h}: no scrollbars, canvas fits and fills, player still in the arena", ok and inb and s.get("screen") in ("playing", "shop"), m)
    fit("R1", 1920, 1080); fit("R2", 1024, 600); fit("R3", 360, 640); fit("R4", 1280, 720)
    # arena bounds: push into each corner
    def corner(keys, cid, label):
        for k in keys: page.keyboard.down(k)
        last, still, t0, bad = None, 0, time.time(), None
        while time.time() - t0 < 25 and still < 5:
            page.wait_for_timeout(150); s = st(page)
            if s.get("screen") == "shop":
                page.keyboard.press("Enter"); continue
            p, a = s.get("player") or {}, s.get("arena") or {}
            if not (-1e-6 <= p.get("x", -1) <= a.get("width", 0) + 1e-6 and -1e-6 <= p.get("y", -1) <= a.get("height", 0) + 1e-6): bad = p
            pos = (round(p.get("x", 0), 2), round(p.get("y", 0), 2))
            still = still + 1 if pos == last else 0; last = pos
        for k in keys: page.keyboard.up(k)
        add(cid, f"player cannot leave the arena ({label})", bad is None and still >= 5, f"end={last} bad={bad}")
    corner(["a", "w"], "R5", "top-left"); corner(["d", "s"], "R6", "bottom-right")
    # diagonal speed normalised (extra)
    def speed(keys):
        for k in keys: page.keyboard.down(k)
        page.wait_for_timeout(150); a = st(page); page.wait_for_timeout(500); b = st(page)
        for k in keys: page.keyboard.up(k)
        return math.hypot(b["player"]["x"] - a["player"]["x"], b["player"]["y"] - a["player"]["y"])
    try:
        page.keyboard.press("Enter"); v1 = speed(["a"]); page.wait_for_timeout(100); v2 = speed(["a", "w"])
        add("X2", "diagonal movement is not faster than straight", v1 > 0 and v2 <= v1 * 1.2, f"straight={v1:.1f} diag={v2:.1f}", core=False)
    except Exception as e:
        add("X2", "diagonal movement is not faster than straight", None, e, core=False)
    # stuck key after window blur (extra)
    try:
        page.keyboard.down("d"); page.wait_for_timeout(200)
        page.evaluate("() => { window.dispatchEvent(new Event('blur')); }")
        page.keyboard.up("d")  # real keyup still arrives here; simulate lost keyup instead:
        page.evaluate("() => { window.dispatchEvent(new KeyboardEvent('keydown',{key:'d',code:'KeyD',bubbles:true})); document.dispatchEvent(new KeyboardEvent('keydown',{key:'d',code:'KeyD',bubbles:true})); window.dispatchEvent(new Event('blur')); }")
        page.wait_for_timeout(300); a = st(page); page.wait_for_timeout(400); b = st(page)
        if b.get("screen") == "playing" and a.get("screen") == "playing":
            add("X3", "keys do not stay stuck after the window loses focus", abs(b["player"]["x"] - a["player"]["x"]) < 0.01 * b["arena"]["width"], f"dx={b['player']['x']-a['player']['x']:.2f}", core=False)
        else:
            add("X3", "keys do not stay stuck after the window loses focus", True if b.get("screen") == "paused" else None, b.get("screen"), core=False)
    except Exception as e:
        add("X3", "keys do not stay stuck after the window loses focus", None, e, core=False)
    ctx.close()

def g_perf(browser):
    ctx = new_ctx(browser); page = new_page(ctx)
    best = None
    for wv in (12, 25, 40):
        s = start(page, f"?wave={wv}&god=1")
        if s.get("screen") != "playing": continue
        t0 = time.time(); n = 0
        while time.time() - t0 < 14:
            page.wait_for_timeout(500); n2 = len(st(page).get("enemies") or [])
            if n2 >= 100: n = n2; break
            n = max(n, n2)
        fps = page.evaluate("() => new Promise(res=>{let n=0; const t0=performance.now(); function f(){n++; if(performance.now()-t0<4000) requestAnimationFrame(f); else res(n/4);} requestAnimationFrame(f);})")
        n_now = len(st(page).get("enemies") or [])
        best = {"wave": wv, "enemies": max(n, n_now), "fps": round(fps, 1)}
        if wv == 12: shot(page, "5-wave12")
        if max(n, n_now) >= 100: break
    shared["perf"] = best
    add("F1", "frame rate stays at 30+ fps in a heavy late wave", bool(best) and best["fps"] >= 30, best)
    add("F2", "a late wave puts 100+ enemies on screen (informational)", bool(best) and best["enemies"] >= 100, best, core=False)
    ctx.close()

# ============================ feature checks ============================
def g_boss(browser):
    ctx = new_ctx(browser); page = new_page(ctx)
    load(page, "?wave=4&god=1")
    s = st(page)
    add("B0", "state.boss exists and is null on the title screen", "boss" in s and s.get("boss") is None, s.get("boss", "missing"))
    page.keyboard.press("Enter"); wait_screen(page, "playing", 6)
    sawboss = []
    s = drive(page, lambda s: s.get("screen") != "playing", 240, on_tick=lambda s: sawboss.append(1) if s.get("boss") or any(e.get("type") == "boss" for e in s.get("enemies") or []) else None)
    q = qa(page); w4 = q["waves"].get("4", {})
    normal_hp = max([v["hp0"] for v in w4.get("ids", {}).values()] or [0])
    add("B1", "wave 4 has no boss", s.get("screen") == "shop" and not sawboss, f"{s.get('screen')} boss samples={len(sawboss)}")
    coins_before = s.get("coins", 0); score_before = s.get("score", 0)
    page.keyboard.press("Enter"); s = wait_screen(page, "playing", 6)
    t0 = time.time(); bs = []
    while time.time() - t0 < 12:
        s = st(page); bs = [e for e in s.get("enemies") or [] if e.get("type") == "boss"]
        if bs and s.get("boss"): break
        page.wait_for_timeout(150)
    b = s.get("boss") or {}
    add("B2", "wave 5 spawns exactly one enemy of type 'boss'", s.get("wave") == 5 and len(bs) == 1, f"wave={s.get('wave')} bosses={len(bs)}")
    add("B3", "state.boss = {hp, maxHp, phase:1} while the boss lives", all(isinstance(b.get(k), (int, float)) for k in ("hp", "maxHp", "phase")) and b.get("phase") == 1 and b.get("hp", 0) > 0.5 * b.get("maxHp", 1e9), b)
    add("B4", "boss has far more HP than a normal enemy (5x+)", b.get("maxHp", 0) >= 5 * normal_hp > 0, f"boss={b.get('maxHp')} normal max={normal_hp}")
    shared["boss5"] = b.get("maxHp")
    page.wait_for_timeout(2500); shot(page, "10-boss")
    track = {"p1_bad": 0, "p2_bad": 0, "saw2": False, "minfrac": 1.0, "hits": 0}
    def tick(s):
        bb = s.get("boss")
        if not bb or not bb.get("maxHp"): return
        f = bb["hp"] / bb["maxHp"]; track["minfrac"] = min(track["minfrac"], f)
        if f > 0.56 and bb.get("phase") != 1: track["p1_bad"] += 1
        if 0 < f < 0.44:
            if bb.get("phase") == 2: track["saw2"] = True
            else: track["p2_bad"] += 1
        if f < 0.45 and not track.get("shot2"):
            track["shot2"] = True; shot(page, "11-boss-phase2")
    s = drive(page, lambda s: s.get("screen") != "playing", 300, on_tick=tick)
    add("B5", "auto-fire damages the boss", track["minfrac"] < 0.98, f"min hp fraction {track['minfrac']:.2f}")
    add("B6", "boss enters phase 2 at half health (phase 1 above, 2 below)", track["saw2"] and track["p1_bad"] == 0 and track["p2_bad"] <= 1, track)
    add("B7", "killing the boss ends the wave and opens the shop; state.boss is null again", s.get("screen") == "shop" and s.get("boss") is None, f"{s.get('screen')} boss={s.get('boss')}")
    q = qa(page); w5 = q["waves"].get("5", {})
    # the bonus may land in the same frame as the switch to the shop, so also compare the step into the shop (wave-clear bonus included on both sides)
    c4 = max(1, w4.get("maxCoinStep", 1), w4.get("shopCoinStep", 0)); s4 = max(1, w4.get("maxScoreStep", 1), w4.get("shopScoreStep", 0))
    add("B8", "boss kill pays a bonus clearly larger than a normal kill (3x+ coins or score in one step)", w5.get("maxCoinStep", 0) >= 3 * max(1, w4.get("maxCoinStep", 1)) or w5.get("maxScoreStep", 0) >= 3 * max(1, w4.get("maxScoreStep", 1)) or w5.get("shopCoinStep", 0) >= 3 * c4 or w5.get("shopScoreStep", 0) >= 3 * s4, f"w4 coin/score step {w4.get('maxCoinStep')}/{w4.get('maxScoreStep')} (into shop {w4.get('shopCoinStep')}/{w4.get('shopScoreStep')}) w5 {w5.get('maxCoinStep')}/{w5.get('maxScoreStep')} (into shop {w5.get('shopCoinStep')}/{w5.get('shopScoreStep')})")
    if s.get("screen") == "shop":
        page.keyboard.press("Enter"); s = wait_screen(page, "playing", 6); page.wait_for_timeout(4000); s = st(page)
        add("B9", "wave 6 is a normal wave again (no boss)", s.get("wave") == 6 and s.get("boss") is None and not any(e.get("type") == "boss" for e in s.get("enemies") or []) and len(s.get("enemies") or []) > 0, f"wave={s.get('wave')} boss={s.get('boss')} n={len(s.get('enemies') or [])}")
    ctx.close()
    # wave 10 boss tougher; boss is dangerous without god mode
    ctx = new_ctx(browser); page = new_page(ctx)
    s = start(page, "?wave=10&god=1"); t0 = time.time(); b10 = None
    while time.time() - t0 < 12 and not b10:
        b10 = (st(page).get("boss") or {}).get("maxHp"); page.wait_for_timeout(150)
    add("B10", "wave 10 boss has more HP than the wave 5 boss", bool(b10) and bool(shared.get("boss5")) and b10 > shared["boss5"], f"w5={shared.get('boss5')} w10={b10}")
    s = start(page, "?wave=5")
    hp0 = (s.get("player") or {}).get("hp", 0)
    s = drive(page, lambda s: s.get("screen") != "playing" or (s.get("player") or {}).get("hp", hp0) < hp0, 45)
    add("B11", "the boss fight hurts: player loses HP on wave 5 without god mode", (s.get("player") or {}).get("hp", hp0) < hp0 or s.get("screen") == "gameover", f"hp {hp0}->{(s.get('player') or {}).get('hp')}")
    ctx.close()

def g_pause(browser):
    ctx = new_ctx(browser); page = new_page(ctx)
    load(page, "")
    page.keyboard.press("p"); page.keyboard.press("Escape"); page.wait_for_timeout(200)
    add("U1", "cannot pause on the title screen", st(page).get("screen") == "title", st(page).get("screen"))
    page.keyboard.press("Enter"); s = wait_screen(page, "playing", 6)
    t0 = time.time()
    while time.time() - t0 < 10 and len(st(page).get("enemies") or []) < 2: page.wait_for_timeout(150)
    def snap():
        s = st(page); return s, {e["id"]: (e["x"], e["y"]) for e in s.get("enemies") or []}
    def maxmove(a, b):
        return max([math.hypot(b[i][0] - a[i][0], b[i][1] - a[i][1]) for i in a if i in b] or [0])
    s0, e0 = snap(); page.wait_for_timeout(100); s1, e1 = snap()
    typical = maxmove(e0, e1)
    page.keyboard.press("p"); page.wait_for_timeout(150); s = st(page)
    add("U2", "P pauses: screen == 'paused'", s.get("screen") == "paused", s.get("screen"))
    shot(page, "12-paused")
    pb = buttons(page); texts = " | ".join(x["text"] for x in pb)
    add("U3", "pause menu has Resume, Restart and Quit <button>s", bool(re.search(r"resume|continue", texts, re.I)) and bool(re.search(r"restart|retry|new game", texts, re.I)) and bool(re.search(r"quit|title|menu|exit", texts, re.I)), texts)
    sa, ea = snap(); page.keyboard.down("d"); page.wait_for_timeout(1800); sb, eb = snap(); page.keyboard.up("d")
    frozen = maxmove(ea, eb) < 1e-6 and sa.get("player") == sb.get("player") and sa.get("score") == sb.get("score") and len(ea) == len(eb)
    add("U4", "paused: nothing moves, spawns or takes damage for 1.8s (movement key held)", sb.get("screen") == "paused" and frozen, f"enemy move={maxmove(ea, eb):.3f} player {sa.get('player')} -> {sb.get('player')}")
    page.wait_for_timeout(1500)
    page.keyboard.press("p"); page.wait_for_timeout(60); sc, ec = snap(); page.wait_for_timeout(100); sd, ed = snap()
    add("U5", "P resumes: screen == 'playing' and enemies move again", sd.get("screen") == "playing" and maxmove(ec, ed) > 0, f"{sd.get('screen')} move={maxmove(ec, ed):.2f}")
    jump = maxmove(eb, ec)
    add("U6", "no time jump on resume after a 3s pause", sd.get("screen") == "playing" and jump <= max(6 * typical, 0.02 * (sd.get('arena') or {}).get('width', 800)), f"jump={jump:.2f} typical100ms={typical:.2f}")
    page.keyboard.press("Escape"); page.wait_for_timeout(150); a = st(page).get("screen")
    page.keyboard.press("Escape"); page.wait_for_timeout(150); b = st(page).get("screen")
    add("U7", "Escape pauses and resumes too", a == "paused" and b == "playing", f"{a} -> {b}")
    # on-screen pause button
    hit = None
    for bt in buttons(page):
        page.mouse.click(bt["x"], bt["y"]); page.wait_for_timeout(200)
        if st(page).get("screen") == "paused": hit = bt; break
    add("U8", "an on-screen pause <button> pauses during play", hit is not None, (hit or {}).get("text"))
    if st(page).get("screen") != "paused":
        page.keyboard.press("p"); page.wait_for_timeout(150)
    def click_menu(rx):
        for bt in buttons(page):
            if re.search(rx, bt["text"], re.I):
                page.mouse.click(bt["x"], bt["y"]); page.wait_for_timeout(300); return True
        return False
    ok = click_menu(r"resume|continue"); s = st(page)
    add("U9", "Resume button resumes", ok and s.get("screen") == "playing", s.get("screen"))
    # get some score first, then restart
    s = drive(page, lambda s: s.get("score", 0) > 0 or s.get("screen") != "playing", 40)
    page.keyboard.press("p"); page.wait_for_timeout(150)
    ok = click_menu(r"restart|retry|new game"); s = wait_screen(page, "playing", 4)
    add("U10", "Restart button starts a new game immediately (wave 1, score 0)", ok and s.get("screen") == "playing" and s.get("wave") == 1 and s.get("score") == 0, f"{s.get('screen')} wave={s.get('wave')} score={s.get('score')}")
    page.wait_for_timeout(500); page.keyboard.press("p"); page.wait_for_timeout(150)
    ok = click_menu(r"quit|title|menu|exit"); s = wait_screen(page, "title", 4)
    add("U11", "Quit button returns to the title screen", ok and s.get("screen") == "title", s.get("screen"))
    # auto-pause on blur and on hidden tab
    page.keyboard.press("Enter"); wait_screen(page, "playing", 6); page.wait_for_timeout(500)
    page.evaluate("() => window.dispatchEvent(new Event('blur'))"); page.wait_for_timeout(200); a = st(page).get("screen")
    add("U12", "auto-pause when the window loses focus", a == "paused", a)
    if a == "paused": page.keyboard.press("p"); page.wait_for_timeout(150)
    page.evaluate("() => { Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true}); Object.defineProperty(document,'hidden',{get:()=>true,configurable:true}); document.dispatchEvent(new Event('visibilitychange')); }")
    page.wait_for_timeout(200); a = st(page).get("screen")
    add("U13", "auto-pause when the tab is hidden", a == "paused", a)
    page.evaluate("() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }")
    ctx.close()
    # not pausable in shop / gameover; damage frozen while paused (no god); boss frozen
    ctx = new_ctx(browser); page = new_page(ctx)
    s = start(page, "?wave=1&god=1"); s = drive(page, lambda s: s.get("screen") != "playing", 150)
    if s.get("screen") == "shop":
        page.keyboard.press("p"); page.keyboard.press("Escape"); page.wait_for_timeout(200)
        add("U14", "cannot pause in the shop", st(page).get("screen") == "shop", st(page).get("screen"))
    s = start(page, "?wave=5")
    hp0 = (s.get("player") or {}).get("hp", 0)
    s = drive(page, lambda s: s.get("screen") != "playing" or (s.get("player") or {}).get("hp", hp0) < hp0, 45)
    if s.get("screen") == "playing":
        page.keyboard.press("p"); page.wait_for_timeout(150); a = st(page); page.wait_for_timeout(2500); b = st(page)
        add("U15", "paused during a boss fight: boss and player HP frozen", b.get("screen") == "paused" and a.get("player") == b.get("player") and a.get("boss") == b.get("boss") and a.get("enemies") == b.get("enemies"), f"{b.get('screen')} hp {a.get('player',{}).get('hp')}->{b.get('player',{}).get('hp')}")
        page.keyboard.press("p")
    s = drive(page, lambda s: (s.get("screen") == "shop" and page.keyboard.press("Enter")) or s.get("screen") == "gameover", 200)
    if s.get("screen") == "gameover":
        page.keyboard.press("p"); page.keyboard.press("Escape"); page.wait_for_timeout(200)
        add("U16", "cannot pause on the game-over screen", st(page).get("screen") == "gameover", st(page).get("screen"))
    ctx.close()
    # phone: pause button by tap
    ctx = new_ctx(browser, mobile=True); page = new_page(ctx)
    load(page, "?god=1"); b = buttons(page)
    if b: page.touchscreen.tap(b[0]["x"], b[0]["y"])
    s = wait_screen(page, "playing", 5)
    if s.get("screen") != "playing": page.keyboard.press("Enter"); wait_screen(page, "playing", 5)
    page.wait_for_timeout(600); hit = None
    for bt in buttons(page):
        page.touchscreen.tap(bt["x"], bt["y"]); page.wait_for_timeout(250)
        if st(page).get("screen") == "paused": hit = bt; break
    add("U17", "phone: pause button works by tap and is at least 30px", hit is not None and min(hit["w"], hit["h"]) >= 30, hit)
    if hit:
        shot(page, "13-phone-paused")
        sc = page.evaluate("() => ({sw:document.documentElement.scrollWidth, sh:document.documentElement.scrollHeight, w:innerWidth, h:innerHeight})")
        pb = buttons(page)
        add("U18", "phone: pause menu fits the screen with three buttons", sc["sw"] <= sc["w"] + 1 and sc["sh"] <= sc["h"] + 1 and len(pb) >= 3, f"{sc} n={len(pb)}")
    ctx.close()


# ============================ bugfix checks ============================
SPEED = """async (key) => { const g = () => window.game.getState().player; const sl = (ms) => new Promise(r => setTimeout(r, ms));
  await sl(350); const a = g(), t0 = performance.now(); await sl(1400); const b = g(), t1 = performance.now();
  return Math.hypot(b.x - a.x, b.y - a.y) / ((t1 - t0) / 1000); }"""
def speed_of(page):
    """Player speed in arena units per second while holding D (re-centres first by holding A briefly if near the wall)."""
    s = st(page); p, a = s.get("player") or {}, s.get("arena") or {}
    key = "d" if p.get("x", 0) < a.get("width", 0) * 0.5 else "a"
    page.keyboard.down(key)
    try: v = page.evaluate(SPEED, key)
    finally: page.keyboard.up(key)
    return v

def g_bugs(browser):
    # K1: high score >= 1000 survives a reload
    ctx = new_ctx(browser); page = new_page(ctx)
    start(page, "?wave=15&god=1")
    def until(s):
        if s.get("screen") == "shop": page.keyboard.press("Enter")
        return s.get("score", 0) >= 1100
    s = drive(page, until, 400)
    H = s.get("highScore", 0)
    load(page, ""); s2 = st(page)
    add("K1", "bug 1: a best score above 1,000 survives a reload", (s2.get("highScore") == H) if H >= 1000 else None, f"before={H} after reload={s2.get('highScore')}")
    ctx.close()
    # K2: number keys must not buy during play
    ctx = new_ctx(browser); page = new_page(ctx)
    start(page, "?wave=6&god=1")
    s = drive(page, lambda s: s.get("screen") == "playing" and s.get("coins", 0) >= 60 or s.get("screen") != "playing", 200)
    if s.get("screen") == "shop":
        page.keyboard.press("Enter"); s = wait_screen(page, "playing", 5); page.wait_for_timeout(1500)
    a = st(page)
    for k in "123456789":
        page.keyboard.press(k); page.wait_for_timeout(40)
    b = st(page)
    add("K2", "bug 2: number keys do nothing during a wave", a.get("screen") == "playing" and b.get("screen") == "playing" and a.get("coins", 0) >= 30 and b.get("upgrades") == a.get("upgrades") and b.get("coins", 0) >= a.get("coins", 0), f"coins {a.get('coins')}->{b.get('coins')} levels {sum((a.get('upgrades') or {}).values())}->{sum((b.get('upgrades') or {}).values())} screen={a.get('screen')}")
    ctx.close()
    # K3: a restarted run has base stats again
    ctx = new_ctx(browser); page = new_page(ctx)
    start(page, "?wave=1"); page.wait_for_timeout(300)
    v0 = speed_of(page); got = 0; v1 = 0
    for _ in range(3):
        s = drive(page, lambda s: s.get("screen") != "playing", 50, chase=False)
        if s.get("screen") == "playing": s = drive(page, lambda s: s.get("screen") != "playing", 150)
        if s.get("screen") != "shop": break
        for _ in range(3):
            sb = [x for x in buttons(page) if re.search(r"speed|swift|boot|agil|move", x["text"], re.I)]
            if not sb: break
            a = st(page); page.mouse.click(sb[0]["x"], sb[0]["y"]); page.wait_for_timeout(150); b = st(page)
            if sum((b.get("upgrades") or {}).values()) > sum((a.get("upgrades") or {}).values()): got += 1
            else: break
        page.keyboard.press("Enter"); wait_screen(page, "playing", 5)
        if got >= 1:
            page.wait_for_timeout(300); v1 = speed_of(page); break
    def nxt(s):
        if s.get("screen") == "shop": page.keyboard.press("Enter")
        return s.get("screen") == "gameover"
    s = drive(page, nxt, 300)
    if s.get("screen") == "gameover":
        page.keyboard.press("Enter"); wait_screen(page, "playing", 6); page.wait_for_timeout(300)
        v2 = speed_of(page)
        add("K3", "bug 3: after Play again the player is back to base speed", got >= 1 and v1 > v0 * 1.03 and abs(v2 - v0) < abs(v2 - v1), f"fresh={v0:.1f} upgraded={v1:.1f} (speed levels {got}) after restart={v2:.1f}")
    else:
        add("K3", "bug 3: after Play again the player is back to base speed", False, f"could not die: {s.get('screen')}")
    ctx.close()
    # K4: a second finger must not stop the joystick
    ctx = new_ctx(browser, mobile=True); page = new_page(ctx)
    start(page, "?god=1&wave=3"); cdp = ctx.new_cdp_session(page); page.wait_for_timeout(400)
    def tp(x, y, i): return {"x": x, "y": y, "id": i}
    ok_runs = 0; det = []
    for attempt in range(2):
        if st(page).get("screen") == "shop":
            page.wait_for_timeout(700); page.keyboard.press("Enter"); wait_screen(page, "playing", 5)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [tp(120, 620, 0)]})
        for i in range(1, 7):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [tp(120 + 15 * i, 620, 0)]}); page.wait_for_timeout(16)
        page.wait_for_timeout(250)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [tp(210, 620, 0), tp(300, 300, 1)]}); page.wait_for_timeout(120)
        a = st(page); page.wait_for_timeout(300); b = st(page)          # both fingers down
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [tp(212, 620, 0)]}); page.wait_for_timeout(120)   # releases finger 2 only
        c = st(page); page.wait_for_timeout(400); d = st(page)          # second finger lifted, first still dragging right
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); page.wait_for_timeout(200)
        d1 = b["player"]["x"] - a["player"]["x"]; d2 = d["player"]["x"] - c["player"]["x"]
        det.append((round(d1, 1), round(d2, 1)))
        atwall = d["player"]["x"] > d["arena"]["width"] * 0.97
        if (d1 > 10 and d2 > 10) or atwall: ok_runs += 1
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [tp(250, 620, 0)]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [tp(160, 620, 0)]}); page.wait_for_timeout(900)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); page.wait_for_timeout(200)
    add("K4", "bug 4: a second finger touching the screen does not interrupt steering", ok_runs == 2, f"dx with 2 fingers / after lifting the 2nd: {det}")
    ctx.close()
    # K5: no slow motion at 25 fps
    ctx = new_ctx(browser); page = new_page(ctx)
    start(page, "?god=1&wave=2"); page.wait_for_timeout(300); vn = speed_of(page)
    ctx.close()
    ctx = new_ctx(browser)
    ctx.add_init_script("window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 40);")
    page = new_page(ctx)
    start(page, "?god=1&wave=2"); page.wait_for_timeout(300); vs = speed_of(page)
    add("K5", "bug 5: the game runs at full speed at 25 fps", vn > 0 and vs >= 0.85 * vn, f"60fps speed={vn:.1f} 25fps speed={vs:.1f}")
    ctx.close()
    # K6: enemies stay killable after buying Pierce
    ctx = new_ctx(browser); page = new_page(ctx)
    start(page, "?wave=5&god=1"); pierce = 0; s = {}
    for _ in range(5):
        s = drive(page, lambda s: s.get("screen") != "playing", 200)
        if s.get("screen") != "shop": break
        for k in "987654321":
            a = st(page); page.keyboard.press(k); page.wait_for_timeout(60); b = st(page)
            up = [u for u in (b.get("upgrades") or {}) if b["upgrades"][u] > (a.get("upgrades") or {}).get(u, 0)]
            if up and re.search(r"pierc", up[0], re.I): pierce += 1
        page.keyboard.press("Enter"); wait_screen(page, "playing", 5)
        if pierce >= 1: break
    cleared = 0
    if pierce >= 1:
        for _ in range(2):
            s = drive(page, lambda s: s.get("screen") != "playing", 200)
            if s.get("screen") != "shop": break
            cleared += 1; page.keyboard.press("Enter"); wait_screen(page, "playing", 5)
    add("K6", "bug 6: with Pierce bought, waves can still be cleared", pierce >= 1 and cleared == 2, f"pierce levels={pierce} waves cleared after={cleared} screen={s.get('screen')} wave={s.get('wave')}")
    ctx.close()

# =====================================================================
GROUPS = [g_load, g_play, g_move, g_shop, g_death, g_touch, g_layout, g_perf] + ([g_boss, g_pause] if FEATURE else []) + ([g_bugs] if "--bugfix" in sys.argv else [])
if "--group" in sys.argv:
    # child mode: run one group in its own browser and dump the partial results
    name = sys.argv[sys.argv.index("--group") + 1]
    g = [x for x in GROUPS if x.__name__ == name][0]
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        group(lambda: g(browser))
        try: browser.close()
        except Exception: pass
    json.dump({"results": results, "errors": errors_seen, "ext": ext_requests, "shared": shared}, open(os.path.join(out, f"part-{name}.json"), "w"))
    sys.exit(0)

import subprocess, signal
t0 = time.time()
for g in GROUPS:
    name = g.__name__
    print(f"== {name} ({time.time()-t0:.0f}s)", flush=True)
    part = os.path.join(out, f"part-{name}.json")
    if os.path.exists(part): os.remove(part)
    p = subprocess.Popen([sys.executable, os.path.abspath(__file__), build, out, "--group", name] + [a for a in ("--feature", "--bugfix") if a in sys.argv], start_new_session=True)
    try:
        p.wait(timeout=1500 if name in ("g_boss", "g_pause", "g_bugs") else 700)
    except subprocess.TimeoutExpired:
        pass
    try: os.killpg(p.pid, signal.SIGKILL)
    except Exception: pass
    if os.path.exists(part):
        d = json.load(open(part)); results += d["results"]; errors_seen += d["errors"]; ext_requests += d["ext"]; shared.update(d["shared"]); os.remove(part)
    else:
        add("ERR-" + name, f"check group {name} hung or crashed (page froze?)", False, "no result within the time limit")

uniq = sorted(set(errors_seen))
add("E1", "no uncaught errors or console errors during the whole session", not uniq, uniq[:4])
add("E2", "no network requests to other hosts", not ext_requests, sorted(set(ext_requests))[:4])
core = [r for r in results if r["core"] and r["status"] != "skip"]
summary = {"passed": sum(r["status"] == "pass" for r in core), "total": len(core),
           "failed": [r["id"] for r in core if r["status"] == "fail"],
           "extra_failed": [r["id"] for r in results if not r["core"] and r["status"] == "fail"],
           "skipped": [r["id"] for r in results if r["status"] == "skip"],
           "perf": shared.get("perf"), "types": shared.get("types_early"), "secs": round(time.time() - t0)}
json.dump({"summary": summary, "results": results}, open(os.path.join(out, "checks.json"), "w"), indent=1)
print(json.dumps({k: v for k, v in summary.items() if k != "types"}))
