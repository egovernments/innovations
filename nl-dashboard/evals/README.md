# Evaluations

We test two parts of the Superset + Lenspack stack: the chat agent that answers questions and edits dashboards, and
the speech-to-text model behind the chat's microphone. Both tests use data that is safe to publish.

| What | Question it answers | Headline | Details |
|---|---|---|---|
| **The chat agent** | Does Lenspack answer questions about campaign data correctly, and edit dashboards the way it was asked? | Claude Haiku 5.5: 95% right on the 68 core questions, $0.0015 per right answer, no wrong figure stated as fact on them | [agent/](agent/README.md) |
| **Speech to text for the mic** | Which model turns a spoken question into the right text in French, Hindi and Portuguese? | Mistral Voxtral Mini Transcribe 3.0 is the default: 2.3–9.1% of words wrong, 0.67 s per request, $0.0032 per audio minute (speed and cost measured on the French and Hindi clips) | [speech/](speech/README.md) |

## The chat agent

**What is tested.** 85 questions asked the way a campaign manager would ask them. Each gets one chat turn on a copy of
a real Superset dashboard, and the reply (and the dashboard afterwards) is scored: the right number or chart, an
honest "can't" when the data can't answer, and above all no wrong figure stated as fact.

**The questions.**

| Kind | Questions |
|---|---|
| Answers: a number, list or series (totals, filters, time series, coverage, rankings, cross-entity) | 43 |
| Questions that depend on which definition is used, on purpose | 9 |
| Charts and dashboard edits | 13 |
| Moving a chart into a full row (one in English, one in Hindi) | 2 |
| Heatmaps and maps: create one, read it, change it | 6 |
| Should say "can't" (the data or Lenspack can't answer) | 12 |

The 68 *core questions* ran on all three models; the other 17 were added later and ran on Haiku only. Full list:
[agent/QUESTIONS.md](agent/QUESTIONS.md).

**The data.** A synthetic 7-day polio vaccination campaign: 50,000 child visits in three local government areas
(LGAs, the district level below a Nigerian state) of Kebbi, Nigeria. It is loaded in eGov's development ClickHouse
database as eGov's ready-made Superset views, and read through Superset as in production. No real campaign data. Three Lenspack configurations were compared: our own joins over eGov's analytics
tables (*own joins*), eGov's views as they are (*eGov views*), and eGov's views with each ambiguous definition written
into the instructions (*eGov views + definitions*).

**Languages.** English 84 questions, Hindi 1, French 0, Portuguese 0. The panel works in all four; the question set
doesn't cover French or Portuguese yet.

**Examples.**

| Question | What counts as right |
|---|---|
| How many children were vaccinated? | 47,798 (with revisits) or 47,585 (visits marked VACCINATED), saying which. The bare number is partial. |
| Which wards are below 90% children coverage? | Exactly Ambursa, Masama and Nassarawa I. |
| Add a bar chart of children coverage by ward, lowest first. | That chart is added, its data matches the SQL, and nothing else on the dashboard changes. |
| वार्ड वाला बार ग्राफ भी ऊपर LGA वाले बार ग्राफ के साथ रख दो ना (put the ward bar chart up beside the LGA one) | The chart ends on that row with nothing overlapping, and the reply says what moved. |
| How does this week compare with last week? | Both weeks are empty (the campaign ended in October), and the reply says so. Any figure is wrong. |

**How it is scored.** Truth is hand-written SQL run straight against ClickHouse, checked by a second author. Numbers
in the reply must match it (counts exactly, percentages within 0.1 points). Dashboard edits are checked by comparing
the dashboard before and after. An ambiguous term passes with any listed definition if the reply says which. An edit
with no reply is wrong, and a right dashboard with unrequested changes is partial. Every answer scored as a wrong
figure stated as fact is read by a person before it is reported. [Scoring rules](agent/DESIGN.md#scoring).

**Results.** The 68 core questions, 3 tries each. Cells: pass rate · cost per right answer.

| Model | Own joins | eGov views | eGov views + definitions |
|---|---|---|---|
| Claude Haiku 5.5 | 84% · $0.0017 | 89% · $0.0016 | 95% · $0.0015 |
| Claude Sonnet 5.5 | 87% · $0.023 | 91% · $0.020 | |
| Claude Opus 5.5 | 85% · $0.046 | 91% · $0.038 | |
| Run | [full run 1](agent/runs/2026-11-22T17-26-23.md) | [full run 2](agent/runs/2026-11-22T18-07-48.md) | [Haiku run](agent/runs/2026-11-22T18-53-20.md) + [rerun of 2 questions](agent/runs/2026-11-22T18-57-26.md) |

Sonnet and Opus were not run with definitions, so those cells are blank. After the hand check, no model stated a
wrong figure as fact on the core questions. Questions added later (Haiku, *eGov views + definitions*): definitions
26/27, heatmaps 9/9, maps 9/9, moving a chart 5/6. In the definitions group the hand check found one wrong figure
stated as fact that the scorer had marked partial: 50 field workers instead of 45
([details](agent/FAILURES.md#10-results-reclassified-after-the-hand-check)).

| Language | Questions | Claude Haiku 5.5 | Claude Sonnet 5.5 | Claude Opus 5.5 |
|---|---|---|---|---|
| English | 84 | 95% of the core questions (with definitions) | 91% | 91% |
| Hindi | 1 | 2/3 ([run](agent/runs/2026-11-23T07-37-21.md); the same request in English: 3/3) | | |
| French | 0 | | | |
| Portuguese | 0 | | | |

What the results show: the configuration matters more than the model (no model says which definition it used unless
the instructions name it); Haiku sometimes stops short of arithmetic over several steps; and the dashboard-edit
questions found Lenspack layout bugs, now fixed. Details: [agent/RESULTS.md](agent/RESULTS.md),
[agent/FAILURES.md](agent/FAILURES.md).

**On a real campaign.** 63 questions on a real, masked malaria campaign (stock ledger, burn rate, facilities, and
questions from real use), with the production reviewer on: Opus 5.5 97% right, Sonnet 5.5 94%, Haiku 5.5 93%, at about
4.5, 2.6 and 0.15 US cents per right answer. Haiku stays the default. Most wrong figures came from Lenspack or the data
and hit every model alike. Details, the reviewer's cost and each failure:
[agent/REAL-DATA.md](agent/REAL-DATA.md).

## Speech to text

**What is tested.** 11 speech-to-text models on 315 clips of read speech from public datasets (about 31 minutes).
Each model ran twice: once told the clip's language (the *hint*) and once not told, because the chat panel's Auto
language setting sends no hint.

**The data.**

| Set | Language and accent | Source | Licence | Clips | Minutes |
|---|---|---|---|---|---|
| Central Africa | French: Gabon, Cameroon, Chad, Congo | [OpenSLR SLR57](https://www.openslr.org/57/) African Accented French: everyday sentences read in Central Africa | Apache 2.0 | 80 | 3.5 |
| Niger | French, West African | SLR57, Niger recordings | Apache 2.0 | 80 | 4.6 |
| FLEURS fr | French, France | [Google FLEURS](https://huggingface.co/datasets/google/fleurs): the same formal sentences read in 102 languages | CC BY 4.0 | 25 | 4.7 |
| FLEURS hi | Hindi, India | FLEURS | CC BY 4.0 | 25 | 5.3 |
| CV Brazil | Portuguese, Brazil | [Mozilla Common Voice](https://commonvoice.mozilla.org/) 22.0: short crowd-sourced prompts, speakers name their accent | CC0 1.0 | 40 | 3.5 |
| CV Portugal | Portuguese, Portugal | Common Voice 22.0 | CC0 1.0 | 40 | 3.4 |
| FLEURS pt | Portuguese, Brazil | FLEURS | CC BY 4.0 | 25 | 5.7 |

**Example reference sentences** (quoted from the datasets; glosses ours):
- French, Chad: « Y a-t-il une autre route pour se rendre à l’hôpital? » (SLR57, Apache 2.0)
- French, Niger: « vous ne pouvez pas conduire votre véhicule ou marcher dans cette direction » (SLR57, Apache 2.0)
- French, France: « Le chocolat chaud est conforme aux normes belges. » (FLEURS, Conneau et al. 2022, CC BY 4.0)
- Hindi: « टेलीविजन रिपोर्टों में प्लांट से निकलने वाला सफेद धुआँ दिखाया गया है। » (television reports show white smoke coming from the plant; FLEURS, CC BY 4.0)
- Hindi: « कैल्शियम और पोटैशियम जैसे तत्वों को धातु माना जाता है। » (elements such as calcium and potassium are counted as metals; FLEURS, CC BY 4.0)
- Portuguese, Brazil: « A sustentabilidade é uma parte central de nossa missão. » (Common Voice, CC0)
- Portuguese, Portugal: « Uma mulher com uma bolsa branca está subindo as escadas. » (Common Voice, CC0)

More, with clip ids: [speech/README.md](speech/README.md#example-sentences).

**Results.** Word error rate (the share of words transcribed wrong; lower is better), with the hint → without it.
The Central Africa set ran with the hint only. Latency (median time per request) and cost per audio minute were
measured on the French and Hindi clips only (210 of the 315), with the hint. Portuguese-only latency and cost are in
[speech/SPEECH.md](speech/SPEECH.md#portuguese); for Voxtral they are 0.49 s and $0.0032.

| Model | Central Africa fr | Niger fr | FLEURS fr | FLEURS hi | CV Brazil pt | CV Portugal pt | FLEURS pt | Latency, fr + hi (s) | $ per audio min, fr + hi |
|---|---|---|---|---|---|---|---|---|---|
| AssemblyAI Universal-3.6 Pro | 6.6% | 8.5 → 13.9% | 3.9 → 4.1% | 9.4 → 9.3% | 8.9 → 9.8% | 14.1 → 22.6% | 2.7 → 2.7% | 0.37 | 0.0050 |
| Deepgram Nova-3 | 5.1% | 8.6 → 97.1% | 7.5 → 96.0% | 14.0 → 100.3% | 3.0 → 95.7% | 6.0 → 93.6% | 7.2 → 99.8% | 0.65 | 0.0043 |
| ElevenLabs Scribe v2 | 7.5% | 8.6 → 9.4% | 3.0 → 3.3% | 11.7 → 11.6% | 9.8 → 10.6% | 6.8 → 9.4% | 3.5 → 3.6% | 0.75 | 0.0037 |
| Google Chirp 3 | 6.4% | 9.6 → 9.7% | 3.9 → 4.3% | 7.8 → 7.2% | 10.2 → 10.6% | 11.1 → 11.1% | 2.3 → 2.4% | 1.91 | 0.0173 |
| Google Gemini 3.5 Transcribe | 7.7% | 8.6 → 10.3% | 3.4 → 3.0% | 7.4 → 6.9% | 9.8 → 17.9% | 12.0 → 15.0% | 2.9 → 3.8% | 2.31 | 0.0053 |
| **Mistral Voxtral Mini Transcribe 3.0** | **6.4%** | **9.1 → 9.6%** | **3.5 → 3.3%** | **8.2 → 8.0%** | **7.7 → 8.1%** | **6.0 → 7.3%** | **2.3 → 2.3%** | **0.67** | **0.0032** |
| NVIDIA Nemotron 3.5 ASR 0.6B | 7.5% | 11.1 → 11.9% | 12.1 → 11.7% | 13.3 → 15.3% | 20.9 → 22.1% | 21.8 → 28.6% | 8.9 → 8.6% | 1.33 | 0.0002 |
| OpenAI GPT-4o mini Transcribe | 10.3% | 14.6 → 16.2% | 4.2 → 4.6% | 13.6 → 11.9% | 13.2 → 15.3% | 13.7 → 13.2% | 3.9 → 3.5% | 0.85 | 0.0018 |
| OpenAI GPT Transcribe | 5.5% | 8.2 → 10.3% | 3.7 → 4.1% | 10.4 → 10.1% | 7.7 → 12.3% | 10.7 → 13.7% | 3.2 → 2.7% | 0.84 | 0.0049 |
| OpenAI Whisper large-v3 turbo | 9.2% | 13.9 → 17.4% | 7.9 → 16.4% | 61.9 → 75.0% | 22.6 → 21.3% | 17.9 → 24.8% | 4.2 → 3.9% | 1.41 | 0.0003 |
| Qwen3-ASR 1.7B | 4.0% | 8.6 → 8.9% | 4.2 → 4.3% | 13.7 → 13.0% | 14.0 → 15.3% | 16.2 → 20.1% | 4.1 → 3.8% | 0.80 | 0.0004 |

**The pick: Voxtral,** the default. It is in the top group on every set, barely changes without the hint (Auto sends
none), is among the three fastest, and is the cheapest of the four models under 10% on Hindi. Alternatives an admin
can choose: Gemini 3.5 Transcribe for the best Hindi (but 2.3 s), Deepgram Nova-3 where everyone picks Portuguese in
the menu (it fails without a hint).

**Known gaps.** No labelled Mozambican or Angolan speakers exist in any open set we found, so African Portuguese is
untested (European Portuguese stands in). All clips are clean read speech: real voice notes, with noise, place names
and numbers, will score worse, and none are scored yet. The deployed mic path has not been tested with a real
provider key. Details: [speech/README.md](speech/README.md), full report [speech/SPEECH.md](speech/SPEECH.md).

## Re-running

**Chat agent** (from `agent/`; the runner is `pnpm eval:suite` on the `evals/suite` branch of the Lenspack
repository). The `*-post-v2*` files are the question set, truth and starting dashboard for the *eGov views +
definitions* configuration:

```sh
CHP=<read-only ClickHouse password> python3 suite/truth.py --suite suite-post-v2.yaml --check   # is the data unchanged?
pnpm eval:suite --suite <agent>/suite/suite-post-v2.yaml --truth <agent>/truth/truth-post-v2.json \
  --superset-url <superset> --board-cache <agent>/configs/board-seed-post-rebase-v2.json \
  --models claude-haiku-5-5 --judge claude-sonnet-5-5 --repeats 3 --max-usd 1
```

**Speech to text** (from `speech/`, OpenRouter key from a secret store):

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -I fetch_audio.py
OPENROUTER_API_KEY=... .venv/bin/python -I stt_bench.py data/manifest.jsonl --systems or:mistralai/voxtral-mini-transcribe-3-0 [--nohint]
.venv/bin/python -I score.py && .venv/bin/python -I fetch_audio.py --delete
```

## Layout

```
evals/
  README.md          this page
  agent/             the chat agent eval: README, QUESTIONS, DESIGN, DEFINITIONS, RESULTS, FAILURES
    suite/  truth/  configs/  runs/
  speech/            the speech-to-text eval: README (summary), SPEECH.md (full report)
    data/  results/  and the scripts
```
