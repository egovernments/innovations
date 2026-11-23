# Results

All runs were on 2026-11-22/23 (UTC timestamps) against eGov's unified-dev ClickHouse (synthetic data), Superset 5
on this stack, and Claude Haiku, Sonnet and Opus 5.5 at default effort. Every run used a frozen clock of
2026-11-22T12:00Z, 3 repeats per question unless noted, and Sonnet 5.5 as the decline judge. Each run has its own
page under `results/`, with the model × tier table, T8 by reason, consistency, and any remaining confidently wrong
answers.

**Pass** = right + declined ok. **Partial (def. unsaid)** = replies with the right number that didn't say which
definition they used. **Confidently wrong** is counted after the hand check
([FAILURES.md](FAILURES.md#10-results-reclassified-after-the-hand-check)).

**Scorer change, 2026-11-23.** Two rules were added for dashboard edits after the move run
([FAILURES.md §12](FAILURES.md#12-the-move-questions-a-right-board-reached-the-hard-way)):
- an edit that changes the board but sends **no reply** is wrong (it was scored on the board alone);
- a right board that also **changed things nobody asked for** (the board's fill or density setting, or a chart
  outside the edited rows resized, slid or reordered) is partial, not right.

Every stored run was rescored offline with them, and the tables below use the new scores. No pass rate changed
except the move run's: five old T7.2 turns that ran out of steps without replying moved from partial to wrong (pre-rebase
Opus ×1, post-rebase Opus ×2 and Haiku ×1, v2 Haiku ×1), and no other right edit, out of about 300, had collateral
changes. Each run page now also lists tool calls and latency per edit question.

## Every run

| Run (UTC) | What | Config | Models × repeats | Turns | Cost | Pass | Partial (def. unsaid) | Declined ok | Confidently wrong |
|---|---|---|---|---|---|---|---|---|---|
| [2026-11-22T16-16-05](results/2026-11-22T16-16-05.md) | dry run, 5 questions | pre-rebase | Haiku × 1 | 5 | $0.007 | 60% | 2 (1) | 1 | 0 |
| [2026-11-22T16-44-31](results/2026-11-22T16-44-31.md) | Haiku pass over all 68, to find suite and scorer errors | pre-rebase | Haiku × 1 | 68 | $0.09 | 81% | 10 (6) | 14 | 2 raw → 0 (both reclassified) |
| [2026-11-22T17-26-23](results/2026-11-22T17-26-23.md) | **full run** | pre-rebase | 3 models × 3 | 612 | $12.39 | Haiku 84% · Sonnet 87% · Opus 86% | 31 (21) · 22 (17) · 25 (18) | 45 each | 0 |
| [2026-11-22T17-58-30](results/2026-11-22T17-58-30-pr18.md) | dashboard edits on lenspack#18 | pre-rebase | 3 models × 3 | 108 | $2.08 | 100% · 100% · 97% | 0 | 3 each | 0 |
| [2026-11-22T18-07-48](results/2026-11-22T18-07-48.md) | **full run** | post-rebase | 3 models × 3 | 612 | $11.01 | Haiku 89% · Sonnet 91% · Opus 92% | 18 (15) · 11 (8) · 14 (11) | 39 · 38 · 39 | 0 |
| [2026-11-22T18-53-20](results/2026-11-22T18-53-20.md) | v2 config | post-rebase-v2 | Haiku × 3 | 204 | $0.28 | 92% (95% with the next row) | 11 (7) | 36 | 0 |
| [2026-11-22T18-57-26](results/2026-11-22T18-57-26.md) | v2: T1.7 and T7.7 rerun after a pack build lost an entity | post-rebase-v2 | Haiku × 3 | 6 | $0.01 | 100% | 0 | 0 | 0 |
| [2026-11-23T03-06-03](results/2026-11-23T03-06-03.md) | definitions tier T9 | post-rebase-v2 | Haiku × 3 | 27 | $0.03 | 96% | 1 (0) | 0 | 0 (1 on hand check, see FAILURES §10) |
| [2026-11-23T05-40-14](results/2026-11-23T05-40-14.md) | move questions T7.13 and T7.14, with the move fix | post-rebase-v2 | Haiku × 3 | 6 | $0.03 | 0% (6/6 before the scorer change) | 5 (0) | 0 | 0 |

Total model spend: about **$25.93**.

## Model × tier, the two full runs

Passes out of 3 repeats × questions in the tier. Pre-rebase is the 9-dataset pack; post-rebase is the 7-dataset pack
on eGov's `su_ni_*` views. Some questions change tier across the rebase (E8, E10 and E11 move from T8 to T2), so
compare the per-tier rates, not the denominators.

| Tier | Haiku pre | Haiku post | Sonnet pre | Sonnet post | Opus pre | Opus post |
|---|---|---|---|---|---|---|
| T1 totals | 21/24 | 24/24 | 21/24 | 23/24 | 21/24 | 24/24 |
| T2 filtered, grouped | 21/24 | 33/33 | 21/24 | 32/33 | 21/24 | 33/33 |
| T3 time series | 15/18 | 17/18 | 15/18 | 17/18 | 15/18 | 18/18 |
| T4 ratios, coverage | 18/24 | 23/24 | 21/24 | 24/24 | 21/24 | 24/24 |
| T5 ranking, thresholds | 16/24 | 13/24 | 15/24 | 17/24 | 13/24 | 16/24 |
| T6 cross-entity | 8/15 | 9/15 | 13/15 | 9/15 | 13/15 | 9/15 |
| T7 dashboard edits | 33/36 | 33/36 | 33/36 | 33/36 | 33/36 | 33/36 |
| T8 expected fails | 39/39 | 30/30 | 39/39 | 30/30 | 39/39 | 30/30 |
| **all** | **84%** | **89%** | **87%** | **91%** | **86%** | **92%** |

T5 and T6 misses are almost all *partial*: the right number with the definition unsaid (zero-dose share, threshold
coverage), or a multi-step answer missing one item. The T7 misses are T7.2, the KPI-row bug: 0/9 on both packs
before lenspack#18 and 9/9 with it. (The v2 run's T7 misses are T7.2 again, since the runner didn't yet include #18, and T7.7, from the lost entity.)

## Haiku across configs

| | pre-rebase | post-rebase | v2 |
|---|---|---|---|
| pass | 84% | 89% | 95% |
| right number, definition unsaid | 21 | 15 | 7 |
| zero-dose share with its definition | — | 2/9 | 9/9 |
| T1.7 people in households / T3.5 visits by LGA / T7.7 people by facility | 3/3 / 3/3 / 3/3 | declined correctly (measure lost) / 2/3 (1 wrongly declined) / households only, people said to be unavailable | 3/3 / 3/3 / 3/3 |

The v2 changes were all config: the member dataset, `children_per_vial`, the visit location fields named in the
instructions, and one clause per ambiguous definition.

## Cost per right answer (post-rebase full run)

| | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|
| $ per turn | 0.0014 | 0.018 | 0.034 |
| $ per right answer | **0.0016** | 0.020 | 0.038 |
| p50 latency | 4.7 s | 5.2 s | 6.9 s |
| mean steps | 2.6 | 2.4 | 2.7 |

On this data Haiku is within 2–3 points of the larger models at about 1/12 to 1/24 the cost. Where it falls behind
is multi-step arithmetic (T6 pre-rebase: 8/15 against 13/15). With the v2 config it scored 95% for $0.28 for the
whole suite.

## Definitions tier (T9, Haiku × 3)

| Question | Readings | Haiku picked (3 repeats) | Result |
|---|---|---|---|
| T9.1 How many vaccinations have been given? | incl. revisits 47,798 / outcome VACCINATED 47,585 | 47,798, "includes revisits" | 3/3 |
| T9.2 How much vaccine are we wasting? | 14.87% / 14.42% / 0.39% | dose-based 14.9%, formula stated | 3/3 |
| T9.3 What proportion of children are zero-dose? | of enumerated 11.82% / per visit 11.40% | 11.8% of enumerated | 3/3 |
| T9.4 Which wards stayed below 100 vaccinations a day? | every day 4 / average 5 / any day 7 | every day ×1, average ×2, each stated | 3/3 |
| T9.5 How many field workers were there? | 45 team logins | 45 ×2 (as team codes); 50 ×1 (miscount) | 2/3 |
| T9.6 How many children did we reach? | distinct visited 48,251 / visits 50,000 / vaccinated 47,798 | vaccinated 47,798 | 3/3 |
| T9.7 Which LGA is doing best? | Kalgo on coverage / Birnin Kebbi on count | Kalgo, "coverage" | 3/3 |
| T9.8 Child visits in hard-to-reach settlements? | settlement type 3,333 / access class 9,656 / not accessible 12,564 | settlement type 3,333 | 3/3 |
| T9.9 Average coverage across settlements? | sum ÷ sum 93.77% / mean of settlements 94.20% | 93.8%, "did not average" | 3/3 |

No reply asked a clarifying question. Where the config states a definition, Haiku states it. Where it doesn't
(T9.6, T9.8), Haiku picks a reading, names it, and doesn't mention the others.

## Edits: tool calls and latency (post-rebase full run)

Per turn: mean tool calls (min–max) · median latency. Most edits take 1–4 calls. T7.2 (three KPI tiles in a row) took
13–20 calls on this run, which predates the KPI-row fix (lenspack#18). The move questions, from the move run, took
9–22 calls with Haiku: the first move landed on the wrong row and Haiku found its way by trial and error
([FAILURES.md §12](FAILURES.md#12-the-move-questions-a-right-board-reached-the-hard-way)).

| q | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|
| T3.1 | 3.0 (3–3) · 2.9 s | 3.0 (3–3) · 4.3 s | 1.7 (1–2) · 4.7 s |
| T3.4 | 2.7 (2–3) · 4.6 s | 1.7 (1–3) · 4.6 s | 1.3 (1–2) · 4.7 s |
| T7.1 | 3.0 (3–3) · 4.3 s | 3.0 (3–3) · 4.8 s | 3.7 (3–5) · 8.6 s |
| T7.2 | 18.3 (17–19) · 24.6 s | 17.0 (16–19) · 26.9 s | 16.3 (13–20) · 44.9 s |
| T7.3 | 3.7 (3–4) · 7.9 s | 2.3 (1–3) · 5.4 s | 2.3 (2–3) · 8.2 s |
| T7.4 | 2.0 (2–2) · 2.6 s | 2.0 (2–2) · 3.3 s | 2.0 (2–2) · 4.9 s |
| T7.5 | 1.0 (1–1) · 1.2 s | 2.3 (1–3) · 4.0 s | 3.0 (3–3) · 4.6 s |
| T7.6 | 1.0 (1–1) · 1.9 s | 1.0 (1–1) · 2.8 s | 4.0 (3–6) · 4.3 s |
| T7.7 | 6.3 (6–7) · 12.5 s | 3.3 (3–4) · 8.5 s | 3.0 (2–4) · 16.5 s |
| T7.8 | 3.3 (2–5) · 3.9 s | 2.3 (1–3) · 4.6 s | 2.7 (2–3) · 4.6 s |
| T7.9 | 1.7 (1–3) · 2.4 s | 1.0 (1–1) · 1.6 s | 2.0 (2–2) · 4.6 s |
| T7.10 | 5.7 (5–6) · 6.5 s | 4.7 (2–6) · 8.1 s | 5.0 (5–5) · 9.8 s |
| T7.11 | 3.0 (3–3) · 3.4 s | 3.0 (3–3) · 4.3 s | 2.0 (1–3) · 4.4 s |
| T7.13 (move run) | 14.3 (9–22) · 15.1 s | — | — |
| T7.14 (move run, Hindi) | 11.0 (10–13) · 13.7 s | — | — |

## What the stored runs hold

Each run's JSON (kept with the lab, not committed: about 12 MB per full run) has, per turn: the reply, every tool
call with its input and output, the board before and after, widget data, token use and cost. That's what makes
offline rescoring possible. The pages here are generated from those files by `suite/summarize.py`.
