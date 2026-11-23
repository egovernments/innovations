# Ask your dashboard: Superset + Lenspack

*Use case 3.1, Natural-Language Dashboard / Query Assistant. eGov AI & Innovation Lab, November 2026.*

## The problem

Campaign managers need answers today's dashboards weren't built for: which wards are behind, which teams waste the
most vials. Each new view waits for an analyst to write SQL and build a chart, which during a campaign can take days.

## What it does

An **Ask Lenspack** button sits on every Superset dashboard. People type or speak a request in English, French or
Hindi:
- *"Show zero-dose share by LGA"*;
- *"Put the coverage trend under the KPIs"*;
- *"Which settlements are below 80 %?"*

The answer comes back in seconds, as a sentence and, when asked, as an ordinary Superset chart placed on the dashboard.
"Undo that" restores the previous version.

- **Every number comes from Superset's own datasets and saved metrics,** so the chat and the charts never disagree.
- **Where a measure has more than one reading,** the reply says which definition it used.
- **What the chat builds is ordinary Superset,** and stays usable with Lenspack switched off.

## How it fits eGov's stack

- **Superset isn't forked.** The stock Apache Superset 5 image plus one Python file and one small container.
- **Access is Superset's.** Anyone who can view a dashboard can ask about it. Only people Superset lets edit it can
  change it. Settings are for admins.
- **Every change and refusal is logged** with the Superset user, and kept for 90 days.
- **It reads eGov's own analytics views** (ClickHouse) through Superset, and deploys with Compose, Kubernetes or Helm.

## Evidence

We ran 68 questions, from totals and breakdowns to multi-step arithmetic, dashboard edits and requests it should
decline, three times each on synthetic campaign data in eGov's unified-dev ClickHouse.

| Model | Pass rate | Cost per right answer | Typical reply time |
|---|---|---|---|
| Claude Haiku 5.5, tuned config | **95 %** | **$0.0016** | under 5 s |
| Claude Sonnet 5.5 | 91 % | $0.020 | about 5 s |
| Claude Opus 5.5 | 92 % | $0.038 | about 7 s |

Sonnet and Opus ran on the config before tuning, on which Haiku scored 89 %.

- **No confidently wrong answers** in the full runs after hand checking; misses were partial answers or wrong refusals.
- **The gains came from configuration,** not code: naming each ambiguous measure's definition.
- **A thousand questions on Haiku cost under $2.**

The method, every run and each failure analysis are in [`evals/`](../evals/).

## Where it stands

- **Running now** on eGov's HCM lab VM over HTTPS, against unified-dev data, with voice input.
- **Open source:** [Lenspack](https://github.com/theflywheel/lenspack) and this deployment
  ([innovations#3](https://github.com/egovernments/innovations/pull/3)).
- **Known limits:** row-level security doesn't yet follow the person asking (chart data runs as one service account);
  seven chart types are editable (KPI, pie, line, area, bar, table, heatmap), and maps and others can be moved but not changed.

## Next steps

1. **Pilot with one campaign team** on real (masked) data, measuring time from question to answer.
2. **Per-user row-level security**, so each person sees only their own geography.
3. **A map widget** for facility-level views.
4. **Build the vocabulary from Superset alone**, so a new deployment needs no hand-written configuration.

Technical detail: [ARCHITECTURE.md](ARCHITECTURE.md).
