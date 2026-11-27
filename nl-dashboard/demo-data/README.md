# HCM data for the demo stack

Ours, specific to HCM: how HCM campaign data gets into Superset so the chat has something to read.

| Path | What it is |
|---|---|
| [`setup/setup.mts`](setup/setup.mts) | One-off: data sources in Superset (sample Postgres and/or ClickHouse), datasets with metrics and descriptions, and a starter dashboard for each. Run as the `setup` service in [`../deploy/docker-compose.yml`](../deploy/docker-compose.yml) or as [`../deploy/k8s/setup-job.yaml`](../deploy/k8s/setup-job.yaml) |
| [`sample-data/`](sample-data/) | Loads three HCM indices (tasks, households, stock) from Elasticsearch into Postgres, with no IDs or coordinates |

`setup.mts` runs inside the Lenspack image and uses its Superset API client
([`client.ts`](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/packages/hosts/superset/src/client.ts)
at the pinned version), so it needs no install of its own. How the ClickHouse tables it reads are built from HCM's
records: [`../docs/ANALYTICS-PIPELINE.md`](../docs/ANALYTICS-PIPELINE.md). The datasets and dashboards it makes are
described in the [main README](../README.md#data).
