# Design: the pack from Superset alone

**Status: design, not built.** The *pack* is Lenspack's vocabulary: the measures, dimensions and guidance the model
works with. Today it has two parts. Lenspack derives the measures and dimensions from Superset's
datasets: saved metrics, groupable columns, descriptions. Everything else comes from the `overlay` in
`lenspack-superset.yaml`: which datasets, entity names, hierarchies, hints, instructions and examples. That file is the
last piece of Lenspack configuration a Superset admin has to edit by hand and mount. This page proposes where each part
would live in Superset, and what the change means for the evals.

## Where each part would live

| Today (`lenspack-superset.yaml`) | Proposed home in Superset | Edited by | Why there |
|---|---|---|---|
| `datasets:` list | A Superset **tag**, `lenspack`, on each dataset (the `TAGGING_SYSTEM` feature flag, off by default in Superset 5.0 and 6.1) | Dataset owners, in the dataset list | The list moves with the datasets; adding one is a click. |
| `overlay.entities` (entity name per dataset) | Dataset **`extra`** JSON: `{"lenspack": {"entity": "coverage"}}` | Dataset owners (Edit dataset → Settings → Extra) | `extra` is free-form, is exported and imported with the dataset, and Superset ignores keys it doesn't know. |
| `overlay.hierarchies` | Same dataset `extra`: `{"lenspack": {"hierarchy": ["state", "lga", "ward"]}}` | Dataset owners | A hierarchy is an ordered list of that dataset's columns. A conformed one is the same list on several datasets. |
| `overlay.hints`, `labels` | Already Superset's: column and metric **descriptions** and **verbose names** | Dataset owners | Lenspack reads them today. The overlay only covers gaps, so the gaps get filled in Superset. |
| `overlay.instructions` (one text, at most 2,000 characters) | The **AI assistant** page: a text box saved in Lenspack's `settings.json`, like the chat model | Superset admins | It describes the whole deployment and changes often during tuning. Admin-only, audited (`settings instructions`), with no restart. |
| Per-dashboard guidance (new) | Dashboard **`json_metadata`**: `{"lenspack_instructions": "…"}`, added to the global text for that board | Dashboard owners | Lets a board's owner say "tiles here are per LGA" without touching the deployment. |
| `overlay.examples` (starter questions) | The AI assistant page, next to the instructions | Superset admins | Same lifecycle as the instructions. |
| `pack`, `description`, `timeZone`, `budget`, `panel` | Lenspack environment variables, or the AI assistant page | Whoever deploys Lenspack | These are deployment settings, not catalogue. |

**Reloading.** Today the pack is read once, at start. With these sources, Lenspack would re-read it:
- when an admin presses **Reload catalogue** on the AI assistant page;
- every 10 minutes, but only if a tagged dataset's `changed_on` has moved.

The pack's hash would go into every `chat-turn` audit event, so a change in the model's answers can be traced to a
change in the catalogue.

**The YAML stays as an override.** If the YAML file is mounted, its fields win over Superset's. That keeps today's
deployments and every eval config working unchanged. A one-off `lenspack export-overlay` would write an existing
overlay into the tags, `extra` fields and settings above, and then the file can be dropped.

## What it does to the evals

- **The pack must be frozen per run.** The eval configs (the Lenspack repository's `evals/suites/hcm/configs/*.yaml`) pin the pack by pinning its YAML.
  Once the pack comes from Superset, a run must record what it ran against. The harness would fetch the derived pack
  (`GET /api/<pack>/pack` already returns it as YAML), store it with the results, and put its hash in the report.
  Comparing two runs means first comparing their pack hashes.
- **The questions and expected answers don't change.** They live in the Lenspack repository's
  `evals/suites/hcm/*.yaml` and `*.truth.json`, and depend on the data and the measures, not on where the measure definitions are stored.
- **Instructions change scores.** The heatmap instruction is one example: the heatmap questions depend on it. So
  moving the instructions onto a page anyone with admin rights can edit means an unreviewed edit can move the scores. Two
  mitigations, both cheap:
  - the audit log records each instructions change, with who made it and the old and new text;
  - the harness can run against an exported pack instead of the live one (`--pack exported.yaml`), so evals stay
    reproducible whatever is edited in Superset.
- **The 2,000-character limit on the instructions** stays. The page would show the count, since today's ClickHouse
  config already uses 1,918 characters.
- **Check the switch once.** After `export-overlay`, build the pack from Superset and check that it is byte-identical
  to the one built from the YAML. The comparison is mechanical, so no model calls are needed. Any difference is a bug
  in the export, not a model change.

## Not covered

- Row-level security rules beyond simple ones. With `hostPolicy: superset`, a rule Lenspack can't apply hides its dataset from that person.
- Packs that span several Superset instances.
- Letting non-admins edit the instructions.
