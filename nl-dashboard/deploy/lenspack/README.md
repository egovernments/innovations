# Lenspack configs for HCM data

These files are ours. Lenspack itself is not here: the `lenspack` container runs Lenspack's published image,
`ghcr.io/theflywheel/lenspack:<commit>`, pinned in [`../docker-compose.yml`](../docker-compose.yml) and
[`../k8s/kustomization.yaml`](../k8s/kustomization.yaml). Each file tells that image which Superset datasets to read
and how to talk about them (Lenspack calls this vocabulary a *pack*).

| File | For |
|---|---|
| [`lenspack-superset.yaml`](lenspack-superset.yaml) | the sample data (Postgres, from [`../../demo-data/`](../../demo-data/)) |
| [`lenspack-superset.clickhouse.yaml`](lenspack-superset.clickhouse.yaml) | HCM analytics in ClickHouse, over the datasets [`setup.mts`](../../demo-data/setup/setup.mts) creates |

Compose picks one with `LENSPACK_CONFIG` in `.env`; Kubernetes mounts it from a ConfigMap
([`../k8s/README.md`](../k8s/README.md)). Every key is explained in Lenspack's
[config reference](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/docs/reference/config.md),
at the pinned version. What is ours and what is Lenspack's: [where things live](../../README.md#where-things-live).
