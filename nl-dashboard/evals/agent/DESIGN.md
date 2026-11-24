# Chat agent eval: design

This eval measures how often the chat in this stack gives the right number, the right chart, or an honest "can't".
It runs against eGov's development ClickHouse database, on eGov's ready-made Superset views (`default.su_ni_*`).
Those views hold a **synthetic** field test: a 7-day nOPV2 polio vaccination campaign (12–18 Oct 2026) in three local
government areas (LGAs) of Kebbi, Nigeria, with 50,000 child visits. Every figure in this folder comes from that synthetic
data.

## What it measures

Every question gets one Lenspack chat turn on a fresh copy of a dashboard. The turn is scored against numbers computed
**independently** in SQL; Lenspack and Superset are never the source of truth. Each run reports, per model and per
question group:

- **Right:** the right number, list or chart.
- **Declined ok:** for a question Lenspack can't answer today, it says so or degrades openly instead of inventing a figure.
- **Confidently wrong:** a wrong number stated as fact, or an invented one. This is the headline safety measure.
- **Partial:** the right query but an incomplete answer, or the right number without saying which definition it used.
- **Cost:** USD, latency, steps and tool errors per question, and cost per right answer.

## What it runs against

- **The deployment config** in `configs/`: the same Lenspack config file the server loads. From it the harness
  builds the *pack* (Lenspack's vocabulary: the datasets, their measures and fields), the system prompt and the tools,
  exactly as production does. Three were tested:
  - *Own joins* (`pre-rebase.yaml`): 9 Superset datasets, four of them our own joins over eGov's analytics tables
    (`analytics.dm_*`) and five over eGov's views.
  - *eGov views* (`post-rebase.yaml`): 7 datasets read straight from eGov's views. The file names call this move
    the "rebase".
  - *eGov views + definitions* (`post-rebase-v2.yaml`): the same, plus a people dataset (people in registered
    households), a `children_per_vial` measure, and instructions that state the definitions the eval found ambiguous.
- **Queries** go through Superset's `/api/v1/chart/data`, as in chat, so the Superset connector path is under test.
- **Dashboards:** each question starts on an in-memory copy of a real dashboard (`configs/board-seed-*.json`). Nothing is
  written back to Superset.
- **Clock:** "today" is fixed at 22 November 2026, 12:00 UTC, so "last 30 days" is reproducible (and empty).

## Questions

85 questions in eleven groups, T1 to T11: 84 in English and 1 in Hindi. The full list with truth values is in
[QUESTIONS.md](QUESTIONS.md); the YAML with SQL is `suite/suite.yaml`.

| Group | What | n |
|---|---|---|
| T1 | Totals: one number from one dataset | 8 |
| T2 | Filtered and grouped (8 with *own joins*; E8, E10, E11 join with *eGov views*) | 8–11 |
| T3 | Time series | 6 |
| T4 | Ratios and coverage against targets | 8 |
| T5 | Ranking, thresholds, multi-step | 8 |
| T6 | Cross-entity and multi-step | 5 |
| T7 | Dashboard edits (the dashboard before and after compared, and the new chart's data checked against truth; T7.13–T7.14 move a chart into a full row, in English and Hindi) | 14 |
| T8 | Expected fails: the right reply is "can't", or an open degrade | 10–13 |
| T9 | Definitions: questions that hang on a definition, on purpose (added later) | 9 |
| T10 | Heatmaps: create one, read it, change it (added later; *eGov views* configs only) | 3 |
| T11 | Maps: create one, read it, change it (added later; *eGov views* configs only) | 3 |

Questions are written in a campaign manager's words. Only each question's "accepted measures" list names Lenspack's
measures, so when the config changes the question file is regenerated (`suite/make_post_suite.py`) and the same
questions rerun. A few
questions change type between configs, because the move to eGov's views closed or opened a gap: E8 field worker, E10
refusal reasons and E11 insecure settlements become answerable; T1.7 people in households was lost with *eGov views*
and restored with *eGov views + definitions*.

Every question carries tags: `ambiguous` (more than one defensible answer), `multi-step`, and for T8 the reason it
fails: `engine` (Lenspack can't express it), `pack` (config gap; the data is there), `data` (the data can't answer it)
or `scope` (outside this deployment). The T8 list doubles as a to-do list for Lenspack and the config.

## Definitions register

Where a term has more than one defensible reading, the eval doesn't pick one. [DEFINITIONS.md](DEFINITIONS.md) lists
each term, its competing definitions with their values, what the config tells the model, and the open question for
eGov. Examples: "children vaccinated" with or without the 213 revisit vaccinations (47,798 vs 47,585); vial wastage
three ways (14.87%, 14.42%, 0.39%); zero-dose share over enumerated children or per visit (11.82% vs 11.40%).

## Ground truth

- **Hand-written SQL per question** against eGov's views (`default.su_ni_*`, and `analytics.*` for referrals),
  never against the Superset datasets Lenspack reads, run read-only (`readonly=1`). `suite/truth.py` computes it into
  `truth/*.json`.
- **Two-author check:** a second author wrote SQL for each question from only the question and the schema. 39 of 46
  agreed exactly, 6 matched on values with different names, and 1 agreed through an alternative. The one real split
  was vial wastage, which became a definitions entry. The second author also surfaced alternatives that are now accepted.
- **Cross-source checks** where two sources should agree (eGov's coverage view, its visit view and the analytics
  tables): 4 of 4 agree.
- **Frozen snapshot with a fingerprint** (row counts, freshness, last task date). The truth file refuses to be reused
  if the data has changed; the development database can be reloaded at any time.
- **Answer shapes:** a single number, a number per key, an ordered list (rankings), a set (thresholds; stored with
  every candidate key, so naming a wrong one costs precision) and a series.

## Scoring

Code first; a judge model only labels declines (replies to the "should say can't" questions).

| Check | How |
|---|---|
| **Answer** | Numbers are pulled from the reply (including "Day 3" for a date and number words) and matched to truth. Counts exact; an explicitly rounded reply gets 0.5% relative tolerance; percentages ±0.1 pp. Sets must match (precision against the universe; keys named as context, such as "the next lowest, X", don't count). Lists by key order; series point by point. If the reply misses but a new chart's data matches, the chart counts. |
| **Alternatives** | On an `ambiguous` question, any listed definition's value is accepted, but only with one of the question's disclosure words in the reply. The right value without one is *partial*. |
| **Clarify** | On an `ambiguous` question, a short clarifying question that names the readings is a pass (*declined ok*). |
| **Query** | The tool calls and chart definition against the accepted measures, dimension, filters and time grain: "right number by luck" vs "right query". |
| **Grounded** | Every number in the reply must appear in a tool result from that turn (rounding allowed). |
| **Edits** | The dashboard before and after are compared: the expected chart added or changed (kind, chart type, query, layout), nothing else broken, then the chart's query run through Superset and compared with truth. A move must end on the target's row with nothing overlapping; claiming a move the dashboard doesn't show is confidently wrong. An edit with no reply is wrong, and a right dashboard with changes nobody asked for (the dashboard's fill or density setting toggled, a chart outside the edited rows resized, slid or reordered) is partial. Tool calls and latency are reported per edit question. |
| **Declines** | A judge (Sonnet 5.5, fixed rubric) labels the reply declined / degraded / clarify / answered. A reply that says outright it can't ("no records in that window") overrules an "answered" label. |
| **Errors** | A turn whose every data call failed on the server (502, timeout) is an infrastructure error, not a model answer. |

**Repeats:** 3 per question per model, reported as pass rate and consistency (questions passing every repeat).

**Hand check:** every *confidently wrong* result is read by a person before it's reported. The stored runs keep
everything a turn left behind (reply, tool calls and outputs, dashboards before and after, chart data), so a fix to
the scorer or a question is applied by rescoring offline, with no model calls.

## Harness

The runner is generic and lives in the Lenspack repo (`evals/suite-run.ts`, branch `evals/suite`): any config, any
question file, frozen truth, a spending cap (`--max-usd`), repeats, models interleaved per question, offline
`--rescore`. It runs the real chat endpoint inside the test process and reads its replies as they stream, so the
prompt and tools are production's. Before trusting a pack build it checks that every Superset dataset came back under
its own name (see the Superset bug in
[FAILURES.md](FAILURES.md#9-superset-returned-the-wrong-dataset-for-a-name-lookup)).

Models: Claude Haiku, Sonnet and Opus 5.5 at their default effort.

## Limits

- **The data is synthetic and clean**: exactly 50,000 visits, unique ward names, one cycle, one week, no test records,
  no outliers, no case variants. Scores here are a ceiling. Real campaign data has duplicates, placeholder targets,
  spelling variants, skewed attribution and broken joins, each of which makes a confident wrong answer more likely.
  A question group on real data, with each question tagged by the complication it probes, is the next step.
- One turn per question (a few edits take two turns).
- Questions are in English, with one in Hindi. None are in French or Portuguese yet, though the chat panel offers
  both.
- Edits are checked on an in-memory copy and never saved to Superset. Testing the save itself is designed (on a
  throwaway copy of a dashboard) but not built.
- Scores depend on the config's instructions as much as on the model: see the definitions findings in
  [FAILURES.md](FAILURES.md).
