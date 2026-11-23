# Failure cases and what they mean

Every miss in the runs was read by hand. This page covers each kind of failure: what happened, a sample of what the
model actually said (synthetic data), the cause, and what changed. Run timestamps refer to [RESULTS.md](RESULTS.md).

**Summary.**
- After the hand check, no run had a confidently wrong answer that was the model's fault.
- What separates the models is multi-step arithmetic (T5/T6).
- What separates *configs* is whether the instructions name the definitions.
- Two failures were in Lenspack itself (KPI-row placement; fixed in lenspack#18), and one was in Superset (a
  dataset-lookup race; fixed in this PR).

## 1. Three KPI tiles wouldn't sit in one row (engine bug, T7.2)

**Question:** "Add a row of three KPI tiles across the top: children vaccinated, children coverage %, and zero-dose children."
**Result:** 0/9 on the pre-rebase full run (`2026-11-22T17-26-23`), every model. 9/9 on a Lenspack build with
lenspack#18 (`2026-11-22T17-58-30`).

Haiku, before the fix, made 18 tool calls: 3× add_widget, 7× move_widget, 5× resize_widget, get_board, set_layout_mode
and list_versions. It ended with three full-width tiles stacked:

```
top_children_vaccinated  x=0 y=0 w=12
top_children_coverage    x=0 y=3 w=12
top_zero_dose            x=0 y=6 w=12
```

After the fix, it made 4 calls:

```
top_kpi_children_vaccinated  x=0 y=0 w=4
top_kpi_children_coverage    x=4 y=0 w=4
top_kpi_zero_dose            x=8 y=0 w=4
```
> I added a top row of three KPI tiles, each a third of the width: Children vaccinated, Children coverage %, and Zero-dose children, in that order.

**Cause:** in Lenspack core's placement (`place`/`pack` with `grid.fill`), a lone widget added at the top was widened
to the edge, so the next one couldn't sit beside it. The same three adds in one batch formed a row. lenspack#18 makes
sequential adds fill the current row, like a batch. The other T7 questions were unchanged by the fix.

## 2. No model says which definition it used unless the config tells it to

**Questions:** every `ambiguous` question.

**Before:** in the pre-rebase full run, *no* reply ever said which definition it used for "children vaccinated"
(0/36). The models gave the right number and stopped:

> A total of 47,798 children were vaccinated across the Kebbi nOPV2 campaign, based on 325 settlement records. *(Haiku, T1.6, pre-rebase)*

**After:** the post-rebase config said "children_vaccinated includes revisits", and disclosure went to 36/36:

> A total of 47,798 children were vaccinated across the campaign. This figure is distinct children and includes children recorded on a revisit. *(Haiku, T1.6, post-rebase)*

Definitions the config didn't mention stayed silent. Zero-dose share was disclosed by Haiku in 2/9 replies. The v2
config named zero-dose share, wastage and thresholds; Haiku went to 9/9 on zero-dose and from 15 to 7 "right number,
definition unsaid" overall (`2026-11-22T18-53-20`).

**The T9 tier** (`2026-11-23T03-06-03`, Haiku × 3) asks nine questions that hang on a definition on purpose. Haiku
passed 26/27. Every pass named its definition:

> Vial wastage is about **14.9%** across the campaign. This is dose-based: 1 − children vaccinated / (vials used × 50), so it counts doses in used vials that were not given to a child. It excludes opened or spoilt vials. *(T9.2)*

> Five wards averaged under 100 vaccinations a day over the 7-day campaign: **Kambaza** … and **Zuguru** (690, about 99/day). I divided each ward's total children vaccinated by 7 campaign days. *(T9.4: "stayed below 100 a day". Another repeat read it as "on every day" and named four wards; both readings are accepted when stated)*

> I did not average the settlement percentages, because an average of ratios would give each settlement equal weight regardless of its size; the figure above is the ratio of totals. *(T9.9)*

The T9 run showed three gaps:
- **No reply ever asked a clarifying question** (0/27). Asking is scored as a pass, but Haiku always picks a reading and names it.
- **Where the config says nothing, it picks one reading and doesn't mention the others.**
  - "How many children did we reach?" got children vaccinated (47,798) 3/3, never distinct children visited (48,251) or visits (50,000).
  - "Hard-to-reach settlements" got settlement type HARD_TO_REACH (3,333) 3/3, never the access class "Harder to reach" (9,656).
  - Both pass on the rules, because they name what they counted. Neither tells the user that another reading exists.
- **One wrong side-claim inside a right answer.**
  > So far, 47,798 children have been vaccinated. This is eGov's children vaccinated count, which includes children recorded on a revisit. The visit-level count of visits with outcome VACCINATED matches it at 47,798. *(T9.1, repeat 3)*

  The tool call filtered visits by `vaccinated = Yes` (the vaccinated flag, 47,798), not by outcome VACCINATED
  (47,585). The headline is right; the explanation is not.

**What it means:** disclosure is a config property more than a model property. The [definitions register](DEFINITIONS.md)
is the list of clauses to put in the instructions once eGov confirms each definition.

## 3. Haiku won't divide totals it already has (T6.1, T6.3)

Sonnet and Opus divide two totals when no measure exists; Haiku often stops at the totals, or divides the wrong pair.
T6 (cross-entity, multi-step) pre-rebase: Haiku 8/15, Sonnet 13/15, Opus 13/15.

> **Birnin Kebbi:** children coverage **93.8%**, zero-dose share **12.3%** (2,342 of 19,055 vaccinated children) … The zero-dose share is my calculation: zero-dose children divided by vaccinated children. *(Haiku, T6.1, pre-rebase: a denominator that matches none of the accepted definitions)*

> The pack has no "children per vial issued" measure. The closest is **children vaccinated per vial used: about 42.6** across the whole campaign (all 45 teams), against 1,545 vials issued. … I can draft a per-vial-issued measure for review if you want that exact number. *(Haiku, T6.3, v2: it has both totals in the reply and doesn't divide 47,798 by 1,545 = 30.9)*

Haiku stayed honest: it said what it was giving instead. These score partial, not confidently wrong.

## 4. A cut-off series read as complete (T6.5)

**Question:** "Which wards had fewer than 100 vaccinations on any single day?" (7 wards). Answering means reading a
ward × day series of 224 points.

> Six wards had fewer than 100 doses delivered on at least one day … Kambaza … Muntubari … Nassarawa I … Ambursa … Zuguru … Zauro (94 on 18 Oct). *(Haiku, pre-rebase)*

Kukah, at 96 on day 1, is missing. The series Haiku read was cut off before it. The models that passed either asked for
the full series or filtered first. This question started as an "expected fail" (E3); the first Haiku pass showed it's
answerable, so it moved to T6.

A scorer limit found on the hand check: one post-rebase Haiku reply was right (7 wards) but added "Diggi: not
included; its lowest day was 108". The scorer counted Diggi against precision, so the reply scored partial. "Not
included" isn't yet in the scorer's list of context phrases.

## 5. A list cut at 20 rows without saying so (T6.4)

> In Kalgo LGA there are 25 health facilities with registered households. Zero-dose children are reported at 19 of them; the other 6 have none in the data. *(Haiku, pre-rebase)*

The truth has zero-dose children at facilities the reply left out (Sabana East Health Post 5, Kwakware Health Post 11,
…). The result was cut at a row limit, and the reply read the cut as "none". This is the same family as #4: a top-N result taken for the whole.

## 6. The instructions left location out of the visit fields (T3.5)

**Question:** "Child visits per day in Gwandu." Post-rebase, 2 of 9 replies wrongly declined:

> I can't show child visits per day for Gwandu. Visit records carry no location, so visits can't be filtered by LGA. *(Haiku, post-rebase)*

**Cause:** the config's instructions listed the visit fields (outcome, gender, age band, settlement type, access, team,
campaign day) but not the location columns, and the models believed the list. The v2 config names them, and T3.5 went
to 3/3:

> Gwandu is an LGA, and it recorded 18,192 child visits over 7 days (12–18 October 2026). Daily visits were: 12 Oct: 2,431 … *(Haiku, v2)*

## 7. Children per vial (T6.3)

Post-rebase, the pack had only `vials_per_child`. Sonnet declined openly, three times out of three:

> I can't give you that number yet, because the pack has no measure for children vaccinated per vial issued. The nearest measure is **Vials used per child vaccinated** … I didn't divide the two totals myself.

v2 added `children_per_vial`. It's per vial **used** (42.6), while the question says per vial **issued** (30.9), so
it's now a definitions entry too. The right reply divides, or says which denominator it gives.

## 8. What the rebase gained and lost

Moving the datasets onto eGov's `su_ni_*` views (pre → post) raised pass rates (Haiku 84→89%, Sonnet 87→91%, Opus
86→92%).

**Gained:** three expected fails became answerable.
- **E8 field worker:** the `team` column holds a login.
  > **USR-318022** vaccinated the most children: 1,592 child visits were recorded as vaccinated, revisits included. This counts by vaccination team, since the data only identifies the user code that recorded each visit. *(Opus, post-rebase)*
- **E10 refusal reasons:** before the rebase the right answer was "the data doesn't record why"; after it, the reasons with counts.
- **E11 insecure settlements:**
  > There were **2,908 visits** in inaccessible settlements. The data has no "insecure" label; its access classes are Accessible (37,436 visits), Harder to reach (9,656) and Inaccessible (2,908). If "harder to reach" is meant as insecure, the total would be 12,564. *(Haiku, post-rebase: this is the disclosure the eval asks for, unprompted)*

**Lost:** "people in registered households" (T1.7, 121,720) and people by facility (T7.7). The pre-rebase pack had a
household-member count; the first su_ni pack didn't. Every model then declined correctly:

> I can't give you that number, because this data doesn't record how many people live in each household. It only counts households and the eligible children in them. *(Opus, post-rebase)*

v2 restored it as a member dataset over `su_ni_member`. Its total and per-LGA figures equal direct SQL and the
household registry mart. T1.7 and T7.7 then went to 3/3:

> About 121,720 people live in the registered households, across all campaign days and places. *(Haiku, v2)*

## 9. Superset returned the wrong dataset for a name lookup

**Symptom:** a pack build occasionally lost or swapped an entity with no error. It was seen 3 times in 9 builds:
ni_members came back as ni_missed, ni_team_stock as ni_members, ni_coverage as ni_visits. It broke the first v2 pass
(`2026-11-22T18-53-20`: the pack had no member entity, so T1.7 and T7.7 failed). It also explains two earlier build
errors ("dataset not found", "also names own entity") and a **startup flake**: one restart of the live Lenspack built
7 of 8 entities, with ni_facilities missing, and the next restart was fine.

**Cause:** Flask-AppBuilder 4.5.5, which Superset 5 pins, keeps a list request's filters on the API view object shared
across gunicorn threads. Two concurrent `GET /api/v1/dataset/?q=(filters:…)` calls can swap filters, and each gets the
other's dataset (21 of 320 concurrent lookups in a test loop). Chart data is built per request and was never affected:
0 mismatches across about 1,350 stored eval queries and 88 concurrent calls.

**Fix:** `superset/superset_config.py` builds list filters per request (commit 1dea630 in this PR; 320/320 correct
after it). Lenspack's Superset client also looks datasets up one at a time and keeps only an exact name match. The
eval harness checks every dataset name before it trusts a pack. After the fix, 15 of 15 pack builds were clean with
no retries. Every full run reported here was checked: its tool outputs show the expected entities.

## 10. Results reclassified after the hand check

Every *confidently wrong* result was read before reporting. None turned out to be the model's error. Each fix was a
scorer, suite, judge or infrastructure change, applied to the stored runs by rescoring offline.

**Haiku pass over every question** (`2026-11-22T16-44-31`): 2 raw.

| Question | Raw | Why it was wrong to call it that | Fix |
|---|---|---|---|
| E3 wards under 100 on any day | confidently wrong | Haiku answered from a ward × day series; the question was answerable, so the suite was wrong to expect a decline | moved to T6.5 with SQL truth |
| E6 this week vs last week | confidently wrong (judge: answered) | "Zero against zero; the data sits in October" is the good reply | clearer note; judge moved from Haiku to Sonnet |

The same pass also showed two scorer misses, scored partial rather than wrong: "Day 3" written for 14 Oct, and "Eight
wards" written as a word. Both are read now.

**Full run, pre-rebase** (`2026-11-22T17-26-23`): 8 raw.

| Question | Model | Raw | Why | Fix |
|---|---|---|---|---|
| T5.4 highest zero-dose share | Opus ×3 | confidently wrong | "41.1% of all zero-dose children": a defensible reading of "share" | zero-dose share accepts three denominators when the reply says which (T5.4, T5.6, T6.1) |
| T5.4 | Sonnet ×1 | confidently wrong | "about 11.7% (2,342 of 19,938 child visits)": per-visit share, stated | same |
| T5.7 lowest-coverage settlement | Sonnet ×1 | confidently wrong | every data call failed with Superset 502; the reply said so and gave no figure | infra error, not a model answer |
| T3.6 last 30 days | Haiku, Sonnet | confidently wrong (judge: answered) | "No children were vaccinated in the last 30 days … the data has no records in that window" is the right reply | a reply that says outright it can't overrules the judge |
| E5 children completing all cycles | Haiku ×1 | confidently wrong (judge: answered) | "I can't answer that from this data … only one cycle" | same |

**Full run, post-rebase** (`2026-11-22T18-07-48`): 13 raw.

| Question | Models | Raw | Why | Fix |
|---|---|---|---|---|
| T1.7 people in households | all three models, 7 | confidently wrong | the rebase removed the measure, so declining was right | T1.7 is an expected fail for the post-rebase pack, answerable again in v2 |
| E8 field worker | Haiku ×2, Opus ×1 | confidently wrong (judge: answered) | the rebase exposed `team` (a login), so the question became answerable, and these replies were right | E8 is an answer question post-rebase, truth USR-318022 / 1,592 |
| T6.3 children per vial | Sonnet ×3 | confidently wrong | "I can't give you that number yet … the pack has no measure": an open decline on an answerable question | scored "wrong (declined)", not confidently wrong |

**T9 run** (`2026-11-23T03-06-03`): 0 raw. One result went the other way on the hand check:

> There were 50 field workers (vaccination teams, identified by user code), each with at least 83 child visits recorded. *(T9.5, repeat 2)*

The truth is 45. Haiku read the `limit: 50` of its list_values call as the count of the 45 values returned. The scorer
called this partial, because the query was right. By the meaning of the metric it's a wrong figure stated as fact. A
follow-up for the runner: on a scalar question, a stated wrong number should be confidently wrong even when the query
was right.
