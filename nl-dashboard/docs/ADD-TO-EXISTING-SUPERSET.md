# Add Lenspack to an existing Superset

This adds the Lenspack chat to a running Superset 6.1 (5.0 also works; 6.0 untested) on the stock `apache/superset` image: an **Ask Lenspack** button on
dashboards and an **AI assistant** admin page. You add two things:
- one Python file, imported from `superset_config.py`;
- a Lenspack container next to Superset.

Superset serves the chat itself at `/lenspack/`, to signed-in users only, so your proxy or ingress doesn't change.
Lenspack creates its own Superset account the first time it starts.
Detail, options and troubleshooting are in the [reference](ADD-TO-EXISTING-SUPERSET-REFERENCE.md).

Compose was tested by following these steps literally on `apache/superset:5.0.0`; Lenspack's Superset side is tested on `apache/superset:6.1.0` and `5.0.0`. The Helm values were rendered with charts 0.15.5 (Superset 5.0) and 0.22.8 (Superset 6.1) but not installed.

## Prerequisites

- Superset 6.1 or 5.0 that already reads your data. For ClickHouse that means the `clickhouse-connect` driver, 0.13 or later ([adding it](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#the-clickhouse-driver)).
- The password of a Superset admin, used once on Lenspack's first start.
- The image `ghcr.io/theflywheel/lenspack:bfbad69` (public; the tag is a commit of Lenspack's `main`).
- An Anthropic API key.

## Get the files

```sh
# Superset's side comes from the Lenspack repository, at the same commit as the image.
LENSPACK=https://raw.githubusercontent.com/theflywheel/lenspack/bfbad6918b9070ed9c5206681065ede17fd910b2
BASE=https://raw.githubusercontent.com/egovernments/innovations/nl-dashboard/superset-lenspack/nl-dashboard
mkdir -p lenspack
curl -fsSL -o lenspack/lenspack_superset.py   $LENSPACK/packages/hosts/superset/plugin/lenspack_superset.py
curl -fsSL -o lenspack/lenspack-superset.yaml $BASE/deploy/lenspack/lenspack-superset.clickhouse.yaml
curl -fsSL -o lenspack/setup.mts              $BASE/demo-data/setup/setup.mts
```

When you move to a newer Lenspack image, download `lenspack_superset.py` again at that commit.

For your own datasets, edit `lenspack/lenspack-superset.yaml` ([how](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#get-the-files)).

## Docker Compose

The service names `superset` and `lenspack` are examples. There are [notes on every step](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#docker-compose-step-by-step).

**1. At the end of `superset_config.py`** (if you already set `FLASK_APP_MUTATOR`, [chain it](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#1-the-import-line))

```python
from lenspack_superset import *  # noqa: E402,F401,F403
```

**2. Mount the file in the `superset` service**, and in any other service that loads the same config

```yaml
  superset:
    volumes:
      - ./lenspack/lenspack_superset.py:/app/pythonpath/lenspack_superset.py:ro
```

**3. Restart Superset and check that it prints `ok`**

```sh
docker compose up -d superset
docker compose exec superset python -c "import lenspack_superset; print('ok')"
```

**4. Add the Lenspack service**, plus `lenspack-data: {}` under the top-level `volumes:`. Don't start it yet.

```yaml
  lenspack:
    image: ghcr.io/theflywheel/lenspack:bfbad69
    command: ["superset", "--config", "/config/lenspack-superset.yaml"]
    environment:
      LENSPACK_SUPERSET_URL: http://superset:8088           # Superset itself, from inside the Compose network
      SUPERSET_ADMIN_PASSWORD: ${SUPERSET_ADMIN_PASSWORD}    # first start only (user "admin"; else set SUPERSET_ADMIN_USERNAME)
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    volumes:
      - ./lenspack/lenspack-superset.yaml:/config/lenspack-superset.yaml:ro
      - lenspack-data:/data
    restart: unless-stopped
```

**5. Datasets and dashboards** with `setup.mts` (or [import them](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#datasets-and-dashboards))

```sh
CLICKHOUSE_PASSWORD=… docker compose run --rm --no-deps \
  -e CLICKHOUSE_HOST=<host> -e CLICKHOUSE_PORT=8123 -e CLICKHOUSE_USER=<read-only user> -e CLICKHOUSE_PASSWORD \
  -v "$PWD/lenspack/setup.mts:/setup/setup.mts:ro" \
  --entrypoint /app/node_modules/.bin/tsx lenspack --tsconfig /app/tsconfig.base.json /setup/setup.mts
```

**6. Start Lenspack**

```sh
docker compose up -d lenspack
docker compose logs lenspack | grep "lenspack-superset:"
```

The log shows that Lenspack created its account. After that, `SUPERSET_ADMIN_PASSWORD` can come out of the Lenspack
service, because the account's password is kept in `lenspack-data`. If you already have a `lenspack` user that other tools
sign in as, set `LENSPACK_SUPERSET_PASSWORD` to its password instead. Lenspack then uses that account as it is
([optional](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#lenspacks-superset-account)).

**Who sees what.** The sample config sets `hostPolicy: superset`; keep it for any real deployment. Each person's answers
then follow their own Superset dataset permissions and simple row-level security rules. Give everyone who will use the
chat dataset access through their Superset roles first: a user with Superset's Gamma role alone gets a chat with no data
([what each person sees](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#what-each-person-sees)).

Optional: [French labels](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#french-labels), and [who may edit through the chat](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#who-may-do-what).

## Helm (the official chart)

1. Create the ConfigMap: `kubectl -n superset create configmap superset-lenspack --from-file=lenspack/lenspack_superset.py`.
2. Put this in `lenspack-values.yaml`.
3. Upgrade:

```yaml
configOverrides:
  lenspack: |
    from lenspack_superset import *  # noqa: F401,F403
extraEnv:
  PYTHONPATH: /app/pythonpath:/app/lenspack
  LENSPACK_INTERNAL_URL: http://lenspack.superset.svc.cluster.local:8795
extraVolumes:
  - { name: lenspack, configMap: { name: superset-lenspack } }
extraVolumeMounts:
  - { name: lenspack, mountPath: /app/lenspack, readOnly: true }
```

```sh
helm upgrade superset superset/superset -n superset --reuse-values -f lenspack-values.yaml
```

Then add the Lenspack Deployment and the datasets: [Helm steps 3–4](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#helm-the-official-chart).

## Check it works

1. `docker compose logs lenspack | grep "lenspack-superset:"` names the pack and counts its datasets and measures.
2. Signed out, `/lenspack/overlay.js` answers 401.
3. Signed in, every dashboard has **Ask Lenspack** at the bottom right. Try asking: "Don't change the board. What does this dashboard
   show?"
4. Settings → Manage → AI assistant lists the datasets, models, today's usage and the audit log.

If something is off, see [Troubleshooting](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#troubleshooting). The [restart table](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#what-needs-a-restart) lists what each change needs.

## Roll back

1. Remove the import line and the mount, then restart Superset.
2. Remove the Lenspack container and its volume.
3. Optional: delete the `lenspack` user and what `setup.mts` made ([order matters](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#roll-back)).
