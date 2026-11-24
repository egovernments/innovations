# Evals: how accurate is the chat?

An accuracy eval of the Lenspack chat in this stack, run against eGov's unified-dev ClickHouse through Superset.
Questions are asked in a campaign manager's words. Each reply is scored against numbers computed independently in
SQL: the right number, the right chart, or an honest "can't". The data is the **synthetic** field test in
`default.su_ni_*`, and every figure here comes from it.

**Headline** (full runs: 68 questions in T1–T8, Claude 5.5 models, 3 repeats; the 9 T9 definition questions came later and ran on Haiku, 26/27, as did the 3 T10 heatmap questions, 9/9, and the 3 T11 map questions, 9/9; details in [RESULTS.md](RESULTS.md)):

| | Haiku | Sonnet | Opus |
|---|---|---|---|
| pass, pre-rebase pack | 84% | 87% | 85% |
| pass, pack on eGov's `su_ni_*` views | 89% | 91% | 91% |
| pass, same pack with definitions in the instructions (v2) | 95% | — | — |
| confidently wrong, after the hand check | 0 | 0 | 0 |
| $ per right answer | 0.0016 | 0.020 | 0.038 |

- **What separates the models** is multi-step arithmetic: Haiku won't always divide two totals it already has.
- **What separates the configs** is whether the instructions name the definitions. No model says which definition
  it used unless the config tells it to.
- **Moves are scored strictly:** since 2026-11-23 the scorer marks a right board with collateral changes (other charts
  resized) as partial and a silent edit as wrong. The move questions are T7.13–T7.14, in English and Hindi.
- Bugs found along the way, all fixed, are written up in [FAILURES.md](FAILURES.md).
- **This data is clean and synthetic**, so treat the scores as a ceiling.
- **Speech-to-text** is evaluated separately ([speech/SPEECH.md](speech/SPEECH.md)): Voxtral Mini Transcribe is the mic's
  default (6.4 / 9.1 / 3.5 / 8.2% WER on Central African French, Niger French, FLEURS French and Hindi; 0.67 s), with
  Gemini 3.5 Transcribe as the Hindi alternative.

## Files

| File | What |
|---|---|
| [DESIGN.md](DESIGN.md) | what's measured, how truth is computed, how replies are scored, the harness, limits |
| [QUESTIONS.md](QUESTIONS.md) | every question by tier, with its truth and accepted alternatives |
| [DEFINITIONS.md](DEFINITIONS.md) · [`definitions.yaml`](definitions.yaml) | the definitions register: terms with more than one reading, each reading's value, what the config says, the open question for eGov |
| [RESULTS.md](RESULTS.md) | every run with its timestamp, config, models, cost, outcomes and model × tier table |
| [FAILURES.md](FAILURES.md) | each kind of failure with sample model output, cause and fix, plus every result reclassified after the hand check |
| [speech/SPEECH.md](speech/SPEECH.md) | the speech-to-text evaluation behind the mic's default model: 11 models on accented French and Hindi, with and without the language hint, every clip's transcript and WER, failures, the decision, the scripts to rerun |
| `results/` | one page per run |
| `suite/suite.yaml` | the questions, with truth SQL, accepted measures, alternatives and disclosure words |
| `suite/make_post_suite.py` | `suite.yaml` → `suite-post.yaml` / `suite-post-v2.yaml` for the rebased pack |
| `suite/truth.py` | computes `truth/*.json` straight from ClickHouse, read-only, with a data fingerprint |
| `suite/summarize.py` | the per-run summary pages |
| `configs/` | the three Lenspack configs the runs used, frozen, and the board each question starts from |

## Running it

The runner is generic and lives in Lenspack (`pnpm eval:suite`, `evals/` on branch `evals/suite`). Against this stack:

```sh
CHP=<reader password> python3 suite/truth.py --suite suite-post-v2.yaml      # truth, or --check for drift
pnpm eval:suite --suite <this folder>/suite/suite-post-v2.yaml --truth <this folder>/truth/truth-post-v2.json \
  --superset-url <superset> --board-cache <this folder>/configs/board-seed-post-rebase-v2.json \
  --models claude-haiku-5-5 --judge claude-sonnet-5-5 --repeats 3 --max-usd 1 [--only T9.1,T9.2] [--tiers T1,T2]
pnpm eval:suite ... --rescore results/<run>.json     # rescore a stored run offline, no model calls
```

The pre-rebase pack can't answer T9 (it has no access, team or settlement-type fields) or T10 (no `day_label`), so run
the pre-rebase suite with `--tiers T1,T2,T3,T4,T5,T6,T7,T8`. T10 needs a Lenspack with the heatmap chart, T11 one with
maps (271df6e or later) and a runner whose scorer counts a points query's `size` and `color` as its measure and
dimension.
