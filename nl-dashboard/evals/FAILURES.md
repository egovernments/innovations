# Failure cases and what they mean

Every miss in the runs was read by hand. This page covers each kind of failure: what happened, a sample of what the
model actually said (synthetic data), the cause, and what changed. Run timestamps refer to [RESULTS.md](RESULTS.md).

**Summary.**
- After the hand check, no run had a confidently wrong answer that was the model's fault.
- What separates the models is multi-step arithmetic (T5/T6).
- What separates *configs* is whether the instructions name the definitions.
- Three failures were in Lenspack itself (KPI-row placement, fixed in lenspack#18; a move that reported success
  without moving, §11, fixed in lenspack#22; a move into a full row that lands elsewhere, §12, being fixed), and one
  was in Superset (a dataset-lookup race; fixed in this PR).
- A right board isn't the whole answer: since 2026-11-23 an edit with no reply is wrong, and a right board with changes
  nobody asked for is partial (§12).

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

**Edit rules added 2026-11-23** (§12), applied to every stored run by rescoring: five T7.2 turns from before the KPI-row
fix moved from partial to wrong, because they ran out of steps and sent no reply (pre-rebase Opus ×1; post-rebase Opus
×2, Haiku ×1; v2 Haiku ×1). None of them was a pass before, so no pass rate changed. The move run went from 6/6 to 0/6.

## 11. A move reported success but left the chart where it was (engine bug, found in the lab demo)

**What happened.** On the lab demo, asked in Hindi to "put this one up top with the other bar graphs too", the model
called `move_widget` three times on "Children vaccinated by ward". It was alone at full width in the last row (row 7),
and the other bar charts were in rows 2 and 3. Each call answered `applied: true` with a new version (v3 to v5), and the
dashboard saved and refreshed each time. The chart's position and size afterwards were the same as before. The model
then said honestly that the move hadn't worked.

The same thing without a model, on a copy of the dashboard, with the tool's ops (resize the chart to half, then move it
`after:` the first chart in row 2):

```
before:  row 2 = 4+8 wide, row 3 = 6+6, ... row 7 = ward chart, 12 wide
after:   the same: ward chart at the bottom, 12 wide, reported as moved
```

**Root cause.** In `packages/core/src/ops.ts`, `place()` handled `place: "after:<id>"` by scanning down from the anchor's
row for the first free slot wide enough. Before the fix this was the line `if (anchor) startY = anchor.y;`, followed by
the first-fit loop. Two board shapes defeat that scan:

- **Packed boards** (`grid.fill`, which every Superset dashboard is): packing widens the last widget on each row to the
  edge, so no row has a gap. The first free slot below the anchor is the one the moved widget has just left.
- **Unpacked boards**: narrowing widgets leaves gaps where they were. A row can have enough room in total but split into
  gaps (two thirds wide, with two 2-column gaps), and no single gap is wide enough.

On both, the widget went back where it was, and nothing checked that the move had changed anything. The tool's
follow-up resize (to half) was then undone by packing, which widened the lone chart back to the edge.

**When it was introduced.** With the move op itself, in Lenspack 0.1.0 (58f0e77, 2026-09-22). Packing (5235d2c,
2026-09-23) made the full-row case the normal state of a packed board. It is not from lenspack#18: the core repro gives
the same unchanged position at 3d38280 (before #18), at 1d52ad8 (#18), and at the superset head before the fix. The
commerce eval's C16 (a plain, unpacked board) also fails at all three.

**Why tests and evals missed it.**
- Core had no `move_widget` test at all.
- The MCP tool test moved a widget to the top and checked only that the call reported `applied`, not where the widget
  ended up.
- T7 had no move question. Its edit questions add, change, rename and remove widgets, and T7.2's fix was about adds.
- Every check trusted the op's own report of success.

**The fix** (lenspack#22 into main; on the superset branch as 062bcb1 and 158da81):
- `after:<id>` goes beside the anchor when the anchor's row has room.
- When the row's room is split into gaps, the row slides left to join them first.
- A really full row gets a new row straight after the anchor's row, and everything below moves down.
- The move tool resizes before it moves, so it looks for room at the width asked for.

**Prevention.**
- A move that ends where it started is now an error, not a success: "Moving "<id>" there changes nothing: it is
  already in that position", with a hint naming what to say instead. The model can no longer be told "done" for a
  board that didn't change.
- Core tests for each shape: a packed board with every row full, room beside the anchor, room split into gaps (C16's
  exact scenario), and a move with no effect.
- C16 in the stub suite now passes, so it leaves the suite's known bugs. A "move X up beside Y" question is being added to
  T7, and its check reads the board, not the tool's reply.

**Other deployments.** The bug predates the main branch's current code, so every Lenspack build with `move_widget` has
it, including builds that never had #18. On unpacked boards it shows when the anchor's row has no single wide-enough
gap; on packed boards, whenever the rows are full. The fix reaches other deployments once lenspack#22 is merged and they
rebuild.

## 12. The move questions: a right board, reached the hard way

**What was run.** After the fix in §11, two questions reproduce the lab-demo request on a copy of the seed dashboard:
the ward coverage bar starts alone at full width at the bottom, and the LGA coverage bar shares its row with a pie, half
and half, so that row is full. T7.13 asks in English ("Move the ward coverage bar chart up next to the LGA coverage bar
chart"), T7.14 in Hindi ("वार्ड वाला बार ग्राफ भी ऊपर LGA वाले बार ग्राफ के साथ रख दो ना"). The check reads the board: the ward
bar must end on the LGA bar's row with nothing overlapping. A reply saying there's no room, with the board untouched,
also passes; a reply claiming a move the board doesn't show is confidently wrong. Haiku × 3 on Lenspack's superset
branch at 29ead1f (run `2026-11-23T05-40-14`, $0.03).

**Result.** In all six turns the ward bar ended beside the LGA bar at half width, and Hindi questions got Hindi
replies saying what moved:

> वार्ड वाला बार ग्राफ (c50) अब LGA वाले बार ग्राफ (c49) के बगल में, आधी चौड़ाई पर, ऊपर की पंक्ति में है। इसके लिए "Vaccinated children: gender" वाला पाई चार्ट (c52) नीचे सबसे आखिर में पूरी चौड़ाई पर चला गया है। *(T7.14, repeat 1: the ward bar is now beside the LGA bar, at half width; to make room the gender pie went to the bottom.)*

At run time, scored on the board alone, that was 6/6. Reading every turn showed three things the board check missed.

**1. The first move landed on the wrong row, every time.** `move_widget` with `place: "after:c49"` into the full row
answered `applied: true` and put the ward bar on the next row down, still at full width. That isn't a no-op, so §11's new
error doesn't fire. Haiku then worked it out by trial and error, sending the pie in the LGA row to the bottom: 9 to 22
tool calls per turn, 15 seconds median, against 1 to 4 calls for most edits ([RESULTS.md](RESULTS.md#edits-tool-calls-and-latency-post-rebase-full-run)).

**2. Other charts changed.** Once the pie left the LGA row, the board's packing widened the zero-dose pie and the
planned-vs-actual line from half to full width and swapped their order, in five of six turns. In two turns Haiku
switched the board's fill setting off to get the layout it wanted. One reply said so plainly:

> Moving it pushed the other charts down and widened them … I tried to restore their half widths but the board kept them full, so they remain full width. *(T7.13, repeat 2)*

**3. One turn ended in silence.** T7.13 repeat 1 used all 12 steps the chat allows a turn and sent no text. The person
asking would see a changed dashboard and no reply.

**Scorer change.** Both gaps are now in the scorer (lenspack `evals/suite` 686718d), for every edit question:
- an edit that changes the board but sends no reply is **wrong**;
- a right board with **collateral changes** is **partial**. That means the board's fill or density toggled, or a chart
  outside the edited rows resized, slid or reordered. Charts sharing a row with the edited ones are exempt, because the
  board's own packing legitimately resizes them (remove one KPI tile and its neighbour widens).
- Each run page lists tool calls and latency per edit question, so a right board reached by trial and error shows up.

Rescored, the move run is 0/6: five partial (other charts resized; fill off once) and one wrong (no reply). Across all
runs, about 300 other right edits had no collateral changes, so the rule doesn't fire on ordinary adds, removes,
retitles or filters.

**Fixes in Lenspack** (in progress, by PR to main and to the superset branch):
- A move into a full row will say so in the tool result: the row was full, where the widget went, and what to shrink or
  move. It will also name any widgets that packing widened as a side effect.
- A turn that reaches the step limit will still end with a short summary.

**Fix round 1** (lenspack superset 701a644; run `2026-11-23T06-07-20`, 3/6). A move `after:<id>` into a full row now
makes room beside the anchor, and packing no longer widens untouched widgets. The first call landed right in every
turn: LGA bar 3 | ward bar 6 | pie 3, with a note naming what was resized. Haiku then resized the LGA bar back to half,
and that pushed the ward bar off the row; the note said only "also resized: c50 6→12", not that it had left the row.
Haiku looped between move and resize (8–16 tool calls). Three of six replies said the board readings were inconsistent
and the layout couldn't be confirmed, two of them on a right board. One turn reached the step limit and ended on a
refusal message with the board scrambled.

**Fix round 2** (lenspack superset d33dc24, PR #25; run `2026-11-23T06-31-41`, **6/6**):
- a resize in a full row narrows its row-mates, or refuses, and never pushes one off the row;
- notes name row changes, and say when a row is full and no resize is needed;
- a turn that reaches the step limit ends with a description of the board;
- a race in reading the board back was fixed (prompt v14).

Five of six turns made the move in one call; the sixth also widened the LGA bar back to half and sent the pie to its
own row, and said so. Mean tool calls fell from 12.3 to 1.7 (English) and 3.0 (Hindi), median latency from about 15 s to
about 4 s. No other row changed in any turn. The replies name what was narrowed and offer to widen it back:

> The ward coverage chart now sits in row 3, beside the LGA coverage chart. To make room, the LGA chart was narrowed to 3/12 and the "Vaccinated children: gender" pie to 3/12, so I can widen either back if you want. *(T7.13, repeat 2)*

Small slips remain in the wording: one reply calls 3/12 "a third", one Hindi reply says "first row" for row 3, and one
Hindi reply opens by addressing the user by a name it made up ("ललित"), with no name anywhere in the turn.

