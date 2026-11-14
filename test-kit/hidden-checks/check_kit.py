#!/usr/bin/env python3
"""Hidden checks for the toolkit job. Usage: check_kit.py <build_dir> <out_dir>"""
import sys, os, re, json, shutil, tempfile
from common import add, guard, finish, node_container
build, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
H = os.path.dirname(os.path.abspath(__file__)); os.makedirs(os.path.join(out, "shots"), exist_ok=True)
MODS = ["csv", "semver", "cron", "lru", "diff", "template", "expr", "glob"]
try:
    r = node_container([f"{build}:/w:ro", f"{H}/rig_kit.mjs:/rig/rig_kit.mjs:ro"], ["/rig/rig_kit.mjs", "/w"], timeout=300, workdir="/tmp")
    for t in json.loads(r.stdout.strip().splitlines()[-1]): add(t["id"], t["id"], t["ok"], t.get("detail", ""))
except Exception as e:
    add("RIG", "hidden test rig ran", False, repr(e)[:200])
def own_tests():
    tmp = tempfile.mkdtemp(prefix="kit-"); shutil.copytree(build, tmp + "/w", ignore=shutil.ignore_patterns("node_modules", ".claude")); os.chmod(tmp, 0o777)
    os.system(f"chmod -R a+rwX {tmp}")
    r = node_container([f"{tmp}/w:/w"], ["--test"], timeout=300)
    m = re.search(r"^(?:#|ℹ) tests (\d+)", r.stdout, re.M); f = re.search(r"^(?:#|ℹ) fail (\d+)", r.stdout, re.M); shutil.rmtree(tmp, ignore_errors=True)
    return r.returncode == 0 and m and int(m.group(1)) >= 16, f"exit={r.returncode} tests={m.group(1) if m else '?'} fail={f.group(1) if f else '?'}"
guard("OWN1", "the project's own `node --test` passes (at least 16 tests)", own_tests)
add("OWN2", "every module has its own test file", all(os.path.isfile(f"{build}/test/{m}.test.js") for m in MODS), [m for m in MODS if not os.path.isfile(f"{build}/test/{m}.test.js")])
def indep():
    bad = []
    for m in MODS:
        p = f"{build}/src/{m}.js"
        if not os.path.isfile(p): bad.append(m + " missing"); continue
        for imp in re.findall(r"""(?:from|import)\s*\(?\s*['"]([^'"]+)['"]""", open(p).read()):
            if not imp.startswith("node:"): bad.append(f"{m} imports {imp}")
    return not bad, bad[:4]
guard("OWN3", "modules import nothing but node: built-ins", indep)
def readme():
    t = open(f"{build}/README.md").read(); miss = [x for x in ("parseCsv", "toCsv", "satisfies", "nextRun", "LruCache", "diffLines", "render", "evaluate", "match") if x not in t]
    return not miss, miss
guard("OWN4", "README documents every module's exports", readme)
def pkg():
    p = json.load(open(f"{build}/package.json")); return p.get("type") == "module" and not p.get("dependencies"), {k: p.get(k) for k in ("type", "dependencies")}
guard("OWN5", "package.json is type=module with no dependencies", pkg)
finish(out)
