#!/usr/bin/env python3
"""Hidden checks for the data-analysis job. Usage: check_data.py <build_dir> <out_dir>"""
import sys, os, re, json
from playwright.sync_api import sync_playwright
from common import add, guard, finish, serve
build, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
H = os.path.dirname(os.path.abspath(__file__)); os.makedirs(os.path.join(out, "shots"), exist_ok=True)
T = json.load(open(os.path.join(H, "data_truth.json")))["truth"]
try: A = json.load(open(os.path.join(build, "answers.json")))
except Exception as e: A = None; add("D0", "answers.json is valid JSON", False, repr(e)[:150])
if A is not None:
    add("D0", "answers.json has exactly the twelve keys", isinstance(A, dict) and set(A) == set(T), sorted(set(A) ^ set(T))[:5] if isinstance(A, dict) else type(A).__name__)
    A = A if isinstance(A, dict) else {}
    num = lambda k, tol: (isinstance(A.get(k), (int, float)) and abs(A[k] - T[k]) <= tol, A.get(k))
    txt = lambda k: (isinstance(A.get(k), str) and A[k].strip().lower() == T[k].lower(), A.get(k))
    for cid, desc, r in (("Q1", "number of real customers", num("q1_real_customers", 0)), ("Q2", "2025 revenue in USD (within $1)", num("q2_revenue_2025_usd", 1.0)),
                         ("Q3", "best month of 2025", txt("q3_best_month_2025")), ("Q4", "month with the biggest revenue drop", txt("q4_biggest_drop_month_2025")),
                         ("Q5", "refund rate", num("q5_refund_rate_pct", 0.11)), ("Q6", "top country by customers", txt("q6_top_country_by_customers")),
                         ("Q8", "repeat-customer percentage", num("q8_repeat_customer_pct", 0.11)), ("Q9", "referral source with the highest refund rate", txt("q9_highest_refund_source")),
                         ("Q10", "median resolution hours", num("q10_median_resolution_hours", 0.11)), ("Q11", "category with the lowest satisfaction", txt("q11_lowest_satisfaction_category")),
                         ("Q12", "coupon share of paid orders", num("q12_coupon_order_pct", 0.11))):
        add(cid, desc, r[0], r[1])
    q7 = A.get("q7_aov_by_plan_usd") if isinstance(A.get("q7_aov_by_plan_usd"), dict) else {}
    for p in ("basic", "plus", "premium"):
        add("Q7-" + p, f"average order value, {p} plan", isinstance(q7.get(p), (int, float)) and abs(q7[p] - T["q7_aov_by_plan_usd"][p]) <= 0.015, q7.get(p))
rp = os.path.join(build, "report.html")
add("R1", "report.html exists", os.path.isfile(rp))
if os.path.isfile(rp):
    port = serve(build); BASE = f"http://127.0.0.1:{port}/"; errs, ext = [], []
    with sync_playwright() as pw:
        b = pw.chromium.launch(); ctx = b.new_context(viewport={"width": 1280, "height": 900}); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)[:120])); pg.on("console", lambda m: errs.append(m.text[:120]) if m.type == "error" else None)
        pg.on("request", lambda r: ext.append(r.url[:100]) if not r.url.startswith((BASE, "data:", "blob:", "about:")) else None)
        pg.goto(BASE + "report.html", wait_until="load"); pg.wait_for_timeout(1200)
        d = pg.evaluate("""() => { const big = e => { const r = e.getBoundingClientRect(); return r.width >= 240 && r.height >= 110; };
            const charts = [...document.querySelectorAll('svg, canvas')].filter(big).filter(e => e.tagName !== 'svg' || e.querySelectorAll('rect, path, line, circle, polyline, polygon').length >= 4).length;
            return {charts, text: document.body.innerText, sw: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight}; }""")
        text = d["text"]; low = text.lower()
        add("R2", "report loads with no console errors and no requests to other hosts", not errs and not ext, (errs[:2], ext[:2]))
        add("R3", "at least four charts drawn as inline SVG or canvas", d["charts"] >= 4, d["charts"])
        add("R4", "the report has real written content (350+ words)", len(text.split()) >= 350, len(text.split()))
        add("R5", "cleaning section mentions duplicates and test accounts", "duplicate" in low and "test" in low and "clean" in low)
        add("R6", "the report makes recommendations", bool(re.search(r"recommend|things to do|what to do|next steps|what to fix|fix first|actions? to take|should (do|fix|start)", low)))
        add("R7", "no horizontal scrolling at 1280 px", d["sw"] <= 1281, d["sw"])
        rev = T["q2_revenue_2025_usd"]; pats = [f"{rev:,.0f}", f"{rev:,.2f}", f"{rev / 1000:.1f}k", f"{rev / 1000:.0f}k", f"{rev / 1000:.1f}K", f"{rev / 1000:.0f}K", f"{int(rev):,}", f"{rev / 1e6:.2f}M".lstrip("0")]
        add("R8", "the report states the 2025 revenue figure correctly", any(p in text.replace(" ", "") for p in pats), pats[:3], core=False)
        add("R9", "the report mentions the podcast refund problem and the August drop", "podcast" in low and ("august" in low or "aug " in low or "2025-08" in low), core=False)
        h = min(d["h"], 9000); n = 0
        for y in range(0, h, 1500):
            pg.screenshot(path=os.path.join(out, "shots", f"report-{n + 1:02d}.png"), clip={"x": 0, "y": y, "width": 1280, "height": min(1500, h - y)}, full_page=True); n += 1
        b.close()
def codep():
    fs = [f for dp, dns, fns in os.walk(build) for f in fns if ".claude" not in dp and "node_modules" not in dp and f.endswith((".py", ".js", ".mjs", ".ipynb", ".sh"))]
    rd = open(os.path.join(build, "README.md")).read(); return bool(fs) and bool(re.search(r"(python3?|node|bash|sh)\s+\S+", rd)), fs[:4]
guard("R10", "the analysis code is in the folder and README says how to run it", codep)
finish(out)
