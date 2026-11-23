#!/usr/bin/env python3
"""Summary of one results/<run>.json : model x tier, confidently wrong,
expected fails by reason, cost per right answer, consistency across repeats.

  python3 lenspack-superset-eval/summarize.py results/<run>.json
"""
import collections
import json
import sys

PASS = ("correct", "declined_ok")
d = json.load(open(sys.argv[1]))
rs = d["results"]
models = list(dict.fromkeys(r["model"] for r in rs))
short = {m: m.replace("claude-", "").replace("-5-5", "") for m in models}
tiers = sorted({r["tier"] for r in rs})


def frac(xs):
    return f"{sum(r['outcome'] in PASS for r in xs)}/{len(xs)}" if xs else "—"


print(f"run {sys.argv[1].rsplit('/', 1)[-1]} · spent ${d['meta']['spentUsd']:.2f} · stopped: {d['meta'].get('stopped')}\n")
print("| model | pass | right | partial (def. unsaid) | declined ok | confidently wrong | wrong | error | $ total | $/turn | $ per right | p50 s | steps |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
for m in models:
    x = [r for r in rs if r["model"] == m]
    c = collections.Counter(r["outcome"] for r in x)
    unsaid = sum(r["detail"].startswith("right number, definition not said") for r in x)
    usd = sum(r["usd"] + r["judgeUsd"] for r in x)
    right = c["correct"] + c["declined_ok"]
    lat = sorted(r["latencyMs"] for r in x)[len(x) // 2] / 1000
    print(f"| {short[m]} | {100 * right / len(x):.0f}% | {c['correct']} | {c['partial']} ({unsaid}) | {c['declined_ok']} | {c['confidently_wrong']} | {c['wrong']} | {c['error']} | {usd:.2f} | {usd / len(x):.4f} | {usd / max(1, right):.4f} | {lat:.1f} | {sum(r['steps'] for r in x) / len(x):.1f} |")

print("\n| tier | " + " | ".join(short[m] for m in models) + " |")
print("|---|" + "---|" * len(models))
for t in tiers:
    print(f"| {t} | " + " | ".join(frac([r for r in rs if r["model"] == m and r["tier"] == t]) for m in models) + " |")

print("\nExpected fails (T8) by reason:\n\n| why | " + " | ".join(short[m] for m in models) + " |")
print("|---|" + "---|" * len(models))
for why in sorted({r.get("why") for r in rs if r["expect"] == "decline" and r.get("why")}):
    print(f"| {why} | " + " | ".join(frac([r for r in rs if r["model"] == m and r["expect"] == "decline" and r.get("why") == why]) for m in models) + " |")

# Consistency: a question counts when every repeat passed (pass^k), and flaky when some did.
print("\nConsistency over repeats (questions passing every repeat / passing some repeats):\n")
for m in models:
    by = collections.defaultdict(list)
    for r in rs:
        if r["model"] == m:
            by[r["id"]].append(r["outcome"] in PASS)
    allp = sum(all(v) for v in by.values())
    some = sum(any(v) and not all(v) for v in by.values())
    print(f"- {short[m]}: {allp}/{len(by)} every repeat, {some} flaky")

print("\nConfidently wrong:\n")
cw = collections.defaultdict(list)
for r in rs:
    if r["outcome"] == "confidently_wrong":
        cw[(r["id"], r["detail"][:60])].append(f"{short[r['model']]}#{r['repeat']}")
for (qid, detail), who in sorted(cw.items()):
    reply = next(r["reply"] for r in rs if r["id"] == qid and r["outcome"] == "confidently_wrong")
    print(f"- {qid} ({', '.join(who)}): {detail} — “{reply[:160].replace(chr(10), ' ')}”")

print("\nQuestions no model passed on any repeat:\n")
for q in dict.fromkeys(r["id"] for r in rs):
    x = [r for r in rs if r["id"] == q]
    if not any(r["outcome"] in PASS for r in x):
        what = sorted({short[r["model"]] + " " + r["outcome"] + ": " + r["detail"][:70] for r in x})
        print(f"- {q}: " + "; ".join(what)[:400])
