#!/usr/bin/env python3
"""HTTP side of resilience.sh: signs in to Superset like a browser and talks to Lenspack through Superset's
/lenspack route, the way the overlay does. Passwords come from the environment (SS_ADMIN_PW, SS_USER_PW) and
are never printed.

  resilience_http.py health                 -> one JSON line: lenspack healthz, pack entities/measures, superset health
  resilience_http.py ask <dashboard> <q>    -> one JSON line: ok, ms, reply (first 160 chars), usd
  resilience_http.py setting get|put <json> -> the speech settings section (admin), to prove settings persist
"""
import http.cookiejar, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

# The chat tools that only read (lenspack mcp tools.ts); anything else counts as an edit, which a question must not make.
READ_TOOLS = {"list_metrics", "query", "explain", "list_values", "get_board", "list_versions", "run_sql"}
BASE = os.environ.get("SUPERSET", "http://100.72.3.113:8088").rstrip("/")


def session(user, pw):
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    html = op.open(BASE + "/login/", timeout=20).read().decode()
    csrf = re.search(r'name="csrf_token"[^>]*value="([^"]+)"', html) or re.search(r'id="csrf_token"[^>]*value="([^"]+)"', html)
    data = urllib.parse.urlencode({"username": user, "password": pw, "csrf_token": csrf.group(1) if csrf else ""}).encode()
    op.open(urllib.request.Request(BASE + "/login/", data=data), timeout=20).read()
    # Superset's CSRF token for later POST/PUT through the proxy (the /lenspack route takes the session).
    return op


def call(op, method, path, body=None, timeout=30):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(), headers={"content-type": "application/json"})
    t = time.time()
    try:
        with op.open(req, timeout=timeout) as r:
            raw = r.read().decode()
            return r.status, raw, int((time.time() - t) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")[:300], int((time.time() - t) * 1000)
    except Exception as e:
        return 0, f"{type(e).__name__}: {str(e)[:160]}", int((time.time() - t) * 1000)


def health():
    out = {}
    plain = urllib.request.build_opener()
    s, raw, _ = call(plain, "GET", "/health", timeout=10)
    out["superset"] = s
    out["lenspack"] = 0
    if out["superset"] == 200:
        try:
            op = session("admin", os.environ["SS_ADMIN_PW"])
            # Superset's /lenspack route needs a signed-in session, even for Lenspack's public /healthz.
            out["lenspack"], _, _ = call(op, "GET", "/lenspack/healthz", timeout=10)
            s, raw, _ = call(op, "GET", "/lenspack/_superset/settings", timeout=20)
            if s == 200:
                j = json.loads(raw)
                out["entities"] = sum(1 for d in j["datasets"] if d.get("entity"))
                out["datasets"] = len(j["datasets"])
                out["measures"] = len(j["measures"])
            else:
                out["settings"] = s
        except Exception as e:
            out["error"] = f"{type(e).__name__}: {str(e)[:120]}"
    print(json.dumps(out))


def ask(dashboard, q):
    op = session("lenspack", os.environ["SS_USER_PW"])
    s, raw, _ = call(op, "GET", f"/lenspack/_superset/bind?dashboard={dashboard}")
    if s != 200:
        print(json.dumps({"ok": False, "step": "bind", "status": s, "body": raw[:160]}))
        return
    b = json.loads(raw)
    s, raw, _ = call(op, "GET", "/lenspack/_superset/info")
    pack = json.loads(raw)["pack"] if s == 200 else None
    body = {"messages": [{"id": "u1", "role": "user", "parts": [{"type": "text", "text": q}]}]}
    s, raw, ms = call(op, "POST", f"/lenspack/api/{pack}/{b['board']}/chat?review=off&model=claude-haiku-5-5", body, timeout=180)
    text, usd, edits, err = [], None, 0, None
    for line in raw.splitlines():
        if not line.startswith("data:"):
            continue
        p = line[5:].strip()
        if p == "[DONE]":
            break
        try:
            e = json.loads(p)
        except ValueError:
            continue
        t = e.get("type")
        if t == "text-delta":
            text.append(e.get("delta", ""))
        elif t == "data-usage":
            usd = e.get("data", {}).get("total", {}).get("usd")
        elif t == "tool-input-available" and e.get("toolName") not in READ_TOOLS:
            edits += 1
        elif t == "error":
            err = str(e.get("errorText") or e)[:160]
    reply = "".join(text).strip()
    print(json.dumps({"ok": s == 200 and bool(reply) and not err, "status": s, "ms": ms, "usd": usd, "edit_calls": edits, "error": err, "reply": reply[:160]}))


def setting(action, value=None):
    op = session("admin", os.environ["SS_ADMIN_PW"])
    if action == "put":
        s, raw, _ = call(op, "PUT", "/lenspack/_superset/settings/speech", json.loads(value))
    else:
        s, raw, _ = call(op, "GET", "/lenspack/_superset/settings")
    try:
        sp = json.loads(raw).get("speech") if action == "get" else json.loads(raw)
        print(json.dumps({"status": s, "holdMs": sp.get("holdMs"), "defaultHoldMs": sp.get("defaultHoldMs")}))
    except Exception:
        print(json.dumps({"status": s, "body": raw[:160]}))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "health":
        health()
    elif cmd == "ask":
        ask(sys.argv[2], sys.argv[3])
    elif cmd == "setting":
        setting(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
