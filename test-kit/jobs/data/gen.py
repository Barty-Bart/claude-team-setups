#!/usr/bin/env python3
"""Generates the messy dataset for the data job and the hidden truth. Usage: gen.py <files_dir> <truth.json>"""
import sys, os, csv, json, random, datetime as dt, statistics
out, truthp = sys.argv[1], sys.argv[2]
R = random.Random(20261113)
os.makedirs(os.path.join(out, "data"), exist_ok=True)
COUNTRY = {"United States": (["United States", "USA", "US"], "USD", 34), "United Kingdom": (["United Kingdom", "UK", "U.K."], "GBP", 24),
           "Germany": (["Germany", "DE", "Deutschland"], "EUR", 16), "Canada": (["Canada"], "USD", 10), "Australia": (["Australia"], "USD", 9), "France": (["France"], "EUR", 7)}
RATE = {"USD": 1.0, "EUR": 1.10, "GBP": 1.30}
SRC = ["search", "social", "podcast", "friend", "ads"]; SRCW = [30, 22, 14, 20, 14]
PLAN = ["basic", "plus", "premium"]; PLANW = [50, 33, 17]
PRICE = {"basic": (16, 22), "plus": (27, 35), "premium": (44, 58)}
d0 = dt.date(2024, 6, 1)
def fdate(d): return d.isoformat() if R.random() < 0.7 else d.strftime("%d/%m/%Y")
def messy(s): return R.choice([s, s, s, s.capitalize(), s.upper(), s + " ", " " + s])
# ---- customers
cust = []
for i in range(1, 1261):
    cn = R.choices(list(COUNTRY), [v[2] for v in COUNTRY.values()])[0]
    test = i % 31 == 7
    signup = d0 + dt.timedelta(days=int(R.random() ** 1.3 * 560))
    cust.append({"id": f"C{i:04d}", "email": f"user{i}@" + ("kettletest.example" if test else R.choice(["mail.example", "inbox.example", "post.example"])),
                 "signup": signup, "country": cn, "plan": R.choices(PLAN, PLANW)[0], "source": R.choices(SRC, SRCW)[0], "test": test})
with open(os.path.join(out, "data", "customers.csv"), "w", newline="") as f:
    w = csv.writer(f); w.writerow(["customer_id", "email", "signup_date", "country", "plan", "referral_source"])
    for c in cust: w.writerow([c["id"], c["email"], fdate(c["signup"]), R.choice(COUNTRY[c["country"]][0]), messy(c["plan"]), c["source"]])
# ---- orders
months = [(2024, m) for m in range(7, 13)] + [(2025, m) for m in range(1, 13)]
orders = []; oid = 10000
for k, (y, m) in enumerate(months):
    n = int(330 * 1.035 ** k * (0.58 if (y, m) == (2025, 8) else 1.0) * (1.35 if (y, m) == (2025, 12) else 1.0))
    first = dt.date(y, m, 1); days = ((dt.date(y + (m == 12), m % 12 + 1, 1)) - first).days
    pool = [c for c in cust if c["signup"] <= first + dt.timedelta(days=days - 1)]
    for _ in range(n):
        c = R.choice(pool); d = first + dt.timedelta(days=R.randrange(days))
        if d < c["signup"]: d = c["signup"]
        if (d.year, d.month) != (y, m): continue
        lo, hi = PRICE[c["plan"]]; amt = round(R.uniform(lo, hi), 2)
        r = R.random(); pr = 0.13 if c["source"] == "podcast" else 0.04
        status = "refunded" if r < pr else ("failed" if r < pr + 0.03 else "paid")
        coupon = R.choice(["WELCOME10", "TEATIME", "PODCAST20"]) if R.random() < 0.22 else ""
        oid += 1
        orders.append({"id": f"O{oid}", "cid": c["id"], "date": d, "amt": amt, "cur": COUNTRY[c["country"]][1], "status": status, "coupon": coupon})
rows = []
for o in orders:
    a = f"{o['amt']:.2f}"; sym = {"USD": "$", "EUR": "€", "GBP": "£"}[o["cur"]]
    a = R.choice([a, a, a, sym + a, sym + " " + a, a + " "])
    rows.append([o["id"], o["cid"], fdate(o["date"]), a, o["cur"], messy(o["status"]), o["coupon"]])
noamt = set(R.sample(range(len(rows)), 25))
for i in noamt: rows[i][3] = ""
ghost = []
for j in range(70):   # orders that point at customers who are not in customers.csv
    oid += 1; d = dt.date(2025, R.randrange(1, 13), R.randrange(1, 28))
    ghost.append([f"O{oid}", f"C{R.randrange(5000, 6000)}", fdate(d), f"{R.uniform(16, 58):.2f}", R.choice(list(RATE)), "paid", ""])
allrows = rows + ghost
allrows += [list(allrows[i]) for i in R.sample(range(len(allrows)), 160)]   # exact duplicate rows
R.shuffle(allrows)
with open(os.path.join(out, "data", "orders.csv"), "w", newline="") as f:
    w = csv.writer(f); w.writerow(["order_id", "customer_id", "order_date", "amount", "currency", "status", "coupon"]); w.writerows(allrows)
# ---- tickets
CAT = {"delivery": (30, 2.6, 20), "billing": (22, 3.6, 46), "product": (28, 4.1, 14), "account": (20, 3.9, 9)}   # weight, mean satisfaction, typical hours
tickets = []
for i in range(1, 1521):
    c = R.choice(cust); cat = R.choices(list(CAT), [v[0] for v in CAT.values()])[0]
    opened = dt.datetime(2025, 1, 1) + dt.timedelta(minutes=R.randrange(364 * 24 * 60))
    res = None; bad = False
    if R.random() < 0.9:
        res = opened + dt.timedelta(minutes=int(R.lognormvariate(0, 0.7) * CAT[cat][2] * 60))
        if R.random() < 0.012: res = opened - dt.timedelta(hours=R.randrange(2, 90)); bad = True
    sat = ""
    if res and not bad and R.random() < 0.7: sat = min(5, max(1, round(R.gauss(CAT[cat][1], 0.9))))
    tickets.append({"id": f"T{i:05d}", "cid": c["id"], "opened": opened, "cat": cat, "res": res, "sat": sat})
ft = lambda t: t.strftime("%Y-%m-%d %H:%M")
with open(os.path.join(out, "data", "tickets.csv"), "w", newline="") as f:
    w = csv.writer(f); w.writerow(["ticket_id", "customer_id", "opened_at", "category", "resolved_at", "satisfaction"])
    for t in tickets: w.writerow([t["id"], t["cid"], ft(t["opened"]), t["cat"], ft(t["res"]) if t["res"] else "", t["sat"]])

# ---- truth, computed by reading the files back and applying the rules in BRIEF.md
def pdate(s):
    s = s.strip()
    return dt.datetime.strptime(s, "%d/%m/%Y").date() if "/" in s else dt.date.fromisoformat(s)
CANON = {v: k for k, (vs, _, _) in COUNTRY.items() for v in vs}
C = {}
for r in csv.DictReader(open(os.path.join(out, "data", "customers.csv"))):
    if r["email"].strip().lower().endswith("@kettletest.example"): continue
    C[r["customer_id"]] = {"country": CANON[r["country"].strip()], "plan": r["plan"].strip().lower(), "source": r["referral_source"].strip()}
seen = set(); O = []
for r in csv.reader(list(open(os.path.join(out, "data", "orders.csv")))[1:]):
    if tuple(r) in seen: continue
    seen.add(tuple(r))
    if r[1] not in C or not r[3].strip(): continue
    O.append({"cid": r[1], "date": pdate(r[2]), "usd": float(r[3].replace("$", "").replace("€", "").replace("£", "").replace(",", "").strip()) * RATE[r[4].strip()],
              "status": r[5].strip().lower(), "coupon": r[6].strip()})
paid = [o for o in O if o["status"] == "paid"]; refunded = [o for o in O if o["status"] == "refunded"]
rev = {}
for o in paid: rev[(o["date"].year, o["date"].month)] = rev.get((o["date"].year, o["date"].month), 0) + o["usd"]
m25 = [(2025, m) for m in range(1, 13)]
prev = lambda y, m: (y - 1, 12) if m == 1 else (y, m - 1)
drops = {ym: rev[ym] - rev[prev(*ym)] for ym in m25}
cc = {}
for c in C.values(): cc[c["country"]] = cc.get(c["country"], 0) + 1
aov = {p: statistics.mean(o["usd"] for o in paid if C[o["cid"]]["plan"] == p) for p in PLAN}
cnt = {}
for o in paid: cnt[o["cid"]] = cnt.get(o["cid"], 0) + 1
rr = {}
for s in SRC:
    p = sum(1 for o in paid if C[o["cid"]]["source"] == s); q = sum(1 for o in refunded if C[o["cid"]]["source"] == s); rr[s] = q / (p + q)
hours = []; sat = {}
for r in csv.DictReader(open(os.path.join(out, "data", "tickets.csv"))):
    if r["customer_id"] not in C: continue
    if r["resolved_at"].strip():
        h = (dt.datetime.strptime(r["resolved_at"], "%Y-%m-%d %H:%M") - dt.datetime.strptime(r["opened_at"], "%Y-%m-%d %H:%M")).total_seconds() / 3600
        if h >= 0: hours.append(h)
    if r["satisfaction"].strip(): sat.setdefault(r["category"], []).append(float(r["satisfaction"]))
truth = {"q1_real_customers": len(C), "q2_revenue_2025_usd": round(sum(rev[ym] for ym in m25), 2),
         "q3_best_month_2025": "%d-%02d" % max(m25, key=lambda ym: rev[ym]), "q4_biggest_drop_month_2025": "%d-%02d" % min(m25, key=lambda ym: drops[ym]),
         "q5_refund_rate_pct": round(100 * len(refunded) / (len(paid) + len(refunded)), 1), "q6_top_country_by_customers": max(cc, key=cc.get),
         "q7_aov_by_plan_usd": {p: round(v, 2) for p, v in aov.items()}, "q8_repeat_customer_pct": round(100 * sum(1 for v in cnt.values() if v >= 2) / len(cnt), 1),
         "q9_highest_refund_source": max(rr, key=rr.get), "q10_median_resolution_hours": round(statistics.median(hours), 1),
         "q11_lowest_satisfaction_category": min(sat, key=lambda k: statistics.mean(sat[k])), "q12_coupon_order_pct": round(100 * sum(1 for o in paid if o["coupon"]) / len(paid), 1)}
extra = {"monthly_revenue": {"%d-%02d" % k: round(v, 2) for k, v in sorted(rev.items())}, "drops": {"%d-%02d" % k: round(v) for k, v in drops.items()}, "refund_rate_by_source": {k: round(100 * v, 1) for k, v in rr.items()},
         "customers_by_country": cc, "sat_by_cat": {k: round(statistics.mean(v), 2) for k, v in sat.items()}, "n_orders_rows": len(allrows), "n_orders_clean": len(O), "n_tickets_bad": sum(1 for t in tickets if t["res"] and t["res"] < t["opened"])}
json.dump({"truth": truth, "extra": extra}, open(truthp, "w"), indent=1)
print(json.dumps(truth, indent=1)); print(json.dumps(extra))
