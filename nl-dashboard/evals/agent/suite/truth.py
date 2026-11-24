#!/usr/bin/env python3
"""Compute truth.json for suite.yaml straight from ClickHouse (never through Lenspack or Superset).

CHP holds the read-only ClickHouse password (campaign_field_test_reader); the compose stack's clickhouse-tunnel
container must be up. Writes ../truth/truth[-<suffix>].json next to this folder:
  CHP=... python3 truth.py [--suite suite-post-v2.yaml] [--check]

--check   recompute only the fingerprint and compare it with truth.json (exit 1 on drift).

Every query runs read-only (readonly=1) through the nl-dashboard clickhouse-tunnel container.
"""
import hashlib, json, os, subprocess, sys, urllib.request, base64, datetime
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
# --suite suite-post.yaml writes truth-post.json; the default is suite.yaml -> truth.json.
_name = sys.argv[sys.argv.index("--suite") + 1] if "--suite" in sys.argv else "suite.yaml"
SUITE = os.path.join(HERE, _name)
OUT = os.path.join(HERE, "..", "truth", "truth.json" if _name == "suite.yaml" else "truth-" + _name.split("-", 1)[1].replace(".yaml", ".json"))
FORBIDDEN = ("kafka_", "chad_prod", "ch_smc_doses", "ch_households", "ch_referrals", "ch_stock", "ch_ng_")


def tunnel_ip():
    return subprocess.check_output(["docker", "inspect", "nl-dashboard-clickhouse-tunnel-1", "--format",
                                    "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}"], text=True).strip()


IP = tunnel_ip()
AUTH = base64.b64encode(f"campaign_field_test_reader:{os.environ['CHP']}".encode()).decode()


def ch(sql):
    low = sql.lower()
    for f in FORBIDDEN:
        if f in low:
            raise SystemExit(f"truth SQL must not read {f}: {sql[:80]}")
    req = urllib.request.Request(f"http://{IP}:8123/?database=default&readonly=1&default_format=JSONCompact",
                                 data=sql.strip().rstrip(";").encode(), headers={"Authorization": f"Basic {AUTH}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["data"]


def num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return v
    return int(f) if f.is_integer() and abs(f) < 2**53 else f


def shape(rows, kind, columns=None):
    if kind == "scalar":
        return num(rows[0][0]) if rows else None
    if kind == "set":
        return sorted(str(r[0]) for r in rows)
    if kind in ("map", "series"):
        return {str(r[0]): num(r[1]) for r in rows}
    if kind == "list":
        return [[str(r[0]), num(r[1])] for r in rows]
    if kind == "table":
        return {str(r[0]): {c: num(v) for c, v in zip(columns[1:], r[1:])} for r in rows}
    raise SystemExit(f"unknown shape {kind}")


def columns_of(sql):
    # names of the SELECT's output columns, for shape: table
    meta = ch(f"DESCRIBE ({sql.strip().rstrip(';')})")
    return [m[0] for m in meta]


FINGERPRINT = {
    "su_ni_task_rows": "SELECT count() FROM su_ni_task",
    "su_ni_cov_rows": "SELECT count() FROM su_ni_cov",
    "su_ni_cov_vaccinated": "SELECT sum(children_vaccinated) FROM su_ni_cov",
    "su_ni_zd_facility_rows": "SELECT count() FROM su_ni_zd_facility",
    "su_ni_stock_issued": "SELECT sum(vials_issued) FROM su_ni_stock",
    "task_date_max": "SELECT toString(max(task_date)) FROM su_ni_task",
    "freshness": "SELECT toString(mart_last_day) || ' stale=' || toString(is_stale) FROM su_ni_freshness",
    "smc_mart_rows": "SELECT sum(administered_count) FROM analytics.dm_smc_administered_base WHERE tenant_id = 'ng'",
    "household_mart_rows": "SELECT count() FROM analytics.dm_household_registry WHERE tenant_id = 'ng'",
    "referral_mart_children": "SELECT sum(referred_children_count) FROM analytics.dm_referral_summary WHERE tenant_id = 'ng'",
}


def fingerprint():
    return {k: num(ch(q)[0][0]) for k, q in FINGERPRINT.items()}


def main():
    if "--check" in sys.argv:
        old = json.load(open(OUT))["fingerprint"]
        new = fingerprint()
        drift = {k: (old.get(k), v) for k, v in new.items() if old.get(k) != v}
        print(json.dumps({"drift": drift}, indent=1))
        sys.exit(1 if drift else 0)
    suite = yaml.safe_load(open(SUITE))
    out = {"suite": suite["suite"], "computed": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
           "fingerprint": fingerprint(), "questions": {}}
    crosses = []
    for q in suite["questions"]:
        t = q.get("truth")
        if not t:
            continue
        kind = t["shape"]
        cols = columns_of(t["sql"]) if kind == "table" else None
        entry = {"shape": kind, "unit": t.get("unit", "count"), "value": shape(ch(t["sql"]), kind, cols),
                 "sql_sha": hashlib.sha256(t["sql"].encode()).hexdigest()[:12]}
        if "k" in t:
            entry["k"] = t["k"]
        if suite.get("day_one"):
            entry["dayOne"] = suite["day_one"]
        if t.get("universe_sql"):
            entry["universe"] = sorted(str(r[0]) for r in ch(t["universe_sql"]))
        alts = []
        for a in t.get("alternatives", []):
            alts.append({"label": a["label"], "value": shape(ch(a["sql"]), kind, cols)})
        if alts:
            entry["alternatives"] = alts
        if q.get("cross"):
            cv = shape(ch(q["cross"]), kind if kind != "table" else "scalar")
            entry["cross"] = cv
            crosses.append((q["id"], entry["value"], cv))
        out["questions"][q["id"]] = entry
    json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False)
    os.chmod(OUT, 0o600)
    print(f"{len(out['questions'])} truths → {OUT}")
    for qid, v, c in crosses:
        print(f"cross {qid}: {'agree' if v == c else 'DIFFER'}  primary={json.dumps(v)[:120]}  cross={json.dumps(c)[:120]}")


if __name__ == "__main__":
    main()
