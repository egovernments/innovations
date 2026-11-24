#!/usr/bin/env python3
"""suite.yaml -> suite-post.yaml: the same questions and truth, for the su_ni_* pack (configs/post-rebase.yaml).

- adds each old measure key's post-rebase equivalent to every accept / widget list (any-of lists, so both pass)
- seed board: dashboard 7 (ni-national), the counterpart of 5
- pack gaps the rebase closed become answer questions: E10 refusal reasons, E11 insecure settlements
Re-run after editing suite.yaml; truth.json is shared (truth.py computes every question in both files).
"""
import os
import sys
import re

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))

# Old key -> new keys (the rebase's rename list, 2026-11-22).
MEASURES = {
    "vaccinated_children": ["children_vaccinated", "visits"],
    "daily_children_vaccinated": ["children_vaccinated"],
    "daily_households_registered": ["households_registered"],
    "households": ["households_registered"],
    "doses_administered": ["children_vaccinated", "visits"],
    "doses_delivered": ["children_vaccinated", "visits"],
    "task_records": ["visits"],
    "facility_children_enumerated": ["children_enumerated"],
    "facility_zero_dose_children": ["zero_dose_children"],
    "stock_units": ["vials_issued"],
}
DIMENSIONS = {"administration_status": ["status"]}


def extend(xs, table):
    out = list(xs)
    for x in xs:
        for n in table.get(x, []):
            if n not in out:
                out.append(n)
    return out


def walk(node, key=None):
    if isinstance(node, dict):
        return {k: walk(v, k) for k, v in node.items()}
    if isinstance(node, list) and all(isinstance(x, str) for x in node):
        if key in ("measures", "measure"):  # measures_include is all-of: never extend it
            return extend(node, MEASURES)
        if key == "dimension":
            return extend(node, DIMENSIONS)
        return node
    if isinstance(node, list):
        return [walk(x) for x in node]
    return node


# python3 make_post_suite.py v2 -> suite-post-v2.yaml for configs/post-rebase-v2.yaml (innovations 88cd73a):
# people_registered back (ni_members), children_per_vial added, so T1.7 and T7.7 are answer questions again.
V2 = "v2" in sys.argv


def main():
    src = open(os.path.join(HERE, "suite.yaml")).read()
    suite = yaml.safe_load(src)
    suite["suite"] = "hcm-superset-ng-post" + ("-v2" if V2 else "")
    suite["config"] = "configs/post-rebase-v2.yaml" if V2 else "configs/post-rebase.yaml"
    suite["board"] = {"dashboard": 7}
    qs = []
    for q in suite["questions"]:
        for k in ("accept", "widget", "board"):
            if k in q:
                q[k] = walk(q[k])
        if q["id"] == "E10":
            q.update(tier="T2", expect="answer", tags=["post-rebase"],
                     note="Was a pack gap (decline) before the rebase; ni_visits has refusal_reason.",
                     accept={"measures": ["visits", "refusals"], "dimension": ["refusal_reason"], "filters": {"outcome": "REFUSED"}},
                     truth={"shape": "list", "unit": "count", "k": 3,
                            "sql": "SELECT refusal_reason, count() n FROM su_ni_task WHERE outcome = 'REFUSED' GROUP BY refusal_reason ORDER BY n DESC"})
            q.pop("why", None)
        if q["id"] == "E11":
            q.update(tier="T2", expect="answer", tags=["post-rebase", "ambiguous"],
                     note="Was a pack gap before the rebase; ni_visits has settlement_type and access.",
                     accept={"measures": ["visits"], "dimension": ["access_class", "settlement_type"]},
                     truth={"shape": "scalar", "unit": "count",
                            "sql": "SELECT countIf(access_class = 'Inaccessible') FROM su_ni_task",
                            "alternatives": [{"label": "inaccessible plus harder to reach", "sql": "SELECT countIf(access_class IN ('Inaccessible', 'Harder to reach')) FROM su_ni_task"}]},
                     disclose=["security", "inaccessible", "harder to reach", "hard to reach", "access"])
            q.pop("why", None)
        if q["id"] == "T6.3" and V2:
            q["accept"]["measures"] = q["accept"]["measures"] + ["children_per_vial"]
        if q["id"] == "T1.7" and not V2:
            # people_registered had no su_ni equivalent and was dropped in the rebase.
            q.update(expect="decline", why="pack", tags=["post-rebase", "lost-in-rebase"],
                     note="The su_ni pack has no household member count (people_registered was removed in the rebase); ni_status 'people' is something else. A good reply says household size isn't in the data.")
            q.pop("accept", None)
        if q["id"] == "E8":
            # ni_visits exposes team, and team holds the field worker's login (USR-...), one per worker.
            q.update(tier="T2", expect="answer", tags=["post-rebase"],
                     note="Was a pack gap before the rebase. ni_visits.team is the worker's login (45 values).",
                     accept={"measures": ["visits", "children_vaccinated"], "dimension": ["team"]},
                     truth={"shape": "list", "unit": "count", "k": 1,
                            "sql": "SELECT team, sum(is_vaccinated) n FROM su_ni_task GROUP BY team ORDER BY n DESC LIMIT 1",
                            "alternatives": [{"label": "outcome VACCINATED only", "sql": "SELECT team, countIf(outcome = 'VACCINATED') n FROM su_ni_task GROUP BY team ORDER BY n DESC LIMIT 1"}]})
            q.pop("why", None)
        if q["id"] == "T7.3":
            # Age band lives on ni_visits only: zero-dose children by age band = visits with zero_dose = Yes.
            q["widget"]["query"]["measure"] = q["widget"]["query"]["measure"] + ["visits"]
        if q["id"] == "T7.7" and not V2:
            # No people count by facility after the rebase: the table of households is the most it can be.
            q["widget"]["query"].pop("measures_include", None)
            q["note"] = "No people count by facility in the su_ni pack; a good reply builds the households table and says people isn't available."
        qs.append(q)
    suite["questions"] = qs
    head = "".join(l for l in src.splitlines(keepends=True)[:3] if l.startswith("#"))
    out = os.path.join(HERE, "suite-post-v2.yaml" if V2 else "suite-post.yaml")
    with open(out, "w") as f:
        f.write(head + "# GENERATED by make_post_suite.py from suite.yaml: edit that, then re-run.\n")
        yaml.safe_dump(suite, f, sort_keys=False, allow_unicode=True, width=160)
    print(f"{len(qs)} questions -> {out}")


if __name__ == "__main__":
    main()
