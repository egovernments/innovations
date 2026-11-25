# Chat agent: results

**In short.** On the 68 core test questions, Claude Haiku 5.5 got 95% right once the definitions were written into
Lenspack's instructions, at $0.0015 per right answer. Claude Sonnet 5.5 and Opus 5.5 got 91% on the configuration
they were run on, against Haiku's 89% there, at 12 and 24 times Haiku's cost per right answer. After a person read
every answer the scorer marked as a wrong number stated as fact, no model had stated one on the core questions; in the
later definitions group, the hand check found one (below). The data is a clean synthetic campaign, so these scores
are a ceiling for real data.

All runs were in November 2026 against a synthetic campaign in eGov's development ClickHouse database, read through
Superset 5. Each question was asked 3 times per model unless noted. The models ran at their default effort. Each run
has its own page under [`runs/`](runs/), and the [run history](#run-history) at the bottom lists them all.

**Terms used on this page**

- **Configurations.** Lenspack reads the data through a config file. Three were tested; see
  [README](README.md#configurations) for what each holds.
  - *Own joins*: our hand-made joins over eGov's analytics tables ([`configs/joins.yaml`](https://github.com/theflywheel/lenspack/blob/ce9cd0fe932f811d2542be607716bd8a4ef5c602/evals/suites/hcm/configs/joins.yaml)).
  - *eGov views*: eGov's ready-made Superset views, read as they are ([`configs/views.yaml`](https://github.com/theflywheel/lenspack/blob/ce9cd0fe932f811d2542be607716bd8a4ef5c602/evals/suites/hcm/configs/views.yaml)).
  - *eGov views + definitions*: the same views, plus instructions that say which definition each ambiguous term uses
    ([`configs/views-definitions.yaml`](https://github.com/theflywheel/lenspack/blob/ce9cd0fe932f811d2542be607716bd8a4ef5c602/evals/suites/hcm/configs/views-definitions.yaml)).
- **Pass** = right, or rightly said "can't" for a question the data can't answer.
- **Partial** = the right figure but incomplete, or the right figure without saying which definition it used.
- **Wrong, stated as fact** = a wrong or invented number given as an answer. The run pages call this *confidently
  wrong*. It is the main safety measure, and every case was read by a person before it was reported.
- **Question groups** T1 to T11, and question ids such as T1.7, are listed in [QUESTIONS.md](QUESTIONS.md).

## Pass rate by model and configuration

The 68 core questions (groups T1 to T8), 3 tries each. Cells give the pass rate and the cost per right answer.

| Model | Own joins | eGov views | eGov views + definitions |
|---|---|---|---|
| Claude Haiku 5.5 | 84% · $0.0017 | 89% · $0.0016 | 95% · $0.0015 |
| Claude Sonnet 5.5 | 87% · $0.023 | 91% · $0.020 | |
| Claude Opus 5.5 | 85% · $0.046 | 91% · $0.038 | |
| Wrong, stated as fact (after the hand check) | 0 · 0 · 0 | 0 · 0 · 0 | 0 |
| Run | [full run 1](runs/2026-11-22T17-26-23.md) | [full run 2](runs/2026-11-22T18-07-48.md) | [Haiku run](runs/2026-11-22T18-53-20.md) + [rerun of 2 questions](runs/2026-11-22T18-57-26.md) |

- Sonnet and Opus were not run on *eGov views + definitions*, so those cells are blank.
- Haiku's 95% is 92% as run, with two questions rerun: the run's Lenspack had lost one dataset to a Superset bug
  ([FAILURES.md §9](FAILURES.md#9-superset-returned-the-wrong-dataset-for-a-name-lookup)), and both questions needed
  it. Its cost per right answer is from the main run.

## Question groups added later

Run on Claude Haiku 5.5 only, with *eGov views + definitions*, 3 tries per question.

| Group | Questions | Passes | Run |
|---|---|---|---|
| Definitions: questions that depend on which definition is used, on purpose (T9) | 9 | 26/27 (the one miss, 50 field workers against 45, was scored partial; on the hand check it is a wrong figure stated as fact) | [definitions run](runs/2026-11-23T03-06-03.md) |
| Heatmaps: create one, read it, change it (T10) | 3 | 9/9 | [heatmap run](runs/2026-11-23T06-00-19.md) |
| Maps: create one, read it, change it (T11) | 3 | 9/9 | [map run](runs/2026-11-23T07-55-36.md) |
| Moving a chart into a full row, in English and Hindi (T7.13, T7.14) | 2 | 5/6 | [latest move run](runs/2026-11-23T07-37-21.md) |

## By language

| Language | Questions | Claude Haiku 5.5 | Claude Sonnet 5.5 | Claude Opus 5.5 | Run |
|---|---|---|---|---|---|
| English | 84 | 95% of the 68 core questions, plus the later groups above | 91% | 91% | as in the tables above |
| Hindi | 1: move a chart up beside another | 2/3 (the same request in English, same run: 3/3) | | | [latest move run](runs/2026-11-23T07-37-21.md) |
| French | 0 | | | | |
| Portuguese | 0 | | | | |

The chat panel works in French and Portuguese, but no test question is in either language yet, and Sonnet and Opus
never saw the Hindi question. The Hindi miss was partial: the chart moved, but the model also sent the pie chart that shared the row to a
row of its own at full width (and said so in Hindi).

## Cost and speed

*eGov views*, [full run 2](runs/2026-11-22T18-07-48.md).

| | Claude Haiku 5.5 | Claude Sonnet 5.5 | Claude Opus 5.5 |
|---|---|---|---|
| $ per question | 0.0014 | 0.018 | 0.034 |
| $ per right answer | **0.0016** | 0.020 | 0.038 |
| median time to answer | 4.7 s | 5.2 s | 6.9 s |
| mean tool calls (steps) | 2.6 | 2.4 | 2.7 |

Haiku is within 2 to 3 points of the larger models at 1/12 to 1/24 of the cost. Where it falls behind is arithmetic
over several steps: on the cross-entity group with *own joins* it got 8/15, against 13/15 for the others. With
*eGov views + definitions* it scored 95% for $0.28 for the whole set of questions.

## By model and question group, the two full runs

Passes out of 3 tries × the questions in the group. Three questions (field worker, refusal reasons, insecure
settlements) became answerable with *eGov views* and moved from the "can't" group to the filtered group, so compare
rates, not the totals. The last column is Haiku with *eGov views + definitions*, for comparison.

| Group | Haiku, own joins | Haiku, eGov views | Sonnet, own joins | Sonnet, eGov views | Opus, own joins | Opus, eGov views | Haiku, eGov views + definitions |
|---|---|---|---|---|---|---|---|
| T1 totals | 21/24 | 24/24 | 21/24 | 23/24 | 21/24 | 24/24 | 21/24 |
| T2 filtered, grouped | 21/24 | 33/33 | 21/24 | 32/33 | 21/24 | 33/33 | 33/33 |
| T3 time series | 15/18 | 17/18 | 15/18 | 17/18 | 15/18 | 18/18 | 17/18 |
| T4 ratios, coverage | 18/24 | 23/24 | 21/24 | 24/24 | 21/24 | 24/24 | 23/24 |
| T5 ranking, thresholds | 16/24 | 13/24 | 15/24 | 17/24 | 13/24 | 16/24 | 19/24 |
| T6 cross-entity | 8/15 | 9/15 | 13/15 | 9/15 | 13/15 | 9/15 | 14/15 |
| T7 dashboard edits | 33/36 | 33/36 | 33/36 | 33/36 | 31/36 | 32/36 | 30/36 |
| T8 should say "can't" | 39/39 | 30/30 | 39/39 | 30/30 | 39/39 | 30/30 | 30/30 |
| **all** | **84%** | **89%** | **87%** | **91%** | **85%** | **91%** | **92%** (95% with the rerun) |

- The misses in ranking (T5) and cross-entity (T6) are almost all partial: the right number without its definition
  (zero-dose share, which coverage a threshold uses), or an answer over several steps missing one item.
- The dashboard-edit misses are the question that asks for three KPI tiles in one row: 0 of 9 on both full runs,
  because of a Lenspack layout bug, and 9 of 9 once it was fixed ([FAILURES.md §1](FAILURES.md#1-three-kpi-tiles-wouldnt-sit-in-one-row-lenspack-layout-bug)).
  The Haiku run with definitions was made before that fix and also lost the people dataset (above), hence 30/36.

## Haiku across configurations

| | Own joins | eGov views | eGov views + definitions |
|---|---|---|---|
| pass | 84% | 89% | 95% |
| right number, definition not said | 21 | 15 | 7 |
| zero-dose share, with its definition said | | 2/9 | 9/9 |
| people in registered households (T1.7) | 3/3 | rightly declined: the measure was lost | 3/3 |
| child visits per day in one LGA (T3.5) | 3/3 | 2/3 (one wrongly declined) | 3/3 |
| table of people by health facility (T7.7) | 3/3 | households only; said people were unavailable | 3/3 |

The zero-dose cell for *own joins* is blank: that run's page doesn't break it out. Every change from *eGov views*
to *eGov views + definitions* was in the config file: a people dataset, a children-per-vial measure, the visit
location fields named in the instructions, and one sentence per ambiguous definition.

## Definitions questions (T9, Claude Haiku 5.5, 3 tries)

Each question has more than one defensible answer. A reply passes with any of them if it says which one it used.

| Question | Readings | Haiku answered (3 tries) | Result |
|---|---|---|---|
| How many vaccinations have been given? | including revisits 47,798 / visits marked VACCINATED 47,585 | 47,798, "includes revisits" | 3/3 |
| How much vaccine are we wasting? | 14.87% / 14.42% / 0.39% | dose-based 14.9%, formula stated | 3/3 |
| What proportion of children are zero-dose? | of children enumerated 11.82% / per visit 11.40% | 11.8% of enumerated | 3/3 |
| Which wards stayed below 100 vaccinations a day? | every day 4 wards / on average 5 / on any day 7 | every day ×1, on average ×2, each said | 3/3 |
| How many field workers were there? | 45 team logins | 45 ×2 (as team codes); 50 ×1 (miscount; a wrong figure stated as fact on the hand check) | 2/3 |
| How many children did we reach? | distinct children visited 48,251 / visits 50,000 / vaccinated 47,798 | vaccinated 47,798 | 3/3 |
| Which LGA is doing best? | Kalgo on coverage / Birnin Kebbi on count | Kalgo, "coverage" | 3/3 |
| How many child visits were in hard-to-reach settlements? | settlement type 3,333 / access class 9,656 / not accessible 12,564 | settlement type 3,333 | 3/3 |
| What is the average coverage across settlements? | sum ÷ sum 93.77% / mean of settlements 94.20% | 93.8%, "did not average" | 3/3 |

No reply asked a clarifying question. Where the config states a definition, Haiku states it. Where it doesn't
(children reached, hard to reach), Haiku picks one reading, names it, and doesn't mention the others.

## Dashboard edits: tool calls and time

*eGov views*, [full run 2](runs/2026-11-22T18-07-48.md), plus the move runs. Per question: mean tool calls (min–max)
· median time to answer. Most edits take 1 to 4 calls.

- The three-KPI-tiles question took 13 to 20 calls on this run, before the layout fix.
- The move questions took 9 to 22 calls with Haiku at first: the first move landed on the wrong row and Haiku found
  its way by trial and error. After two rounds of fixes in Lenspack they take 1 to 3 calls
  ([FAILURES.md §12](FAILURES.md#12-the-move-questions-a-right-dashboard-reached-the-hard-way)).

| Question | Claude Haiku 5.5 | Claude Sonnet 5.5 | Claude Opus 5.5 |
|---|---|---|---|
| T3.1 line chart of children vaccinated per day | 3.0 (3–3) · 2.9 s | 3.0 (3–3) · 4.3 s | 1.7 (1–2) · 4.7 s |
| T3.4 cumulative share of target by day | 2.7 (2–3) · 4.6 s | 1.7 (1–3) · 4.6 s | 1.3 (1–2) · 4.7 s |
| T7.1 bar chart of coverage by ward | 3.0 (3–3) · 4.3 s | 3.0 (3–3) · 4.8 s | 3.7 (3–5) · 8.6 s |
| T7.2 three KPI tiles in one row (before the fix) | 18.3 (17–19) · 24.6 s | 17.0 (16–19) · 26.9 s | 16.3 (13–20) · 44.9 s |
| T7.3 bar chart of zero-dose by age band | 3.7 (3–4) · 7.9 s | 2.3 (1–3) · 5.4 s | 2.3 (2–3) · 8.2 s |
| T7.4 filter on LGA | 2.0 (2–2) · 2.6 s | 2.0 (2–2) · 3.3 s | 2.0 (2–2) · 4.9 s |
| T7.5 rename the board | 1.0 (1–1) · 1.2 s | 2.3 (1–3) · 4.0 s | 3.0 (3–3) · 4.6 s |
| T7.6 remove a tile | 1.0 (1–1) · 1.9 s | 1.0 (1–1) · 2.8 s | 4.0 (3–6) · 4.3 s |
| T7.7 table of households and people by facility | 6.3 (6–7) · 12.5 s | 3.3 (3–4) · 8.5 s | 3.0 (2–4) · 16.5 s |
| T7.8 pie chart of visits by outcome | 3.3 (2–5) · 3.9 s | 2.3 (1–3) · 4.6 s | 2.7 (2–3) · 4.6 s |
| T7.9 change a pie into a bar chart | 1.7 (1–3) · 2.4 s | 1.0 (1–1) · 1.6 s | 2.0 (2–2) · 4.6 s |
| T7.10 bar chart by LGA, then by ward (two turns) | 5.7 (5–6) · 6.5 s | 4.7 (2–6) · 8.1 s | 5.0 (5–5) · 9.8 s |
| T7.11 line chart of households per day | 3.0 (3–3) · 3.4 s | 3.0 (3–3) · 4.3 s | 2.0 (1–3) · 4.4 s |
| T7.13 move a chart, English: first move run | 14.3 (9–22) · 15.1 s | | |
| T7.14 move a chart, Hindi: first move run | 11.0 (10–13) · 13.7 s | | |
| T7.13, after the first round of fixes | 12.3 (8–15) · 15.5 s | | |
| T7.14, after the first round of fixes | 12.3 (9–16) · 15.8 s | | |
| T7.13, after the second round of fixes | **1.7 (1–2) · 3.6 s** | | |
| T7.14, after the second round of fixes | **3.0 (1–6) · 4.3 s** | | |
| T7.13, after a later prompt change | 2.0 (2–2) · 3.9 s | | |
| T7.14, after a later prompt change | 2.0 (1–3) · 5.6 s | | |

The move questions were added after the full runs, so only Haiku has numbers for them.

## Run history

### Every run

Each run is named by its start time (UTC), which is also its page. "Partial (def. not said)" counts partial answers,
with in brackets how many of them were the right number without its definition.

| Run | What | Configuration | Models × tries | Answers | Cost | Pass | Partial (def. not said) | Rightly said "can't" | Wrong, stated as fact |
|---|---|---|---|---|---|---|---|---|---|
| [2026-11-22T16-16-05](runs/2026-11-22T16-16-05.md) | dry run, 5 questions | own joins | Haiku × 1 | 5 | $0.007 | 60% | 2 (1) | 1 | 0 |
| [2026-11-22T16-44-31](runs/2026-11-22T16-44-31.md) | Haiku once over all 68, to find errors in the questions and the scorer | own joins | Haiku × 1 | 68 | $0.09 | 81% | 10 (6) | 14 | 2 as scored → 0 after the hand check |
| [2026-11-22T17-26-23](runs/2026-11-22T17-26-23.md) | **full run 1** | own joins | 3 models × 3 | 612 | $12.39 | Haiku 84% · Sonnet 87% · Opus 85% | 31 (21) · 22 (17) · 27 (18) | 45 each | 0 |
| [2026-11-22T17-58-30](runs/2026-11-22T17-58-30-pr18.md) | dashboard edits with the fix for the KPI row ([Lenspack change](https://github.com/theflywheel/lenspack/pull/18)) | own joins | 3 models × 3 | 108 | $2.08 | 100% · 100% · 97% | 0 | 3 each | 0 |
| [2026-11-22T18-07-48](runs/2026-11-22T18-07-48.md) | **full run 2** | eGov views | 3 models × 3 | 612 | $11.01 | Haiku 89% · Sonnet 91% · Opus 91% | 18 (15) · 11 (8) · 15 (11) | 39 · 38 · 39 | 0 |
| [2026-11-22T18-53-20](runs/2026-11-22T18-53-20.md) | Haiku with definitions | eGov views + definitions | Haiku × 3 | 204 | $0.28 | 92% (95% with the next row) | 11 (7) | 36 | 0 |
| [2026-11-22T18-57-26](runs/2026-11-22T18-57-26.md) | people in households (T1.7, T7.7) rerun, after a Lenspack build lost that dataset | eGov views + definitions | Haiku × 3 | 6 | $0.01 | 100% | 0 | 0 | 0 |
| [2026-11-23T03-06-03](runs/2026-11-23T03-06-03.md) | definitions group T9 | eGov views + definitions | Haiku × 3 | 27 | $0.03 | 96% | 1 (0) | 0 | 0 (1 on the hand check, see [FAILURES.md §10](FAILURES.md#10-results-reclassified-after-the-hand-check)) |
| [2026-11-23T05-40-14](runs/2026-11-23T05-40-14.md) | move questions T7.13, T7.14, with the first move fix | eGov views + definitions | Haiku × 3 | 6 | $0.03 | 0% (6/6 before the scoring rules tightened) | 5 (0) | 0 | 0 |
| [2026-11-23T06-00-19](runs/2026-11-23T06-00-19.md) | heatmap group T10, on a Lenspack build with heatmaps; Haiku labelled declines | eGov views + definitions | Haiku × 3 | 15 | $0.02 | 100% | 0 | 0 | 0 |
| [2026-11-23T06-07-20](runs/2026-11-23T06-07-20.md) | move questions, first round of Lenspack fixes | eGov views + definitions | Haiku × 3 | 6 | $0.03 | 33% | 2 (0) | 0 | 0 |
| [2026-11-23T06-31-41](runs/2026-11-23T06-31-41.md) | move questions, second round of Lenspack fixes ([Lenspack change](https://github.com/theflywheel/lenspack/pull/25)) | eGov views + definitions | Haiku × 3 | 6 | $0.01 | **83%** | 1 (0) | 0 | 0 |
| [2026-11-23T06-32-24](runs/2026-11-23T06-32-24.md) | heatmap group again on the second-round build, to check nothing broke | eGov views + definitions | Haiku × 1 | 3 | $0.01 | 67% | 1 (0) | 0 | 0 |
| [2026-11-23T07-37-21](runs/2026-11-23T07-37-21.md) | move questions after a prompt change: row and width words taken from the tool's notes, and no names | eGov views + definitions | Haiku × 3 | 6 | $0.01 | **83%** | 1 (0) | 0 | 0 |
| [2026-11-23T07-55-36](runs/2026-11-23T07-55-36.md) | map group T11 on a Lenspack build with maps, dashboard read live; Haiku labelled declines | eGov views + definitions | Haiku × 3 | 9 | $0.01 | 100% | 0 | 0 | 0 |

Total model spend: about **$26.02**. Sonnet 5.5 labelled declines unless the row says otherwise.

### When the scoring rules tightened

All stored runs were rescored offline after each change, with no new model calls, and every table on this page uses
the new scores.

**First change.** Two rules for dashboard edits, added after the first move run
([FAILURES.md §12](FAILURES.md#12-the-move-questions-a-right-dashboard-reached-the-hard-way)):
- an edit that changes the board but sends **no reply** is wrong (it had been scored on the board alone);
- a right board that also **changed things nobody asked for** (the board's fill or density setting, or a chart
  outside the edited rows resized, slid or reordered) is partial, not right.

No pass rate changed except the first move run's. Five old KPI-tiles answers that ran out of steps without replying
moved from partial to wrong (own joins: Opus ×1; eGov views: Opus ×2, Haiku ×1; eGov views + definitions: Haiku ×1).
No other right edit, out of about 300, had changes nobody asked for. Each run page now also lists tool calls and time
per edit question.

**Second change.** If the model itself moved a chart out of an edited row, or widened one, without undoing
it, a right board is now partial. Narrowing a chart to make room doesn't count, since the layout does that itself.
Rescored: Opus fell from 86% to 85% with *own joins* and from 92% to 91% with *eGov views*: on the "remove a tile"
question it made the three remaining tiles a third wide each, unasked, though it said so. One Haiku answer in each
move run from the first round of fixes on also became partial: it sent the gender pie to a row of its own.

### Notes on single runs

- **Heatmaps (T10).** Each try first asked for a heatmap over a daily series, which Superset's heatmap can't keep in
  date order, so Lenspack refuses it before making the change (the 9 tool errors in the run). The model then built
  one over the day's label, split by ward. Creating it takes 3 tool calls; the follow-up change takes 6 over its two
  turns.
- **Heatmap re-check** (one try, after the second round of move fixes). Creating and reading passed. Changing it was
  partial: in the first turn Haiku built the heatmap over the campaign day number rather than the day label, which the
  question's check requires. Days 1 to 7 as numbers stay in order, so the chart is defensible; one try is not enough
  to say something broke.
- **Maps (T11).** The board was read live from the dashboard rather than from the saved starting board, which
  predates maps and holds the facilities map as a chart Lenspack can't edit. Creating the map takes 2 tool calls;
  resizing the points is one change that keeps the colour. On "which facility has the most zero-dose children",
  every try answered from a ranking query and said so, rather than reading the map's points.

## What the stored runs hold

Each run's full record (kept with the lab, not committed: about 12 MB per full run) has, per answer: the reply, every
tool call with its input and output, the board before and after, the chart data, token use and cost. That is what
makes offline rescoring possible. The pages in [`runs/`](runs/) are generated from those records by
[`summarize.py`](summarize.py).
