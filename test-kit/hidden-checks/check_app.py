#!/usr/bin/env python3
"""Hidden checks for the full-stack app job. Usage: check_app.py <build_dir> <out_dir>
The build's server runs in a container (host network, random port, DATA_DIR on a temp folder); the API is driven with urllib and the UI with Playwright."""
import sys, os, re, json, time, shutil, tempfile, socket, subprocess, secrets, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
from common import add, guard, finish, node_container
build, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
os.makedirs(os.path.join(out, "shots"), exist_ok=True)
tmp = tempfile.mkdtemp(prefix="app-"); W = tmp + "/w"
shutil.copytree(build, W, ignore=shutil.ignore_patterns("node_modules", ".claude", "data", "test-results"))
os.system(f"chmod -R a+rwX {tmp}")
def freeport():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p
class Srv:
    def __init__(self, name): self.dd = f"{tmp}/dd-{name}"; os.makedirs(self.dd, exist_ok=True); os.chmod(self.dd, 0o777); self.cn = None
    def start(self):
        self.port = freeport(); self.cn = "app-" + secrets.token_hex(4); self.base = f"http://127.0.0.1:{self.port}"
        node_container([f"{W}:/w", f"{self.dd}:/dd"], ["server.js"], network="host", env={"PORT": self.port, "DATA_DIR": "/dd"}, name=self.cn, detach=True, timeout=60)
        for _ in range(60):
            try: urllib.request.urlopen(self.base + "/", timeout=2); return True
            except urllib.error.HTTPError: return True
            except Exception: time.sleep(0.5)
        return False
    def stop(self):
        if self.cn: subprocess.run(["docker", "kill", self.cn], capture_output=True); time.sleep(1); self.cn = None
    def call(self, method, path, body=None, token=None, raw=None):
        h = {"Content-Type": "application/json"}
        if token: h["Authorization"] = "Bearer " + token
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            r = urllib.request.urlopen(req, timeout=15); st, txt = r.status, r.read().decode()
        except urllib.error.HTTPError as e: st, txt = e.code, e.read().decode()
        try: js = json.loads(txt) if txt.strip() else None
        except Exception: js = {"_raw": txt[:200]}
        return st, js
code = lambda j: ((j or {}).get("error") or {}).get("code") if isinstance(j, dict) else None
PW = "s3cret-Passw0rd-xyzzy"
S = Srv("main")
try:
    up = os.path.isfile(W + "/server.js") and S.start()
    add("B0", "node server.js starts and answers on PORT", up)
    if up:
        c = S.call
        st, j = c("POST", "/api/register", {"email": "Ada@Example.org", "password": PW, "name": "Ada Admin"}); A = (j or {}).get("token"); ua = (j or {}).get("user") or {}
        add("A1", "register: 201 with token; first user is admin; no password in the reply", st == 201 and A and ua.get("role") == "admin" and ua.get("email") and not any("pass" in k.lower() or "hash" in k.lower() for k in ua), (st, ua))
        st, j = c("POST", "/api/register", {"email": "ben@example.org", "password": PW + "2", "name": "Ben Agent"}); B = (j or {}).get("token"); ub = (j or {}).get("user") or {}
        add("A2", "second user is an agent", st == 201 and ub.get("role") == "agent", (st, ub))
        st, j = c("POST", "/api/register", {"email": "ADA@example.org", "password": PW, "name": "Dup"}); add("A3", "duplicate email (other case) is 409 conflict", st == 409 and code(j) == "conflict", (st, j))
        r = [c("POST", "/api/register", b) for b in ({"email": "nope", "password": PW, "name": "X"}, {"email": "s@example.org", "password": "short", "name": "X"}, {"email": "n@example.org", "password": PW, "name": "  "})]
        add("A4", "register validation: bad email, short password, empty name are 400 validation", all(s == 400 and code(j) == "validation" for s, j in r), [(s, code(j)) for s, j in r])
        st, j = c("POST", "/api/login", {"email": "ada@example.org", "password": PW}); A2 = (j or {}).get("token"); st2, j2 = c("POST", "/api/login", {"email": "ada@example.org", "password": "wrong-password"})
        add("A5", "login works; wrong password is 401 unauthorized", st == 200 and A2 and st2 == 401 and code(j2) == "unauthorized", (st, st2, code(j2)))
        r = [c("GET", "/api/me", token=A), c("GET", "/api/me"), c("GET", "/api/me", token="garbage"), c("GET", "/api/tickets"), c("GET", "/api/stats")]
        add("A6", "/api/me returns the user; no or bad token is 401 everywhere", r[0][0] == 200 and ((r[0][1] or {}).get("user") or {}).get("name") == "Ada Admin" and all(x[0] == 401 and code(x[1]) == "unauthorized" for x in r[1:]), [x[0] for x in r])
        st, _ = c("POST", "/api/logout", token=A2); st2, _ = c("GET", "/api/me", token=A2); add("A7", "logout is 204 and the token stops working", st == 204 and st2 == 401, (st, st2))
        st, j = c("GET", "/api/users", token=B); it = (j or {}).get("items") or []
        add("A8", "users list has both users and leaks no password", st == 200 and len(it) == 2 and not any("pass" in k.lower() or "hash" in k.lower() for u in it for k in u), it[:1])
        st, j = c("POST", "/api/tickets", {"title": "  Printer on fire  ", "description": "Smoke from tray 2"}, token=B); t1 = (j or {}).get("ticket") or {}
        add("T1", "create ticket: 201, trimmed title, defaults open/normal/unassigned, createdBy, commentCount 0", st == 201 and t1.get("title") == "Printer on fire" and t1.get("status") == "open" and t1.get("priority") == "normal" and t1.get("tags") == [] and t1.get("assigneeId") is None and str(t1.get("createdBy")) == str(ub.get("id")) and t1.get("commentCount") == 0 and re.match(r"\d{4}-\d\d-\d\dT", str(t1.get("createdAt"))), (st, t1))
        st, j = c("POST", "/api/tickets", {"title": "Invoice wrong", "description": "Charged twice for March", "priority": "high", "tags": [" Billing ", "billing", "VIP"]}, token=A); t2 = (j or {}).get("ticket") or {}
        add("T2", "tags are trimmed, lowercased and deduplicated", st == 201 and sorted(t2.get("tags") or []) == ["billing", "vip"] and t2.get("priority") == "high", t2.get("tags"))
        r = [c("POST", "/api/tickets", {"title": "   ", "description": ""}, token=A), c("POST", "/api/tickets", {"title": "x" * 121, "description": ""}, token=A), c("POST", "/api/tickets", {"title": "ok", "description": "", "priority": "mega"}, token=A), c("POST", "/api/tickets", raw=b"{not json", token=A)]
        add("T3", "ticket validation: blank title, 121-char title, bad priority, malformed JSON are 400 validation", all(s == 400 and code(j) == "validation" for s, j in r), [(s, code(j)) for s, j in r])
        st, j = c("GET", f"/api/tickets/{t1.get('id')}", token=A); st2, j2 = c("GET", "/api/tickets/987654321", token=A)
        add("T4", "get one ticket; unknown id is 404 not_found", st == 200 and ((j or {}).get("ticket") or {}).get("title") == "Printer on fire" and st2 == 404 and code(j2) == "not_found", (st, st2, code(j2)))
        PR = ["low", "normal", "high", "urgent"]; made = []
        for i in range(23):
            s_, j_ = c("POST", "/api/tickets", {"title": f"Bulk ticket {i:02d}" + (" zebra" if i % 6 == 0 else ""), "description": "Quokka mention" if i % 5 == 0 else "plain", "priority": PR[i % 4], "tags": ["bulk"] + (["odd"] if i % 2 else [])}, token=A)
            made.append((j_ or {}).get("ticket") or {}); time.sleep(0.003)
        st, j = c("GET", "/api/tickets", token=A); L = j or {}
        add("T5", "list: items/total/page/pageSize, 20 per page by default", st == 200 and L.get("total") == 25 and len(L.get("items") or []) == 20 and L.get("page") == 1 and L.get("pageSize") == 20, {k: L.get(k) for k in ("total", "page", "pageSize")})
        r2 = c("GET", "/api/tickets?page=2", token=A)[1] or {}; r3 = c("GET", "/api/tickets?pageSize=7&page=4", token=A)[1] or {}
        ids1 = {str(x.get("id")) for x in L.get("items") or []}; ids2 = {str(x.get("id")) for x in r2.get("items") or []}
        add("T6", "paging: page 2 has the other 5, pageSize and page are honoured", len(ids2) == 5 and not (ids1 & ids2) and len(r3.get("items") or []) == 4 and r3.get("total") == 25, (len(ids2), len(r3.get("items") or [])))
        g = lambda q: (c("GET", "/api/tickets?pageSize=100&" + q, token=A)[1] or {})
        add("T7", "filter by priority, tag and status; unknown status is 400", g("priority=urgent").get("total") == 5 and g("tag=odd").get("total") == 11 and g("tag=billing").get("total") == 1 and g("status=open").get("total") == 25 and g("status=solved").get("total") == 0 and g("priority=high&tag=odd").get("total") == 0 and c("GET", "/api/tickets?status=bogus", token=A)[0] == 400, [g("priority=urgent").get("total"), g("tag=odd").get("total"), g("priority=high&tag=odd").get("total")])
        add("T8", "q searches title and description, ignoring case", g("q=ZEBRA").get("total") == 4 and g("q=quokka").get("total") == 5 and g("q=printer").get("total") == 1 and g("q=nothinglikethis").get("total") == 0, [g("q=ZEBRA").get("total"), g("q=quokka").get("total")])
        rank = lambda xs: [PR.index(x.get("priority")) for x in xs]
        d = rank(g("sort=priority&order=desc").get("items") or []); a_ = rank(g("sort=priority&order=asc").get("items") or [])
        cr = [x.get("createdAt") for x in g("").get("items") or []]; ca = [x.get("createdAt") for x in g("sort=createdAt&order=asc").get("items") or []]
        add("T9", "sorting by priority and by createdAt, both directions; newest first by default", len(d) == 25 and d == sorted(d, reverse=True) and a_ == sorted(a_) and cr == sorted(cr, reverse=True) and ca == sorted(ca) and cr[0] != cr[-1], (d[:3], a_[:3]))
        tid = t1.get("id"); time.sleep(0.03)
        st, j = c("PATCH", f"/api/tickets/{tid}", {"title": "Printer smoking", "priority": "urgent", "tags": ["Hardware", "hardware "]}, token=A); p1 = (j or {}).get("ticket") or {}
        add("P1", "patch title, priority and tags; updatedAt moves forward", st == 200 and p1.get("title") == "Printer smoking" and p1.get("priority") == "urgent" and p1.get("tags") == ["hardware"] and str(p1.get("updatedAt")) > str(t1.get("updatedAt")), (st, p1.get("tags"), p1.get("updatedAt"), t1.get("updatedAt")))
        st, j = c("PATCH", f"/api/tickets/{tid}", {"assigneeId": ub.get("id")}, token=A); st2, j2 = c("PATCH", f"/api/tickets/{tid}", {"assigneeId": 987654321}, token=A)
        add("P2", "assign to a user; an unknown user is rejected", st == 200 and str(((j or {}).get("ticket") or {}).get("assigneeId")) == str(ub.get("id")) and st2 in (400, 404), (st, st2))
        add("T10", "assignee filter: me, none and a user id", g("assignee=me").get("total") == 0 and (c("GET", "/api/tickets?assignee=me", token=B)[1] or {}).get("total") == 1 and g("assignee=none").get("total") == 24 and g(f"assignee={ub.get('id')}").get("total") == 1, [g("assignee=me").get("total"), g("assignee=none").get("total")])
        st, j = c("PATCH", f"/api/tickets/{tid}", {"assigneeId": None}, token=A); add("P3", "assigneeId null unassigns", st == 200 and ((j or {}).get("ticket") or {}).get("assigneeId", 1) is None, st)
        seq = [("pending", 200), ("closed", 409), ("pending", 200), ("solved", 200), ("pending", 409), ("closed", 200), ("open", 409)]; got = []
        for s_, want in seq:
            st, j = c("PATCH", f"/api/tickets/{tid}", {"status": s_}, token=B); got.append((s_, st, ((j or {}).get("ticket") or {}).get("status") if st == 200 else code(j)))
        add("P4", "status rules: allowed changes work, forbidden ones are 409 conflict", all(g_[1] == w[1] and (g_[2] == w[0] if w[1] == 200 else g_[2] == "conflict") for g_, w in zip(got, seq)), got)
        st, j = c("PATCH", f"/api/tickets/{tid}", {"title": "edit after close"}, token=A); add("P5", "a closed ticket cannot be edited (409)", st == 409 and code(j) == "conflict", (st, code(j)))
        st, j = c("PATCH", "/api/tickets/987654321", {"title": "x"}, token=A); st2, j2 = c("PATCH", f"/api/tickets/{t2.get('id')}", {"status": "bogus"}, token=A)
        add("P6", "patch unknown ticket is 404; an invalid status value is 400", st == 404 and st2 == 400, (st, st2))
        t2id = t2.get("id"); before = (c("GET", f"/api/tickets/{t2id}", token=A)[1] or {}).get("ticket") or {}; time.sleep(0.03)
        st, j = c("POST", f"/api/tickets/{t2id}/comments", {"body": "  Refund issued today.  "}, token=B); cm = (j or {}).get("comment") or {}
        after = (c("GET", f"/api/tickets/{t2id}", token=A)[1] or {}).get("ticket") or {}
        add("C1", "comment: 201 with trimmed body and author; ticket commentCount and updatedAt change", st == 201 and cm.get("body") == "Refund issued today." and str(cm.get("authorId")) == str(ub.get("id")) and str(cm.get("ticketId")) == str(t2id) and after.get("commentCount") == 1 and str(after.get("updatedAt")) > str(before.get("updatedAt")), (st, cm, after.get("commentCount")))
        time.sleep(0.01); c("POST", f"/api/tickets/{t2id}/comments", {"body": "Second note"}, token=A)
        st, j = c("GET", f"/api/tickets/{t2id}/comments", token=A); cs = (j or {}).get("items") or []
        r = [c("POST", f"/api/tickets/{t2id}/comments", {"body": "   "}, token=A), c("POST", f"/api/tickets/{t2id}/comments", {"body": "x" * 2001}, token=A)]
        add("C2", "comments list oldest first; blank and 2001-char bodies are 400", st == 200 and [x.get("body") for x in cs] == ["Refund issued today.", "Second note"] and all(s == 400 for s, _ in r), ([x.get("body") for x in cs], [s for s, _ in r]))
        st, j = c("POST", f"/api/tickets/{tid}/comments", {"body": "late"}, token=A); st2, _ = c("POST", "/api/tickets/987654321/comments", {"body": "x"}, token=A)
        add("C3", "commenting on a closed ticket is 409; on an unknown ticket 404", st == 409 and code(j) == "conflict" and st2 == 404, (st, st2))
        st, j = c("GET", "/api/stats", token=A); s_ = j or {}
        add("S1", "stats: totals, unassigned and all four keys in byStatus and byPriority", st == 200 and s_.get("total") == 25 and s_.get("unassigned") == 25 and s_.get("byStatus") == {"open": 24, "pending": 0, "solved": 0, "closed": 1} and s_.get("byPriority") == {"low": 6, "normal": 6, "high": 7, "urgent": 6}, s_)
        st, j = c("DELETE", f"/api/tickets/{t2id}", token=B); st2, _ = c("DELETE", f"/api/tickets/{t2id}", token=A); st3, _ = c("GET", f"/api/tickets/{t2id}", token=A); st4, _ = c("GET", f"/api/tickets/{t2id}/comments", token=A)
        add("D1", "delete: 403 forbidden for an agent, 204 for the admin, then the ticket and its comments are gone", st == 403 and code(j) == "forbidden" and st2 == 204 and st3 == 404 and st4 == 404, (st, st2, st3, st4))
        keep = made[3].get("id"); c("POST", f"/api/tickets/{keep}/comments", {"body": "survives restart"}, token=A)
        st, _ = c("DELETE", f"/api/tickets/{tid}", token=A); add("D2", "the admin can delete a closed ticket", st == 204, st)
        S.stop(); up2 = S.start()
        st, j = S.call("POST", "/api/login", {"email": "ben@example.org", "password": PW + "2"}); B2 = (j or {}).get("token")
        tk = (S.call("GET", f"/api/tickets/{keep}", token=B2)[1] or {}).get("ticket") or {}; cs = (S.call("GET", f"/api/tickets/{keep}/comments", token=B2)[1] or {}).get("items") or []
        add("R1", "users, tickets and comments survive a restart", up2 and st == 200 and (S.call("GET", "/api/tickets", token=B2)[1] or {}).get("total") == 23 and tk.get("title") == made[3].get("title") and [x.get("body") for x in cs] == ["survives restart"], (st, tk.get("title"), len(cs)))
        S.stop()
        leak = [f for dp, _, fs in os.walk(S.dd) for f in fs if PW.encode() in open(os.path.join(dp, f), "rb").read()]
        add("R2", "passwords are not stored in plain text", bool(os.listdir(S.dd)) and not leak, leak or os.listdir(S.dd)[:3])
finally:
    S.stop()
# ---- extended API (fresh data folder)
import csv as _csv, io, datetime as _dt
E = Srv("ext")
try:
    if os.path.isfile(W + "/server.js") and E.start():
        c = E.call
        A = (c("POST", "/api/register", {"email": "ada@example.org", "password": PW, "name": "Ada Admin"})[1] or {}); ua = A.get("user") or {}; A = A.get("token")
        B = (c("POST", "/api/register", {"email": "ben@example.org", "password": PW, "name": "Ben Agent"})[1] or {}); ub = B.get("user") or {}; B = B.get("token")
        mk = lambda t, tok=A, **kw: ((c("POST", "/api/tickets", dict({"title": t, "description": "d"}, **kw), token=tok)[1] or {}).get("ticket") or {})
        r0 = c("GET", "/api/reports/summary", token=A)[1] or {}
        add("RP1", "report on an empty system: 14 zero days ending today (UTC), no tags, avgHoursToSolve null", len(r0.get("createdPerDay") or []) == 14 and all(x.get("count") == 0 for x in r0["createdPerDay"]) and r0["createdPerDay"][-1].get("date") == _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d") and r0.get("topTags") == [] and r0.get("avgHoursToSolve", 0) is None and r0.get("byAssignee") == [], str(r0)[:200])
        t = mk("Audit me", tok=B); tid = t.get("id")
        c("PATCH", f"/api/tickets/{tid}", {"title": "Audit me please"}, token=A); c("PATCH", f"/api/tickets/{tid}", {"status": "pending"}, token=A)
        c("PATCH", f"/api/tickets/{tid}", {"assigneeId": ub.get("id")}, token=A); cm = (c("POST", f"/api/tickets/{tid}/comments", {"body": "note"}, token=B)[1] or {}).get("comment") or {}
        c("PATCH", f"/api/tickets/{tid}", {"title": "Audit me please", "status": "pending"}, token=A)   # changes nothing
        ev = (c("GET", f"/api/tickets/{tid}/events", token=A)[1] or {}).get("items") or []
        want = [("created", {}), ("edited", {"fields": ["title"]}), ("status_changed", {"from": "open", "to": "pending"}), ("assigned", {"from": None, "to": ub.get("id")}), ("commented", {"commentId": cm.get("id")})]
        add("EV1", "events: created, edited, status_changed, assigned, commented in order with their data; a no-op patch adds none", [(e.get("type"), e.get("data")) for e in ev] == want and str(ev[0].get("actorId")) == str(ub.get("id")) and str(ev[1].get("actorId")) == str(ua.get("id")), [(e.get("type"), e.get("data")) for e in ev])
        c("PATCH", f"/api/tickets/{tid}", {"priority": "high", "tags": ["x"], "status": "solved"}, token=A); ev2 = (c("GET", f"/api/tickets/{tid}/events", token=A)[1] or {}).get("items") or []
        new = sorted((e.get("type"), json.dumps(e.get("data"), sort_keys=True)) for e in ev2[5:]); nf = [sorted((e.get("data") or {}).get("fields") or []) for e in ev2[5:] if e.get("type") == "edited"]
        add("EV2", "one PATCH that edits fields and changes status records one edited and one status_changed event", [x[0] for x in new] == ["edited", "status_changed"] and nf == [["priority", "tags"]], new)
        st, j = c("PATCH", f"/api/users/{ub.get('id')}", {"role": "admin"}, token=B); st2, j2 = c("PATCH", f"/api/users/{ub.get('id')}", {"role": "admin", "name": "Ben Boss"}, token=A); u2 = (j2 or {}).get("user") or {}
        st3, _ = c("PATCH", f"/api/users/{ub.get('id')}", {"role": "agent"}, token=A)
        add("AD1", "only an admin can change users; role and name changes are returned", st == 403 and code(j) == "forbidden" and st2 == 200 and u2.get("role") == "admin" and u2.get("name") == "Ben Boss" and u2.get("active") is True and st3 == 200, (st, st2, u2))
        r = [c("PATCH", f"/api/users/{ua.get('id')}", {"role": "agent"}, token=A), c("PATCH", f"/api/users/{ua.get('id')}", {"active": False}, token=A)]
        add("AD2", "the last active admin cannot be demoted or deactivated (409)", all(s_ == 409 and code(j_) == "conflict" for s_, j_ in r), [(s_, code(j_)) for s_, j_ in r])
        st, j = c("PATCH", f"/api/users/{ub.get('id')}", {"active": False}, token=A); st2, _ = c("GET", "/api/me", token=B); st3, j3 = c("POST", "/api/login", {"email": "ben@example.org", "password": PW})
        c("PATCH", f"/api/users/{ub.get('id')}", {"active": True}, token=A); st4, j4 = c("POST", "/api/login", {"email": "ben@example.org", "password": PW}); B = (j4 or {}).get("token") or B
        add("AD3", "a deactivated user's token stops working (401) and they cannot sign in (403); reactivating restores access", st == 200 and ((j or {}).get("user") or {}).get("active") is False and st2 == 401 and st3 == 403 and code(j3) == "forbidden" and st4 == 200, (st, st2, st3, st4))
        o1 = mk("Bulk one", tags=["net", "vip"]); o2 = mk("Bulk two", tags=["net"]); cl = mk("Bulk closed", tags=["net", "vip", "zed"])
        for s_ in ("solved", "closed"): c("PATCH", f"/api/tickets/{cl.get('id')}", {"status": s_}, token=A)
        st, j = c("POST", "/api/tickets/bulk", {"ids": [o1.get("id"), cl.get("id"), 987654321, o2.get("id")], "changes": {"status": "pending"}}, token=B); j = j or {}
        fl = {str(x.get("id")): x.get("code") for x in j.get("failed") or []}
        add("BK1", "bulk status change: allowed tickets are updated, a closed one fails with conflict, an unknown id with not_found", st == 200 and sorted(map(str, j.get("updated") or [])) == sorted(map(str, [o1.get("id"), o2.get("id")])) and fl == {str(cl.get("id")): "conflict", "987654321": "not_found"} and (c("GET", f"/api/tickets/{o1.get('id')}", token=A)[1] or {}).get("ticket", {}).get("status") == "pending", (st, j))
        r = [c("POST", "/api/tickets/bulk", {"ids": [o1.get("id")], "changes": {}}, token=A), c("POST", "/api/tickets/bulk", {"ids": [o1.get("id")], "changes": {"status": "bogus"}}, token=A)]
        st, j = c("POST", "/api/tickets/bulk", {"ids": [o1.get("id"), o2.get("id")], "changes": {"priority": "urgent", "assigneeId": ua.get("id")}}, token=A)
        g1 = (c("GET", f"/api/tickets/{o2.get('id')}", token=A)[1] or {}).get("ticket") or {}
        add("BK2", "bulk: empty or invalid changes are a 400; priority and assignee can be set on several tickets", all(s_ == 400 for s_, _ in r) and st == 200 and len((j or {}).get("updated") or []) == 2 and g1.get("priority") == "urgent" and str(g1.get("assigneeId")) == str(ua.get("id")), ([s_ for s_, _ in r], st))
        tricky = mk('He said "wait", then left', tags=["csv"])
        def getcsv(q=""):
            req = urllib.request.Request(E.base + "/api/tickets/export.csv" + q, headers={"Authorization": "Bearer " + A}); r_ = urllib.request.urlopen(req, timeout=15)
            return r_.headers.get("Content-Type", ""), list(_csv.reader(io.StringIO(r_.read().decode("utf-8-sig"), newline="")))
        def ex():
            ct, rows = getcsv(); hdr = rows[0]; body = [dict(zip(hdr, r_)) for r_ in rows[1:] if r_]
            by = {r_["title"]: r_ for r_ in body}; ctf, rf = getcsv("?tag=vip&sort=createdAt&order=asc")
            return ("text/csv" in ct and hdr == ["id", "title", "status", "priority", "tags", "assignee", "createdAt", "updatedAt", "commentCount"] and len(body) == 5 and 'He said "wait", then left' in by
                    and by["Bulk one"]["tags"].split(";") == ["net", "vip"] and by["Bulk one"]["assignee"].lower() == "ada@example.org" and by["Bulk closed"]["assignee"] == "" and by["Audit me please"]["commentCount"] == "1"
                    and [r_[1] for r_ in rf[1:] if r_] == ["Bulk one", "Bulk closed"]), (ct, hdr, len(body))
        guard("CS1", "CSV export: header, one line per ticket, quoting, tags, assignee email, and filters apply", ex)
        def imp():
            body = 'title,description,priority,tags,assignee\r\nImported one,first,high,alpha;beta,BEN@example.org\r\n"Imported, two","has ""quotes""\nand a second line",,,\r\n   ,blank title,low,,\r\nBad priority,x,mega,,\r\nBad assignee,x,low,,nobody@example.org\r\n'
            req = urllib.request.Request(E.base + "/api/tickets/import", data=body.encode(), method="POST", headers={"Authorization": "Bearer " + A, "Content-Type": "text/csv"})
            j_ = json.loads(urllib.request.urlopen(req, timeout=15).read().decode()); its = (c("GET", "/api/tickets?q=imported&sort=createdAt&order=asc", token=A)[1] or {}).get("items") or []
            a_ = its[0] if its else {}; b_ = its[1] if len(its) > 1 else {}
            return (j_.get("created") == 2 and sorted(e.get("line") for e in j_.get("errors") or []) == [5, 6, 7] and len(its) == 2 and a_.get("priority") == "high" and a_.get("tags") == ["alpha", "beta"] and str(a_.get("assigneeId")) == str(ub.get("id"))
                    and b_.get("title") == "Imported, two" and b_.get("priority") == "normal" and 'has "quotes"' in b_.get("description", "") and str(b_.get("createdBy")) == str(ua.get("id"))), (j_, [x.get("title") for x in its])
        guard("CS2", "CSV import: valid records are created, invalid ones are reported with the line they start on", imp)
        def imp2():
            req = urllib.request.Request(E.base + "/api/tickets/import", data=b"priority,title\nurgent,Reordered columns\n,Only a title\n", method="POST", headers={"Authorization": "Bearer " + B, "Content-Type": "text/csv"})
            j_ = json.loads(urllib.request.urlopen(req, timeout=15).read().decode()); t_ = ((c("GET", "/api/tickets?q=reordered", token=A)[1] or {}).get("items") or [{}])[0]
            return j_.get("created") == 2 and j_.get("errors") == [] and t_.get("priority") == "urgent" and str(t_.get("createdBy")) == str(ub.get("id")), j_
        guard("CS3", "CSV import accepts the columns in any order and without the optional ones", imp2)
        st, j = c("POST", "/api/macros", {"title": "Reset steps", "body": "Please reset your password."}, token=A); m1 = (j or {}).get("macro") or {}
        st2, j2 = c("POST", "/api/macros", {"title": "apology", "body": "Sorry for the trouble."}, token=B); m2 = (j2 or {}).get("macro") or {}
        r = [c("POST", "/api/macros", {"title": "RESET STEPS", "body": "x"}, token=B), c("POST", "/api/macros", {"title": " ", "body": "x"}, token=B), c("POST", "/api/macros", {"title": "t" * 61, "body": "x"}, token=B), c("POST", "/api/macros", {"title": "No body", "body": ""}, token=B)]
        ls = [x.get("title") for x in (c("GET", "/api/macros", token=B)[1] or {}).get("items") or []]
        add("MC1", "macros: create, list sorted by title, duplicate title is 409, bad input is 400", st == 201 and st2 == 201 and str(m1.get("createdBy")) == str(ua.get("id")) and [x[0] for x in r] == [409, 400, 400, 400] and sorted(x.lower() for x in ls) == ["apology", "reset steps"] and (ls == sorted(ls) or ls == sorted(ls, key=str.lower)), (st, st2, [x[0] for x in r], ls))
        r = [c("PATCH", f"/api/macros/{m1.get('id')}", {"body": "hacked"}, token=B), c("DELETE", f"/api/macros/{m1.get('id')}", token=B), c("PATCH", f"/api/macros/{m2.get('id')}", {"body": "Sorry about that."}, token=B), c("DELETE", f"/api/macros/{m2.get('id')}", token=A), c("DELETE", "/api/macros/987654321", token=A)]
        add("MC2", "macros: only the creator or an admin may edit or delete; unknown id is 404", [x[0] for x in r] == [403, 403, 200, 204, 404] and ((r[2][1] or {}).get("macro") or {}).get("body") == "Sorry about that.", [x[0] for x in r])
        def rep():
            j_ = c("GET", "/api/reports/summary", token=B)[1] or {}; tot = (c("GET", "/api/stats", token=A)[1] or {}).get("total")
            days = [x.get("date") for x in j_.get("createdPerDay") or []]; today = _dt.datetime.now(_dt.timezone.utc).date()
            okd = days == [(today - _dt.timedelta(days=13 - i)).isoformat() for i in range(14)]
            ba = {str(x.get("userId")): x for x in j_.get("byAssignee") or []}; sm = sum(x.get(k, 0) for x in ba.values() for k in ("open", "pending", "solved", "closed"))
            return (okd and j_["createdPerDay"][-1].get("count") == tot == 9 and (j_.get("solvedPerDay") or [{}])[-1].get("count") == 2 and j_.get("topTags")[:3] == [{"tag": "net", "count": 3}, {"tag": "vip", "count": 2}, {"tag": "alpha", "count": 1}]
                    and isinstance(j_.get("avgHoursToSolve"), (int, float)) and 0 <= j_["avgHoursToSolve"] < 0.1 and sm == tot and "None" in ba and str(ua.get("id")) in ba and ba[str(ua.get("id"))].get("pending") == 2), (str(j_.get("topTags"))[:150], j_.get("avgHoursToSolve"), sm, tot)
        guard("RP2", "report summary: per-day counts, top tags with ties in alphabetical order, average hours to solve, tickets by assignee", rep)
        E.call("DELETE", f"/api/tickets/{tid}", token=A); st, _ = E.call("GET", f"/api/tickets/{tid}/events", token=A); add("EV3", "a deleted ticket's events are gone (404)", st == 404, st)
    else:
        add("EV1", "extended API reachable", False, "server did not start")
finally:
    E.stop()
# ---- seed
def seed():
    X = Srv("seed"); r = node_container([f"{W}:/w", f"{X.dd}:/dd"], ["seed.js"], network="host", env={"DATA_DIR": "/dd"}, timeout=120)
    if r.returncode != 0: return False, "seed exit " + str(r.returncode) + r.stderr[-150:]
    try:
        X.start(); st, j = X.call("POST", "/api/login", {"email": "admin@deskhand.test", "password": "deskhand-demo"}); tok = (j or {}).get("token")
        st2, j2 = X.call("POST", "/api/login", {"email": "agent@deskhand.test", "password": "deskhand-demo"}); s_ = X.call("GET", "/api/stats", token=tok)[1] or {}
        its = (X.call("GET", "/api/tickets?pageSize=100", token=tok)[1] or {}).get("items") or []
        ok = st == 200 and ((j or {}).get("user") or {}).get("role") == "admin" and st2 == 200 and ((j2 or {}).get("user") or {}).get("role") == "agent" and s_.get("total", 0) >= 25 and all(v > 0 for v in (s_.get("byStatus") or {"x": 0}).values()) and all(v > 0 for v in (s_.get("byPriority") or {"x": 0}).values()) and 0 < s_.get("unassigned", 0) < s_.get("total", 0) and any(x.get("commentCount", 0) > 0 for x in its) and len((X.call("GET", "/api/macros", token=tok)[1] or {}).get("items") or []) >= 3
        X.stop(); r2 = node_container([f"{W}:/w", f"{X.dd}:/dd"], ["seed.js"], network="host", env={"DATA_DIR": "/dd"}, timeout=120)
        X.start(); tok = (X.call("POST", "/api/login", {"email": "admin@deskhand.test", "password": "deskhand-demo"})[1] or {}).get("token"); n2 = (X.call("GET", "/api/stats", token=tok)[1] or {}).get("total")
        return ok and r2.returncode == 0 and n2 == s_.get("total"), (st, st2, s_, n2)
    finally: X.stop()
guard("SD1", "seed.js creates the demo admin, agent, 25+ varied tickets and three macros; a second run changes nothing", seed)
def tests():
    before = sorted(os.listdir(W + "/data")) if os.path.isdir(W + "/data") else []
    r = node_container([f"{W}:/w"], ["--test"], network="host", timeout=420)
    m = re.search(r"^(?:#|ℹ) tests (\d+)", r.stdout, re.M); f = re.search(r"^(?:#|ℹ) fail (\d+)", r.stdout, re.M)
    after = sorted(os.listdir(W + "/data")) if os.path.isdir(W + "/data") else []
    add("TS2", "the test suite leaves nothing behind in ./data", before == after, (before[:3], after[:3]))
    add("TS3", "the test suite has at least 15 tests", bool(m) and int(m.group(1)) >= 15, m.group(1) if m else "?", core=False)
    return r.returncode == 0 and bool(m) and int(m.group(1)) > 0, f"exit={r.returncode} tests={m.group(1) if m else '?'} fail={f.group(1) if f else '?'}"
guard("TS1", "`node --test` passes", tests)
def readme():
    t = open(build + "/README.md").read(); miss = [x for x in ("/api/register", "/api/tickets", "/api/stats", "/api/macros", "/api/reports/summary", "import", "seed", "node --test", "DATA_DIR") if x not in t]; return not miss, miss
guard("DOC1", "README covers running, testing, seeding and the API", readme)
def nodeps():
    if not os.path.isfile(build + "/package.json"): return True, "no package.json"
    p = json.load(open(build + "/package.json")); return not p.get("dependencies") and not p.get("devDependencies"), list((p.get("dependencies") or {}).keys())[:3]
guard("DOC2", "no npm dependencies", nodeps)
# ---- UI
U = Srv("ui"); errs = []
tid_ = lambda n: f"[data-testid={n}]"
try:
    if U.start():
        with sync_playwright() as pw:
            b = pw.chromium.launch(); ctx = b.new_context(viewport={"width": 1280, "height": 800}); pg = ctx.new_page(); pg.set_default_timeout(6000)
            pg.on("pageerror", lambda e: errs.append(str(e)[:120])); pg.on("dialog", lambda d: d.accept())
            vis = lambda n: pg.locator(tid_(n)).count() > 0 and pg.locator(tid_(n)).first.is_visible()
            txt = lambda n: pg.locator(tid_(n)).first.inner_text().strip()
            def sel(name, value, loc=None):
                # choose an option the way a person would: focus the select first, let the page settle, then pick
                l = loc if loc is not None else pg.locator(tid_(name)).first
                l.focus(); pg.wait_for_timeout(400); (loc if loc is not None else pg.locator(tid_(name)).first).select_option(value)
            shot = lambda n: pg.screenshot(path=os.path.join(out, "shots", n + ".png"), full_page=True)
            def u1():
                pg.goto(U.base + "/"); pg.wait_for_selector(tid_("auth-form")); shot("1-sign-in"); return vis("auth-email") and vis("auth-password") and vis("auth-submit") and not vis("auth-name")
            guard("U1", "signed out: the sign-in form shows, without the name field", u1)
            def u2():
                pg.fill(tid_("auth-email"), "nobody@example.org"); pg.fill(tid_("auth-password"), "wrong-password"); pg.click(tid_("auth-submit")); pg.wait_for_timeout(700)
                return vis("auth-error") and len(txt("auth-error")) > 2 and vis("auth-form"), txt("auth-error")[:60] if vis("auth-error") else "no error shown"
            guard("U2", "a failed sign-in shows a reason in auth-error", u2)
            def u3():
                pg.click(tid_("auth-toggle")); pg.wait_for_timeout(300); pg.fill(tid_("auth-name"), "Una Tester"); pg.fill(tid_("auth-email"), "una@example.org"); pg.fill(tid_("auth-password"), PW); pg.click(tid_("auth-submit"))
                pg.wait_for_selector(tid_("ticket-list")); return "Una Tester" in txt("current-user") and "#/tickets" in pg.url and vis("logout-button"), pg.url[-20:]
            guard("U3", "register through the form lands on the ticket list as that user", u3)
            def u4():
                pg.reload(); pg.wait_for_selector(tid_("ticket-list")); return "Una Tester" in txt("current-user")
            guard("U4", "a reload keeps the user signed in", u4)
            def u5():
                pg.click(tid_("new-ticket-button")); pg.wait_for_selector(tid_("ticket-form")); pg.click(tid_("ticket-submit")); pg.wait_for_timeout(600)
                e = vis("ticket-error") and vis("ticket-form"); shot("3-new-ticket")
                pg.fill(tid_("ticket-title"), "Login page loops forever"); pg.fill(tid_("ticket-description"), "After the password reset the login page reloads in a loop."); sel("ticket-priority", "high"); pg.fill(tid_("ticket-tags"), "vip, Billing"); pg.click(tid_("ticket-submit"))
                pg.wait_for_selector(tid_("ticket-detail")); pg.wait_for_timeout(300)
                ok = "Login page loops forever" in txt("detail-title") and "open" in txt("detail-status").lower() and "high" in txt("detail-priority").lower() and all(x in txt("detail-tags").lower() for x in ("vip", "billing")) and re.search(r"#/tickets/.+", pg.url)
                return bool(e and ok), (e, pg.url[-24:])
            guard("U5", "new ticket: an empty title shows ticket-error; a valid one opens the new ticket's detail", u5)
            def u6():
                a = [pg.locator(tid_("transition-" + s)).count() for s in ("pending", "solved", "open", "closed")]; pg.click(tid_("transition-solved")); pg.wait_for_timeout(700)
                b_ = [pg.locator(tid_("transition-" + s)).count() for s in ("pending", "solved", "open", "closed")]
                return a == [1, 1, 0, 0] and b_ == [0, 0, 1, 1] and "solved" in txt("detail-status").lower(), (a, b_)
            guard("U6", "only the allowed status buttons are present, and a click changes the status", u6)
            def u7():
                pg.fill(tid_("comment-input"), "Cleared the session cookie, works now."); pg.click(tid_("comment-submit")); pg.wait_for_timeout(700)
                return pg.locator(tid_("comment-item")).count() == 1 and "Cleared the session cookie" in pg.locator(tid_("comment-item")).first.inner_text()
            guard("U7", "adding a comment shows it in the list", u7)
            tok = (U.call("POST", "/api/login", {"email": "una@example.org", "password": PW})[1] or {}).get("token")
            def u8():
                opts = pg.evaluate("() => [...document.querySelector('[data-testid=assignee-select]').options].map(o => [o.value, o.textContent.trim()])")
                me = [v for v, t in opts if "Una Tester" in t]; tk = pg.url.split("#/tickets/")[-1]
                saved = lambda: str(((U.call("GET", f"/api/tickets/{tk}", token=tok)[1] or {}).get("ticket") or {}).get("assigneeId")) == me[0]
                idx = [v for v, t in opts].index(me[0]); how = []
                def by_tool(): sel("assignee-select", me[0])
                def by_keyboard():
                    pg.locator(tid_("assignee-select")).first.focus(); pg.wait_for_timeout(300); pg.keyboard.press("Home"); pg.wait_for_timeout(500)
                    for _ in range(idx): pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(200)
                def by_event(): pg.evaluate("v => { const s = document.querySelector('[data-testid=assignee-select]'); s.value = v; s.dispatchEvent(new Event('input', {bubbles: true})); s.dispatchEvent(new Event('change', {bubbles: true})); }", me[0])
                pg.wait_for_timeout(1000)
                for name, fn in (("select_option", by_tool), ("keyboard", by_keyboard), ("change event", by_event)):   # three ways to pick the option; any one that saves counts
                    fn(); pg.wait_for_timeout(1200); how.append(name)
                    if saved(): break
                ok = saved(); shot("4-ticket-detail"); pg.reload(); pg.wait_for_selector(tid_("ticket-detail")); pg.wait_for_timeout(600)
                return ok and pg.input_value(tid_("assignee-select")) == me[0] and any(v == "" for v, t in opts), (how, ok, opts)
            guard("U8", "assignee select lists Unassigned and the users, and saves on change", u8)
            def u9():
                pg.click(tid_("back-to-list")); pg.wait_for_selector(tid_("ticket-list")); pg.wait_for_timeout(500); rows = pg.locator(tid_("ticket-row"))
                num = lambda n: int(re.search(r"\d+", txt(n)).group())
                st_ = [num("stat-open"), num("stat-solved"), num("stat-pending"), num("stat-closed"), num("stat-unassigned")]; sv = U.call("GET", "/api/stats", token=tok)[1] or {}; bs = sv.get("byStatus") or {}
                return rows.count() == 1 and bool(rows.first.get_attribute("data-ticket-id")) and st_ == [bs.get("open"), bs.get("solved"), bs.get("pending"), bs.get("closed"), sv.get("unassigned")] and st_[:4] == [0, 1, 0, 0], (rows.count(), rows.first.get_attribute("data-ticket-id"), st_)
            guard("U9", "back to the list: one row with data-ticket-id, and the stats bar is right", u9)
            PR = ["low", "normal", "high", "urgent"]
            for i in range(24): U.call("POST", "/api/tickets", {"title": f"Seeded {i:02d}" + (" walrus" if i % 8 == 0 else ""), "description": "d", "priority": PR[i % 4]}, token=tok)
            rows = lambda: pg.locator(tid_("ticket-row")).count()
            def u10():
                pg.reload(); pg.wait_for_selector(tid_("ticket-row")); pg.wait_for_timeout(500); a = rows(); shot("2-ticket-list"); pg.click(tid_("page-next")); pg.wait_for_timeout(700); b_ = rows(); pg.click(tid_("page-prev")); pg.wait_for_timeout(700); c_ = rows()
                return (a, b_, c_) == (20, 5, 20), (a, b_, c_)
            guard("U10", "the list shows 20 per page; next and previous page work", u10)
            def u11():
                sel("filter-priority", "urgent"); pg.wait_for_timeout(800); a = rows(); sel("filter-priority", ""); sel("filter-status", "solved"); pg.wait_for_timeout(800); b_ = rows()
                sel("filter-status", ""); pg.fill(tid_("search-input"), "walrus"); pg.wait_for_timeout(1200); c_ = rows(); pg.fill(tid_("search-input"), ""); pg.wait_for_timeout(900)
                return (a, b_, c_) == (6, 1, 3), (a, b_, c_)
            guard("U11", "priority filter, status filter and search narrow the list", u11)
            def u12():
                r = pg.locator(tid_("ticket-row")).nth(2); i = r.get_attribute("data-ticket-id"); r.click(); pg.wait_for_selector(tid_("ticket-detail")); pg.wait_for_timeout(400)
                ok = pg.url.endswith("#/tickets/" + i); pg.click(tid_("transition-solved")); pg.wait_for_timeout(600); pg.click(tid_("transition-closed")); pg.wait_for_timeout(700)
                tr = sum(pg.locator(tid_("transition-" + s)).count() for s in ("pending", "solved", "open", "closed")); ci = pg.locator(tid_("comment-input"))
                return ok and tr == 0 and (ci.count() == 0 or ci.first.is_disabled()) and "closed" in txt("detail-status").lower(), (ok, tr)
            guard("U12", "clicking a row opens that ticket; a closed ticket has no status buttons and no comment box", u12)
            def u13():
                a = vis("delete-ticket"); pg.click(tid_("delete-ticket")); pg.wait_for_timeout(600)
                c2 = pg.locator("[data-testid=confirm-delete], dialog button, [role=dialog] button")
                if pg.locator(tid_("ticket-list")).count() == 0 and c2.count(): c2.last.click()
                pg.wait_for_selector(tid_("ticket-list")); pg.wait_for_timeout(500); n = (U.call("GET", "/api/stats", token=tok)[1] or {}).get("total")
                return a and n == 24, (a, n)
            guard("U13", "an admin sees delete-ticket, and deleting returns to the list with the ticket gone", u13)
            def u14():
                U.call("POST", "/api/register", {"email": "gus@example.org", "password": PW, "name": "Gus Agent"}); pg.click(tid_("logout-button")); pg.wait_for_selector(tid_("auth-form")); pg.wait_for_timeout(300)
                if vis("auth-name"): pg.click(tid_("auth-toggle")); pg.wait_for_timeout(300)
                pg.fill(tid_("auth-email"), "gus@example.org"); pg.fill(tid_("auth-password"), PW); pg.click(tid_("auth-submit")); pg.wait_for_selector(tid_("ticket-row")); pg.wait_for_timeout(300)
                pg.locator(tid_("ticket-row")).first.click(); pg.wait_for_selector(tid_("ticket-detail")); pg.wait_for_timeout(400)
                return "Gus Agent" in txt("current-user") and not vis("delete-ticket")
            guard("U14", "log out, sign in as an agent: no delete button", u14)
            def x1():
                a = pg.locator(tid_("nav-users")).count(); n = all(pg.locator(tid_(k)).count() >= 1 for k in ("nav-tickets", "nav-reports", "nav-macros", "nav-import"))
                pg.goto(U.base + "/#/users"); pg.wait_for_timeout(900); f = vis("forbidden-message"); return a == 0 and n and f and pg.locator(tid_("user-row")).count() == 0, (a, n, f)
            guard("X1", "an agent has the four nav links but no nav-users, and sees forbidden-message at #/users", x1)
            ctx2 = b.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True); pg = ctx2.new_page(); pg.set_default_timeout(6000); pg.on("pageerror", lambda e: errs.append(str(e)[:120])); pg.on("dialog", lambda d: d.accept())
            def signin():
                pg.goto(U.base + "/"); pg.wait_for_selector(tid_("auth-form")); pg.fill(tid_("auth-email"), "una@example.org"); pg.fill(tid_("auth-password"), PW); pg.click(tid_("auth-submit")); pg.wait_for_selector(tid_("ticket-row")); pg.wait_for_timeout(300)
            def x2():
                signin(); pg.click(tid_("nav-macros")); pg.wait_for_selector(tid_("macro-form")); pg.fill(tid_("macro-title"), "Reset steps"); pg.fill(tid_("macro-body"), "Please try resetting your password first."); pg.click(tid_("macro-submit")); pg.wait_for_timeout(800)
                a = pg.locator(tid_("macro-row")).count(); t_ = pg.locator(tid_("macro-row")).first.inner_text() if a else ""; d_ = pg.locator(tid_("macro-delete")).count()
                pg.fill(tid_("macro-title"), "reset steps"); pg.fill(tid_("macro-body"), "dup"); pg.click(tid_("macro-submit")); pg.wait_for_timeout(800)
                return a == 1 and "Reset steps" in t_ and d_ == 1 and vis("macro-error") and pg.locator(tid_("macro-row")).count() == 1, (a, d_)
            guard("X2", "macros page: create one, see it listed with a delete button; a duplicate title shows macro-error", x2)
            def x3():
                pg.click(tid_("nav-tickets")); pg.wait_for_selector(tid_("ticket-row")); pg.locator(tid_("ticket-row")).nth(1).click(); pg.wait_for_selector(tid_("ticket-detail")); pg.wait_for_timeout(500)
                e0 = pg.locator(tid_("event-item")).count(); mid = pg.evaluate("() => [...document.querySelector('[data-testid=macro-select]').options].map(o => o.value).filter(Boolean)")
                pg.fill(tid_("comment-input"), "Hello. "); sel("macro-select", mid[0]); pg.wait_for_timeout(400); v = pg.input_value(tid_("comment-input"))
                pg.click(tid_("comment-submit")); pg.wait_for_timeout(800); pg.click(tid_("transition-pending")); pg.wait_for_timeout(800); e1 = pg.locator(tid_("event-item")).count()
                tx = pg.locator(tid_("event-item")).all_inner_texts(); pg.screenshot(path=os.path.join(out, "shots", "4b-detail-events.png"), full_page=True)
                return e0 == 1 and e1 == 3 and v.startswith("Hello.") and "Please try resetting your password first." in v and "Una" in tx[0], (e0, e1, v[:60], tx[:1])
            guard("X3", "ticket detail: events are listed and grow with each action; choosing a macro appends its body to the comment box", x3)
            num = lambda n: int(re.search(r"\d+", pg.locator(tid_(n)).first.inner_text()).group())
            def x4():
                pg.click(tid_("back-to-list")); pg.wait_for_selector(tid_("ticket-row")); pg.wait_for_timeout(500); p0 = num("stat-pending")
                for i in (3, 4): pg.locator(tid_("ticket-row")).nth(i).locator(tid_("row-check")).check()
                sel("bulk-status", "solved"); pg.click(tid_("bulk-apply")); pg.wait_for_timeout(1200); r_ = pg.locator(tid_("bulk-result")).first.inner_text(); s1 = num("stat-solved")
                return "2" in r_ and s1 == 3 and p0 == 1, (r_[:60], s1, p0)
            guard("X4", "bulk: tick two rows, set them solved, see the outcome and refreshed stats", x4)
            def x5():
                sel("filter-priority", "urgent"); pg.wait_for_timeout(800)
                with pg.expect_download(timeout=8000) as dl: pg.click(tid_("export-button"))
                d_ = dl.value; pth = d_.path(); rows_ = list(_csv.reader(open(pth, newline="", encoding="utf-8-sig"))); sel("filter-priority", ""); pg.wait_for_timeout(600)
                return d_.suggested_filename == "tickets.csv" and rows_[0][:4] == ["id", "title", "status", "priority"] and len([r_ for r_ in rows_[1:] if r_]) == (U.call("GET", "/api/tickets?priority=urgent", token=tok)[1] or {}).get("total") > 0 and all(r_[3] == "urgent" for r_ in rows_[1:] if r_), (d_.suggested_filename, len(rows_))
            guard("X5", "export-button downloads tickets.csv with the current filter applied", x5)
            def x6():
                pg.click(tid_("nav-import")); pg.wait_for_selector(tid_("import-text")); pg.fill(tid_("import-text"), "title,priority,tags\nFrom the import page,high,imported;ui\n,low,\nSecond import,,imported\n"); pg.click(tid_("import-submit")); pg.wait_for_timeout(1200)
                r_ = pg.locator(tid_("import-result")).first.inner_text(); n = (U.call("GET", "/api/tickets?tag=imported", token=tok)[1] or {}).get("total")
                return n == 2 and "2" in r_ and "3" in r_, (r_[:100], n)
            guard("X6", "import page: two tickets created, the bad line reported with its line number", x6)
            def x7():
                pg.click(tid_("nav-reports")); pg.wait_for_selector(tid_("chart-created")); pg.wait_for_timeout(900)
                hs = pg.evaluate("() => { let b = [...document.querySelectorAll('[data-testid=chart-created] [data-testid=chart-bar]')]; if (!b.length) b = [...document.querySelectorAll('[data-testid=chart-bar]')]; return b.map(e => e.getBoundingClientRect().height); }"); n = len(hs); avg = pg.locator(tid_("report-avg-solve")).first.inner_text()
                tags = pg.locator(tid_("top-tag")).all_inner_texts(); pg.screenshot(path=os.path.join(out, "shots", "7-reports.png"), full_page=True)
                return n == 14 and hs[-1] > max(hs[:-1] + [0]) and re.search(r"\d", avg) and any("imported" in t_ and "2" in t_ for t_ in tags), (n, [round(h) for h in hs[-3:]], avg[:20], tags[:3])
            guard("X7", "reports page: 14 bars with today's the tallest, an average time to solve, and the top tags", x7)
            def x8():
                pg.click(tid_("nav-users")); pg.wait_for_selector(tid_("user-row")); pg.wait_for_timeout(500); us = (U.call("GET", "/api/users", token=tok)[1] or {}).get("items") or []
                gus = [u for u in us if u.get("email") == "gus@example.org"][0]; una = [u for u in us if u.get("email") == "una@example.org"][0]
                row = lambda u: pg.locator(f"[data-testid=user-row][data-user-id='{u.get('id')}']"); n = pg.locator(tid_("user-row")).count(); pg.screenshot(path=os.path.join(out, "shots", "8-users.png"), full_page=True)
                sel("role-select", "admin", row(gus).locator(tid_("role-select"))); pg.wait_for_timeout(700); g1 = [u for u in (U.call("GET", "/api/users", token=tok)[1] or {}).get("items") if u.get("id") == gus.get("id")][0].get("role")
                sel("role-select", "agent", row(gus).locator(tid_("role-select"))); pg.wait_for_timeout(700); row(gus).locator(tid_("active-toggle")).uncheck(); pg.wait_for_timeout(700)
                g2 = [u for u in (U.call("GET", "/api/users", token=tok)[1] or {}).get("items") if u.get("id") == gus.get("id")][0]
                sel("role-select", "agent", row(una).locator(tid_("role-select"))); pg.wait_for_timeout(800); e = vis("users-error"); u2 = [u for u in (U.call("GET", "/api/users", token=tok)[1] or {}).get("items") if u.get("id") == una.get("id")][0].get("role")
                return n == len(us) == 2 and g1 == "admin" and g2.get("role") == "agent" and g2.get("active") is False and e and u2 == "admin", (n, g1, g2.get("active"), e, u2)
            guard("X8", "users page: change a role, deactivate a user, and demoting the last admin shows users-error", x8)
            ctx2.close()
            def u15():
                c2 = b.new_context(viewport={"width": 390, "height": 800}); p2 = c2.new_page(); p2.goto(U.base + "/"); p2.wait_for_selector(tid_("auth-form")); p2.fill(tid_("auth-email"), "una@example.org"); p2.fill(tid_("auth-password"), PW); p2.click(tid_("auth-submit"))
                p2.wait_for_selector(tid_("ticket-row")); p2.wait_for_timeout(400); a = p2.evaluate("() => document.documentElement.scrollWidth"); p2.screenshot(path=os.path.join(out, "shots", "5-phone-list.png"), full_page=True)
                p2.locator(tid_("ticket-row")).first.click(); p2.wait_for_selector(tid_("ticket-detail")); p2.wait_for_timeout(400); b_ = p2.evaluate("() => document.documentElement.scrollWidth"); p2.screenshot(path=os.path.join(out, "shots", "6-phone-detail.png"), full_page=True); c2.close()
                return a <= 391 and b_ <= 391, (a, b_)
            guard("U15", "on a 390 px phone the list and the detail have no horizontal scrolling", u15)
            add("U16", "no uncaught JavaScript errors in the front end", not errs, errs[:3])
            b.close()
    else:
        add("U1", "front end reachable", False, "server did not start")
finally:
    U.stop(); shutil.rmtree(tmp, ignore_errors=True)
finish(out)
