# Add Lenspack to an existing Superset 5

This adds the Lenspack chat (an **Ask Lenspack** button on dashboards, and an **AI assistant** admin page) to a running
Superset 5 on the stock `apache/superset` image. You add four things: a Python module imported from
`superset_config.py`, a Lenspack container, a proxy rule for `/lenspack/` that only signed-in Superset users get
through, and a `lenspack` service account. Detail, options and troubleshooting: [reference](ADD-TO-EXISTING-SUPERSET-REFERENCE.md).

Compose was tested step by step on `apache/superset:5.0.0`; the Helm values were rendered with chart 0.15.5, not installed.

## Prerequisites

- Superset 5.0, running as root for the driver install ([if not](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#running-as-root))
- nginx or ingress-nginx in front of Superset
- The image `ghcr.io/theflywheel/lenspack:superset-58a2101` (public)
- An Anthropic API key
- Your data in ClickHouse, reachable from Superset

## Get the files

```sh
REF=nl-dashboard/superset-lenspack
BASE=https://raw.githubusercontent.com/egovernments/innovations/$REF/nl-dashboard
mkdir -p lenspack/superset/templates/lenspack
curl -fsSL -o lenspack/superset/lenspack_superset.py              $BASE/superset/lenspack_superset.py
curl -fsSL -o lenspack/superset/build_translations.py             $BASE/superset/build_translations.py
curl -fsSL -o lenspack/superset/templates/tail_js_custom_extra.html $BASE/superset/templates/tail_js_custom_extra.html
curl -fsSL -o lenspack/superset/templates/lenspack/settings.html  $BASE/superset/templates/lenspack/settings.html
curl -fsSL -o lenspack/lenspack-superset.yaml                     $BASE/lenspack/lenspack-superset.clickhouse.yaml
curl -fsSL -o lenspack/setup.mts                                  $BASE/setup/setup.mts
```

For your own datasets, edit `lenspack/lenspack-superset.yaml` ([how](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#get-the-files)).

## Docker Compose

Service names `superset`, `lenspack` and `proxy` are examples. [Notes on every step](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#docker-compose-step-by-step).

**1. Secrets**

```sh
cat >> .env <<EOF
LENSPACK_SUPERSET_PASSWORD=$(openssl rand -hex 16)
LENSPACK_SETTINGS_TOKEN=$(openssl rand -hex 24)
ANTHROPIC_API_KEY=<your key>
EOF
```

**2. At the end of `superset_config.py`** (already set `FLASK_APP_MUTATOR`? [chain it](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#2-the-import-line))

```python
from lenspack_superset import *  # noqa: E402,F401,F403
```

**3. Add to the `superset` service** and any other service that loads the same config ([own start command?](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#3-the-superset-service))

```yaml
  superset:
    user: root                      # for the driver install below
    command: ["sh", "-c", "uv pip install --no-cache --python /app/.venv/bin/python 'clickhouse-connect>=0.8,<1.0' && exec /usr/bin/run-server.sh"]
    environment:
      PYTHONPATH: /app/pythonpath:/app/lenspack
      LENSPACK_URL: /lenspack                       # where browsers load the overlay
      LENSPACK_INTERNAL_URL: http://lenspack:8795   # where Superset's server reaches Lenspack
      LENSPACK_SETTINGS_TOKEN: ${LENSPACK_SETTINGS_TOKEN}
    volumes:
      - ./lenspack/superset:/app/lenspack:ro
```

**4. Restart Superset and check it prints `ok`**

```sh
docker compose up -d superset
docker compose exec superset python -c "import clickhouse_connect, lenspack_superset; print('ok')"
```

**5. The service account** (Admin role; [read this](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#the-service-account) before production)

```sh
set -a; . ./.env; set +a
docker compose exec superset superset fab create-user --role Admin --username lenspack \
  --firstname Lenspack --lastname Service --email lenspack@example.org --password "$LENSPACK_SUPERSET_PASSWORD"
```

**6. Add the Lenspack service**, plus `lenspack-data: {}` under top-level `volumes:`. Don't start it yet.

```yaml
  lenspack:
    image: ghcr.io/theflywheel/lenspack:superset-58a2101
    environment:
      SUPERSET_URL: http://superset:8088            # Superset itself, not the proxy
      SUPERSET_PUBLIC_URL: https://superset.example.org   # where browsers reach Superset
      LENSPACK_SUPERSET_PASSWORD: ${LENSPACK_SUPERSET_PASSWORD}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      LENSPACK_SETTINGS_TOKEN: ${LENSPACK_SETTINGS_TOKEN}
    volumes:
      - ./lenspack/lenspack-superset.yaml:/config/lenspack-superset.yaml:ro
      - lenspack-data:/data
    restart: unless-stopped
```

**7. The proxy:** add to Superset's nginx `server` block, then `docker compose exec proxy nginx -s reload` ([why each line](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#proxy-cookies-and-security-headers))

```nginx
  resolver 127.0.0.11 valid=10s ipv6=off;          # Docker's DNS: picks up a restarted container's new address

  location /lenspack/ {
    auth_request /_superset_me;                    # only for browsers signed in to Superset
    set $lenspack http://lenspack:8795;
    rewrite ^/lenspack/(.*)$ /$1 break;
    proxy_pass $lenspack;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;                           # chat replies stream
    proxy_read_timeout 300s;
  }

  location = /_superset_me {
    internal;
    set $superset http://superset:8088;
    proxy_pass $superset/api/v1/me/;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Host $http_host;
    proxy_set_header Cookie $http_cookie;
  }
```

**8. Datasets and dashboards** with `setup.mts` (or [import them](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#datasets-and-dashboards))

```sh
set -a; . ./.env; set +a
CLICKHOUSE_PASSWORD=… docker compose run --rm --no-deps \
  -e SUPERSET_ADMIN_USERNAME=admin -e SUPERSET_ADMIN_PASSWORD=<an admin password> \
  -e CLICKHOUSE_HOST=<host> -e CLICKHOUSE_PORT=8123 -e CLICKHOUSE_USER=<read-only user> -e CLICKHOUSE_PASSWORD \
  -v "$PWD/lenspack/setup.mts:/setup/setup.mts:ro" \
  --entrypoint /app/node_modules/.bin/tsx lenspack --tsconfig /app/tsconfig.base.json /setup/setup.mts
```

**9. Start Lenspack**

```sh
docker compose up -d lenspack
docker compose logs lenspack | grep "lenspack-superset:"
```

Optional: [Superset in French](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#french-labels).

## Helm (the official chart)

Make the ConfigMap the values mount (the `kubectl create configmap` in [Helm step 1](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#helm-the-official-chart)), put this in `lenspack-values.yaml`, and upgrade:

```yaml
configOverrides:
  lenspack: |
    from lenspack_superset import *  # noqa: F401,F403
extraEnv:
  PYTHONPATH: /app/pythonpath:/app/lenspack
  LENSPACK_URL: /lenspack
  LENSPACK_INTERNAL_URL: http://lenspack.superset.svc.cluster.local:8795
extraSecretEnv:
  LENSPACK_SETTINGS_TOKEN: <the same random value as Lenspack's>
extraVolumes:
  - name: lenspack
    configMap:
      name: superset-lenspack
      items:
        - { key: lenspack_superset.py, path: lenspack_superset.py }
        - { key: build_translations.py, path: build_translations.py }
        - { key: tail_js_custom_extra.html, path: templates/tail_js_custom_extra.html }
        - { key: settings.html, path: templates/lenspack/settings.html }
extraVolumeMounts:
  - { name: lenspack, mountPath: /app/lenspack, readOnly: true }
bootstrapScript: |
  #!/bin/bash
  # ...your existing lines (e.g. psycopg2-binary for the metadata database)...
  uv pip install --no-cache --python /app/.venv/bin/python "clickhouse-connect>=0.8,<1.0"
```

```sh
helm upgrade superset superset/superset -n superset --reuse-values -f lenspack-values.yaml
```

Then the service account, the Lenspack Deployment, the `/lenspack/` Ingress and the datasets: [Helm steps 3–6](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#helm-the-official-chart).

## Check it works

1. `docker compose logs lenspack | grep "lenspack-superset:"` names the pack and counts its datasets and measures.
2. Signed out, `/lenspack/overlay.js` answers 401.
3. Signed in, any dashboard has **Ask Lenspack** at the bottom right ("Don't change the board. What does this dashboard
   show?"), and Settings → Manage → AI assistant shows the datasets, models and today's usage.

Something off? [Troubleshooting](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#troubleshooting). What needs a restart after a change: [table](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#what-needs-a-restart).

## Roll back

1. Remove the import line and the Superset additions (`PYTHONPATH`, `LENSPACK_*`, the volume, the driver install); restart Superset.
2. Remove the two proxy locations and reload nginx (or delete the `/lenspack` Ingress); remove the Lenspack container and its volume.
3. Optional: delete the `lenspack` user and what `setup.mts` made ([order matters](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#roll-back)).
