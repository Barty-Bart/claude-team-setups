#!/usr/bin/env python3
"""Hidden checks for the website job. Usage: check_site.py <build_dir> <out_dir>"""
import sys, os, re, json
from urllib.parse import urljoin, urlparse
from playwright.sync_api import sync_playwright
from common import add, guard, finish, serve
build, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
os.makedirs(os.path.join(out, "shots"), exist_ok=True)
MAIN = ["index.html", "services.html", "hire.html", "about.html", "journal.html", "contact.html"]
POSTS = ["journal/spring-service-checklist.html", "journal/coast-path-loop.html", "journal/choosing-a-first-e-bike.html"]
PAGES = MAIN + POSTS
port = serve(build); BASE = f"http://127.0.0.1:{port}/"
for p in PAGES: add("F-" + p, f"{p} exists", os.path.isfile(os.path.join(build, p)))
errs, ext, info = [], [], {}
def rel(url): return urlparse(url).path.lstrip("/")
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def newpage(w=1440, h=900):
        ctx = b.new_context(viewport={"width": w, "height": h}); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)[:120])); pg.on("console", lambda m: errs.append(m.text[:120]) if m.type == "error" else None)
        pg.on("request", lambda r: ext.append(r.url[:100]) if not r.url.startswith((BASE, "data:", "blob:", "about:")) else None)
        return pg
    pg = newpage()
    for p in PAGES:
        if not os.path.isfile(os.path.join(build, p)): continue
        pg.goto(BASE + p, wait_until="load"); pg.wait_for_timeout(300)
        info[p] = pg.evaluate("""() => { const q = s => [...document.querySelectorAll(s)]; const abs = a => a.href;
          return {lang: document.documentElement.lang, title: document.title.trim(), desc: (document.querySelector('meta[name=description]')||{}).content || '',
            h1: q('h1').length, imgNoAlt: q('img').filter(i => !i.hasAttribute('alt')).length,
            nav: q('header nav a, nav a').map(abs), cur: q('nav a[aria-current=page]').map(abs), links: q('a[href]').map(a => a.getAttribute('href')),
            footer: (q('footer').filter(f => !f.closest('article, main')).concat(q('footer')).slice(0, 1).map(f => f.innerText)[0]) || '', text: document.body.innerText, details: q('details').length,
            article: (document.querySelector('article')||{innerText:''}).innerText}; }""")
        if p in MAIN or p == POSTS[0]:
            pg.screenshot(path=os.path.join(out, "shots", "desktop-" + p.replace("/", "_").replace(".html", "") + ".png"), full_page=True, clip=None)
    have = [p for p in PAGES if p in info]
    add("H1", "every page has lang=en", bool(have) and all(info[p]["lang"].lower().startswith("en") for p in have), [p for p in have if not info[p]["lang"].lower().startswith("en")])
    add("H2", "every page has a title and they are all different", bool(have) and all(info[p]["title"] for p in have) and len({info[p]["title"] for p in have}) == len(have), sorted({info[p]["title"] for p in have})[:4])
    add("H3", "every page has a meta description and they are all different", bool(have) and all(info[p]["desc"] for p in have) and len({info[p]["desc"] for p in have}) == len(have))
    add("H4", "every page has exactly one h1", bool(have) and all(info[p]["h1"] == 1 for p in have), {p: info[p]["h1"] for p in have if info[p]["h1"] != 1})
    add("H5", "every img has an alt attribute", bool(have) and all(info[p]["imgNoAlt"] == 0 for p in have), {p: info[p]["imgNoAlt"] for p in have if info[p]["imgNoAlt"]})
    def navok(p): return set(MAIN) <= {rel(u) or "index.html" for u in info[p]["nav"]}
    add("N1", "nav on every page links to the six main pages", bool(have) and all(navok(p) for p in have), [p for p in have if not navok(p)])
    def curok(p):
        want = p if p in MAIN else "journal.html"; return [rel(u) or "index.html" for u in info[p]["cur"]] and all((rel(u) or "index.html") == want for u in info[p]["cur"])
    add("N2", "aria-current=page marks the current page in the nav", bool(have) and all(curok(p) for p in have), [p for p in have if not curok(p)])
    add("N3", "footer on every page shows address and phone", bool(have) and all("14 Quay Street" in info[p]["footer"] and re.search(r"01632\s?960\s?417", info[p]["footer"]) for p in have), [p for p in have if "14 Quay Street" not in info[p]["footer"]])
    broken = []
    for p in have:
        for h in info[p]["links"]:
            if not h or h.startswith(("#", "mailto:", "tel:", "http:", "https:", "javascript:")): continue
            t = rel(urljoin(BASE + p, h.split("#")[0].split("?")[0])) or "index.html"
            if t.endswith("/"): t += "index.html"
            if not os.path.isfile(os.path.join(build, t)): broken.append(f"{p}->{h}")
    add("N4", "no broken internal links", bool(have) and not broken, broken[:5])
    T = lambda p: info.get(p, {}).get("text", "")
    SV = [("Safety check", "£25"), ("Standard service", "£65"), ("Full overhaul", "£140"), ("Puncture repair", "£12"), ("Wheel true", "£20"), ("E-bike diagnostic", "£45")]
    miss = [n for n, pr in SV if n.lower() not in T("services.html").lower() or pr not in T("services.html")]
    add("SV1", "services page lists all six services with prices", "services.html" in info and not miss, miss)
    add("SV2", "services page has a FAQ of at least four <details>", info.get("services.html", {}).get("details", 0) >= 4, info.get("services.html", {}).get("details"))
    add("HR1", "hire page shows the four day rates", all(x in T("hire.html") for x in ("£22", "£28", "£48", "£12")))
    add("AB1", "about page names the three team members and the founding year", all(x in T("about.html") for x in ("Maren Okafor", "Joss Whitlow", "Priya Raman", "2011")))
    jl = {rel(urljoin(BASE + "journal.html", h)) for h in info.get("journal.html", {}).get("links", []) if h}
    add("J1", "journal page links to the three posts", set(POSTS) <= jl, sorted(set(POSTS) - jl))
    for i, p in enumerate(POSTS):
        d = info.get(p, {}); wc = len(d.get("article", "").split()); back = any(rel(urljoin(BASE + p, h)) == "journal.html" for h in d.get("links", []) if h)
        add(f"J{i+2}", f"post {i+1}: article of 180+ words, a 2026 date, link back to the journal", wc >= 175 and "2026" in d.get("text", "") and back, f"words={wc} back={back}")
    hl = {rel(urljoin(BASE, h)) for h in info.get("index.html", {}).get("links", []) if h}
    add("HM1", "home links to services, hire and a journal post", {"services.html", "hire.html"} <= hl and bool(hl & set(POSTS)), sorted(hl)[:8])
    # hire calculator
    def calc(bike, days, helmet):
        pg.focus("#hire-bike"); pg.wait_for_timeout(100); pg.select_option("#hire-bike", bike); pg.fill("#hire-days", str(days)); pg.dispatch_event("#hire-days", "change"); pg.locator("#hire-days").blur()
        if pg.is_checked("#hire-helmet") != helmet: pg.click("#hire-helmet")
        pg.wait_for_timeout(150); m = re.search(r"£\s*([\d,]+\.\d\d)", pg.inner_text("#hire-total")); return float(m.group(1).replace(",", "")) if m else None
    def hire():
        pg.goto(BASE + "hire.html"); pg.wait_for_timeout(300); res = {}
        for cid, args, want in (("HR2", ("city", 1, False), 22.00), ("HR3", ("hybrid", 3, True), 80.40), ("HR4", ("ebike", 14, False), 571.20), ("HR5", ("kids", 2, True), 30.00), ("HR6", ("city", 20, False), 261.80), ("HR7", ("city", 0, False), 22.00)):
            try: got = calc(*args); add(cid, f"hire calculator {args} = £{want:.2f}", got is not None and abs(got - want) < 0.006, got)
            except Exception as e: add(cid, f"hire calculator {args}", False, repr(e)[:150])
    try: hire()
    except Exception as e: add("HR2", "hire calculator usable", False, repr(e)[:200])
    # contact form
    def contact():
        reqs = []; pg.goto(BASE + "contact.html"); pg.wait_for_timeout(300); pg.on("request", lambda r: reqs.append(r.url))
        f = "#contact-form "; inv = lambda n: pg.get_attribute(f + f"[name={n}]", "aria-invalid") == "true"
        opts = pg.evaluate("() => [...document.querySelectorAll('#contact-form select[name=topic] option')].map(o => o.textContent.trim()).filter(Boolean)")
        add("CF1", "contact form has the five fields and four topics", all(pg.locator(f + f"[name={n}]").count() == 1 for n in ("name", "email", "phone", "topic", "message")) and {"Repair", "Hire", "Sales", "Other"} <= set(opts), opts)
        st = lambda: (pg.inner_text("#form-status") if pg.locator("#form-status").count() else "").strip()
        add("CF2", "#form-status exists and is empty before submitting", pg.locator("#form-status").count() == 1 and st() == "", st()[:60])
        sub = pg.locator(f + "[type=submit], " + f + "button:not([type=button]):not([type=reset])").first
        sub.click(); pg.wait_for_timeout(300)
        add("CF3", "empty submit marks name, email and message invalid and shows no confirmation", inv("name") and inv("email") and inv("message") and st() == "", [inv("name"), inv("email"), inv("message"), st()[:40]])
        pg.fill(f + "[name=name]", "Rowan Tester"); pg.fill(f + "[name=email]", "not-an-email"); pg.fill(f + "[name=message]", "too short"); sub.click(); pg.wait_for_timeout(300)
        add("CF4", "bad email and short message are marked invalid, a filled name is not", inv("email") and inv("message") and not inv("name") and st() == "", [inv("name"), inv("email"), inv("message")])
        reqs.clear(); pg.fill(f + "[name=email]", "rowan@example.org"); pg.fill(f + "[name=message]", "My rear wheel has a wobble, can you true it this week?")
        if sub.count(): sub.click()
        pg.wait_for_timeout(500)
        add("CF5", "valid submit shows a confirmation with the sender's name", "Rowan" in st(), st()[:80])
        add("CF6", "valid submit makes no network request and does not reload the page", not reqs and "?" not in pg.url, (reqs[:2], pg.url[-30:]))
    try: contact()
    except Exception as e: add("CF1", "contact form usable", False, repr(e)[:200])
    # responsive
    over = []
    for w in (360, 768, 1440, 1920):
        p2 = newpage(w, 800)
        for p in have:
            p2.goto(BASE + p, wait_until="load"); p2.wait_for_timeout(150)
            sw = p2.evaluate("() => document.documentElement.scrollWidth")
            if sw > w + 1: over.append(f"{p}@{w}:{sw}")
            if w == 360 and p in ("index.html", "hire.html", "contact.html", "services.html"): p2.screenshot(path=os.path.join(out, "shots", "phone-" + p.replace(".html", "") + ".png"), full_page=True)
        p2.context.close()
    add("RS1", "no horizontal scrolling at 360, 768, 1440 and 1920 px", bool(have) and not over, over[:6])
    SEEN = """el => { if (!el) return false; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) < 0.05) return false; }
      const t = document.elementFromPoint(cx, cy); return !!t && (t === el || el.contains(t) || t.contains(el)); }"""
    def mobnav():
        p2 = newpage(360, 740); p2.goto(BASE + "index.html"); p2.wait_for_timeout(300)
        btn = p2.locator("header button[aria-expanded], nav button[aria-expanded], button[aria-expanded]").first
        link = p2.locator("nav a[href$='about.html']").first; seen = lambda: link.evaluate(SEEN)
        a = (btn.get_attribute("aria-expanded"), seen()); btn.click(); p2.wait_for_timeout(600)
        b_ = (btn.get_attribute("aria-expanded"), seen()); p2.screenshot(path=os.path.join(out, "shots", "phone-nav-open.png")); btn.click(); p2.wait_for_timeout(600)
        c = (btn.get_attribute("aria-expanded"), seen()); p2.context.close()
        return a == ("false", False) and b_ == ("true", True) and c == ("false", False), (a, b_, c)
    guard("RS2", "at 360 px the nav is behind a button that opens and closes it", mobnav)
    def desknav():
        p2 = newpage(1280, 800); p2.goto(BASE + "index.html"); p2.wait_for_timeout(200); v = p2.locator("nav a[href$='about.html']").first.evaluate(SEEN); p2.context.close(); return v
    guard("RS3", "at 1280 px the nav links are visible without a button", desknav)
    add("Q1", "no console errors on any page", not errs, errs[:3])
    add("Q2", "no network requests to other hosts", not ext, ext[:3])
    def fileurl():
        p2 = newpage(); fe = []; p2.on("pageerror", lambda e: fe.append(str(e)[:100]))
        p2.goto("file://" + os.path.join(build, "index.html")); p2.wait_for_timeout(300); p2.locator("nav a[href$='about.html']").first.click(); p2.wait_for_load_state(); p2.wait_for_timeout(300)
        ok1 = p2.url.endswith("about.html") and p2.locator("h1").count() == 1
        p2.goto("file://" + os.path.join(build, POSTS[1])); p2.wait_for_timeout(300); p2.locator("a[href$='journal.html']").first.click(); p2.wait_for_load_state(); p2.wait_for_timeout(300)
        ok2 = p2.url.endswith("journal.html") and p2.locator("h1").count() == 1; p2.context.close()
        return ok1 and ok2 and not fe, (ok1, ok2, fe[:2])
    guard("Q3", "works from file://: navigation from home and from a post, no errors", fileurl)
    b.close()
finish(out)
