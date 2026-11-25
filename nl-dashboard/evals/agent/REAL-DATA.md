# Haiku, Sonnet or Opus on real campaign data

**In short.** The same three models, asked 63 questions about a real (de-identified) malaria campaign, with the reviewer
switched on as in production:

- **Accuracy:** Claude Opus 5.5 gets 97% right, Sonnet 5.5 94% and Haiku 5.5 93%.
- **Cost:** a right answer costs about 0.15 US cents with Haiku, 2.6 cents with Sonnet and 4.5 cents with Opus.
- **Recommendation:** Haiku is the default. Opus is worth paying for only where the data has traps a careful reader would catch.
- **Where the wrong numbers came from:** most of them came from Lenspack and the data, the same for every model, not from the models. Each failure is explained below.

Run on 2026-11-25. The figures here are rates, costs and times only. The data is real, so no counts or per-place
figures from it are published, and the question set and its answers stay private.

## What was tested

**The data.** One Nigerian state's 2025 seasonal malaria chemoprevention (SMC) campaign, from DIGIT HCM. It covers:
- five monthly cycles;
- dose records;
- households and members;
- the SPAQ stock ledger from the state store down to community distributors;
- stock reconciliations, staff, referrals, complaints and microplan targets.

The data was masked before loading and run through eGov's analytics pipeline into a lab ClickHouse database that
only the lab can reach. It is read through Superset, as in production: 16 Superset datasets, 78 measures, and a 20-chart dashboard as the starting
board. Lenspack ran as the production build (`main` at the time). Each question ran on its own copy of the board, so
nothing real was changed.

**Real data is messier than the synthetic campaign** behind the [other results](README.md), and several of the
failures below come straight from that:
- **Repeated ward names:** two LGAs can each have a ward with the same name.
- **Each stock transfer is logged twice,** once by the sender and once by the receiver, and the two logs disagree.
- **Stray dates:** a few stock records are dated months after the campaign ended.
- **Coverage over 100%:** the microplan target was set below the number of children actually reached, so coverage
  is over 100% in every ward.
- **Bursts of activity:** stock moves in bursts of a few days per cycle, with long gaps between, so "a daily rate"
  depends on which days are counted.

**The questions.** 63, in three groups.

| Group | Questions | What they ask |
|---|---|---|
| The [earlier question set](QUESTIONS.md), rewritten for this campaign | 30 | totals, breakdowns, a time question, coverage, rankings and thresholds, several-step arithmetic, 7 dashboard edits (add, KPI row, remove, change chart type, rename, a two-turn change, a move), 5 that should get an honest "can't" |
| **New: stock, burn rate and facilities** | 26 | burn rate (average units dispatched per day) state-wide, per LGA and per ward, days of stock left, day-on-day % change, a 7-day rolling average, balances by store and level, lowest and negative balances, received vs dispatched, returns, facility rankings and counts, two burn-rate charts, and three traps: adding up daily stock levels, "stock on hand" for distributors (not recorded), and a burn rate per facility (not possible) |
| **From real use** | 7 counted in the results (4 here, 3 inside the stock group) | questions people asked the chat on our demo dashboards since 2026-11-20 that no test covered: which filters the dashboard has, the top ward in one LGA (asked in Portuguese), the top ward overall (asked in Hindi), "can we not have a day on day average percentage per ward", plus the burn-rate and "burn rate of a facility" questions |

By kind: 45 ask for an answer, 10 for a dashboard edit and 8 should get a "can't". Seven are ambiguous on purpose:
for those, a reply passes with any defensible reading, as long as it says which one it used.

**How it was scored.** Exactly as in the [main eval](DESIGN.md#scoring):
- Truth is SQL we wrote and ran straight against the database, never through Superset or Lenspack.
- Counts must match exactly, and percentages within 0.1 points.
- Edits are checked by comparing the board before and after.
- Every answer marked as a wrong number stated as fact, and every failure, was read by a person before it is
  reported here.
- Each model answered each question three times (one question twice, when the budget cap stopped the run).

**Reviewer on.** Production chats run a second pass, the *reviewer*, on any turn that changes the board. By default
the reviewer is the same model. A change it finds misleading gets one *fix round*, and is dropped if it is still
wrong after that. Earlier runs switched it off. This one keeps it on, so the costs below are what a real turn costs.

**One adjustment.** On this dashboard, the datasets' day columns are stored as timestamps, which a Lagos-time pack
can't split into days on Superset. The 11 questions that need days ran with those columns read as calendar dates (an
override in the test harness). The values are the same, and the change is planned for the live dashboard.

## Results

| | Claude Haiku 5.5 | Claude Sonnet 5.5 | Claude Opus 5.5 |
|---|---|---|---|
| **Pass** (right, or an honest "can't") | **93%** | **94%** | **97%** |
| Partly right | 2% | 2% | 0% |
| Wrong numbers stated as fact, caused by the model or the dataset setup (of 188 answers) | 3 | 3 | 0 |
| Wrong numbers stated as fact, caused by a Lenspack or data fault (the same for every model) | 6 | 6 | 6 |
| Cost per question | $0.0014 | $0.024 | $0.044 |
| **Cost per right answer** | **$0.0015** | **$0.026** | **$0.045** |
| Median time to a full reply | 3.3 s | 4.0 s | 5.6 s |
| 95th percentile time | 9.5 s | 12 s | 18 s |

By group (pass rate · cost per right answer):

| Group | Haiku | Sonnet | Opus |
|---|---|---|---|
| Earlier question set, on this campaign | 96% · $0.0015 | 97% · $0.027 | 100% · $0.046 |
| Stock, burn rate and facilities | 88% · $0.0015 | 88% · $0.025 | 92% · $0.045 |
| From real use | 100% · $0.0012 | 100% · $0.033 | 100% · $0.036 |

By kind (pass rate · cost per right answer):

| Kind | Haiku | Sonnet | Opus |
|---|---|---|---|
| Answers | 91% · $0.0011 | 91% · $0.021 | 96% · $0.034 |
| Dashboard edits (reviewer included) | 97% · $0.0031 | 100% · $0.056 | 100% · $0.092 |
| Should say "can't" | 100% · $0.0012 | 100% · $0.017 | 100% · $0.049 |

The Portuguese and Hindi questions passed every time on all three models.

**Compared with the synthetic campaign.** There, Sonnet and Opus scored a little above Haiku and close to each other.
On real data the order is clearer: Opus is the only model that caught the repeated-ward-name trap
and said which side of a two-sided stock log it used. Haiku and Sonnet stay level with each other.

## What the reviewer and the fix round add

- **How often it runs:** on 14–17% of turns, the ones that change the board or ask to show or add something. Plain
  questions are not reviewed.
- **Cost:** on a reviewed turn, the review costs about 80% of what building the answer cost, so the turn costs about
  1.8 times as much. Across all turns that is 14–16% of the total.
- **Time:** it adds about 2.5 seconds to a reviewed turn, at the median.
- **Fix rounds:** they were rare, 4 of about 86 reviewed turns (2 on Haiku, 2 on Sonnet, 0 on Opus). Each roughly
  doubles that turn's cost, which comes to about 1% of the total.
- **What it changed:**
  - It turned one wrong Haiku layout into a right one.
  - It removed a substitute chart that Sonnet had added in place of one the board can't hold. That was arguably
    right, but it made the reply contradict itself (see below).
  - On Opus, it found only minor issues, which the reply then mentioned (for example "the chart was also widened,
    which you didn't ask for").

## Which model for what

- **Haiku 5.5 as the default.** It matches Sonnet's accuracy, is fastest, and costs 1/17 of Sonnet and 1/30 of Opus
  per right answer. Its misses here: the repeated-ward-name trap (as Sonnet), not saying which stock log it read, and
  one dashboard-row layout.
- **Sonnet 5.5 has no clear role on this evidence.** It is no more accurate than Haiku on answers. On edits it was
  right on all 30 tries against Haiku's 29, and that one-try gap doesn't justify 17 times the cost.
- **Opus 5.5 where the data is messy and the stakes are high.** It is the only model with no wrong figures of its own,
  and the only one that noticed the repeated ward names and said which stock log it used. At 4.5 cents per right
  answer it suits two places:
  - the *fix round* (Lenspack's escalation model), which is rare and so cheap overall;
  - deployments where analysts ask hard reconciliation questions.
- **Keep the reviewer on.** It costs about 15% overall, and its one material catch on Haiku turned a wrong board
  into a right one. Using a stronger model as the reviewer of a Haiku builder hasn't been measured yet.

## Why answers failed

### 1. Two wards with the same name were counted as one (dataset setup)

*Asked:* which wards are below 105% coverage against the microplan.

- **What happened:**
  - Haiku and Sonnet listed one ward too few, every time, and stated the shorter count as fact.
  - Two LGAs each have a ward with the same name. The ward dimension groups by name, so the two were merged. The
    one below the threshold was averaged with the other, which is above it.
  - Sonnet even noticed the duplicate names once, then wrongly concluded neither was below.
  - Opus listed the right wards every time, naming the LGA of the duplicated one.
- **Cause:** the dataset setup. A ward needs a label that is unique within the state (for example "Name (LGA)"), or
  a code the chat can group by.

### 2. A burn rate averaged over the wrong span of days (Lenspack and the data)

*Asked:* the state-wide burn rate (average units dispatched per day from health facilities), and days of stock left
per LGA.

- **What happened:**
  - All three models gave the figure Lenspack computed, about three times lower than any sensible reading.
  - Lenspack averages "per day" from the first to the last day the dataset has any record, counting days with
    nothing as zero.
  - A few state-store records are dated months after the campaign, so the span ran to almost a year, although health
    facilities only dispatched during a four-month window.
  - "Days of stock left" divides by that rate, so it came out about three times too long.
  - One Opus reply named the span. The others said only "over all days".
- **Not affected:**
  - the same question for one LGA, which has no stray records;
  - the 7-day rolling average, the day-on-day change and the per-ward ranking. These were right for every model.
- **Cause:** Lenspack, with the data. The span should end where the measure itself ends, never after today, and the
  reply should state it. Reported to the Lenspack team.

### 3. A burn-rate chart per ward can't be saved on a Superset dashboard (Lenspack)

*Asked:* add a bar chart of burn rate per ward, and (from real use) "can we not have a day on day average
percentage per ward".

- **What happened:**
  - Every model worked out the figures, but the board refused the chart.
  - Superset's pivot table averages only the days that have records, and Lenspack counts empty days as zero, so the
    two would disagree.
  - Superset also can't take a day-on-day change before averaging it.
  - All models said so plainly, gave the figures in the reply and offered the nearest chart Superset can draw. These
    count as honest "can't" answers.
- **Cause:** Lenspack, on Superset. These are exactly the charts people asked for in real use, so this is the most
  visible gap. Reported to the Lenspack team.

### 4. A stock figure from one side of a two-sided log, without saying which (the data; the model's disclosure)

*Asked:* how many units distributors returned to health facilities.

- **What happened:**
  - Each return is logged by the distributor and again by the health facility, and here the facilities logged
    several times more than the distributors did.
  - Haiku and Sonnet gave the distributors' figure without saying whose records it came from. That figure is right,
    but a reader can't tell a much larger one exists. Scored partly right.
  - Opus said "the distributor-level figure" every time.
- **Cause:** the data, made worse by the model not saying which log it used. A dataset note telling the chat to name
  the side would help every model.

### 5. "Three tiles across the top" became four quarter-width tiles (Haiku)

- **What happened:**
  - On one of three tries, Haiku added three KPI tiles to the top row but left an existing tile in the same row, so
    there were four quarter-width tiles.
  - The reviewer sent it back, and the fix round didn't fully undo it.
  - On another try, the reviewer's fix round put it right.
- **Cause:** the model's layout reasoning.

### 6. A reply that contradicts itself after a fix round (Lenspack)

- **What happened:**
  - When the reviewer sends a turn back, the reader sees the first round's words ("I added a chart…") and then the
    fix round's ("I removed the chart I added…").
  - The board ends up right, but the reply reads as two answers.
- **Cause:** Lenspack, which shows the first round's text before the review is done. Reported to the Lenspack team.

### 7. "Current" balance when records exist after today (the data; accepted)

*Asked:* the current balance at each level.

- **What happened:** the test's "today" is just after the campaign, and the stray later records change the state
  store's balance. Some replies read the level at the end of today, and others the balance over all records.
- **How it was scored:** both are right, and each reply gave its date, so both pass.

### 8. Scoring fixes

The first scoring pass marked some right answers wrong. It did not recognise these ways of writing numbers:
- Portuguese and French thousands ("12.345", "12 345");
- Indian digit grouping ("1,23,456");
- a fall written in words ("fell 12%", "8% below");
- a sentence starting "One store…";
- a facility named in one sentence and its figure in the next;
- a day written as month and day without the year ("07-14").

The scorer now reads all of them (`evals/` on Lenspack's `main`). Every result above is from the corrected scorer
plus the person's read.

## What it cost

$13.69 for the whole eval, including a $0.51 pilot and the judge that labels "can't" answers. Of that, $0.26 was
Haiku, $4.61 Sonnet and $8.22 Opus.

## Re-running

The runner is Lenspack's `pnpm eval:suite` (`--review` turns the production reviewer on). The question set, truth and
starting board for this campaign stay private, because the data is real. To run the same kind of test on your own
data, write a suite in the [format of ours](suite/) against your own Superset datasets. See
[DESIGN.md](DESIGN.md) for how to compute truth.
