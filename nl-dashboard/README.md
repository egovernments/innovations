# NL dashboard: Superset + Lenspack

Use case 3.1, *Natural-Language Dashboard/Query Assistant*. People ask for a chart or a change in plain language,
and get it as ordinary Superset charts on an ordinary Superset dashboard. Goal, approaches and limitations:
[issue #1](https://github.com/egovernments/innovations/issues/1).

- **Superset is not forked.** We use the stock `apache/superset:5.0.0` image plus two database drivers, a config file,
  and one template that Superset documents as overridable.
- **[Lenspack](https://github.com/theflywheel/lenspack/tree/superset/packages/superset) adds the chat.**
  - It reads Superset's datasets and saved metrics as its vocabulary.
  - It gets every number from Superset (`/api/v1/chart/data`).
  - It writes changes back as Superset charts and dashboard layout.
- **There are two ways in, and both work on any dashboard:**
  - **Inside:** an "Ask Lenspack" button on Superset's own dashboard page.
  - **Beside:** a Lenspack page with the chat on the left and the dashboard in an iframe, on its own port.
- **Admins get a settings page** in Superset: Settings → Manage → **AI assistant**.

## How it fits together

```
browser ──► one address (compose: proxy/nginx.conf :8088, k8s: ingress)
              ├── /            Superset 5 ───────────────► metadata Postgres, data (Postgres / ClickHouse)
              └── /lenspack/   Lenspack server ──► Superset REST API (service account "lenspack")
                   (only for users signed in to Superset)  └► LLM API (Anthropic or OpenAI-compatible)
browser ──► beside port (compose :8795, k8s: optional second host)
              └── /            Lenspack's beside page, framing Superset from the address above
```

Serving both apps from one address makes them the same origin:
- Superset's session cookie, the overlay script and the iframe work without CORS.
- Superset's security headers (Talisman's CSP) stay on.
- The proxy lets a request through to `/lenspack/` only if Superset confirms the browser is signed in (`GET /api/v1/me/`).

The beside page on its own port is a different origin. It uses the same sign-in check (Superset's cookie belongs to
the host, not the port), and Superset allows it to frame dashboards through the CSP's `frame-ancestors`
(`LENSPACK_BESIDE_ORIGINS`). Superset no longer sends `X-Frame-Options`; the CSP is what limits framing.

## What's here

| Path | What it is |
|---|---|
| [`superset/Dockerfile`](superset/Dockerfile) | `apache/superset:5.0.0` + `psycopg2-binary` + `clickhouse-connect`, with the two files below baked in |
| [`superset/superset_config.py`](superset/superset_config.py) | Superset settings, all from environment variables (documented at the top of the file) |
| [`superset/templates/tail_js_custom_extra.html`](superset/templates/tail_js_custom_extra.html) | Replaces Superset's [file of the same name](https://github.com/apache/superset/blob/5.0.0/superset/templates/tail_js_custom_extra.html) with a single script tag that loads the overlay |
| [`superset/templates/lenspack/settings.html`](superset/templates/lenspack/settings.html) | The Settings → Manage → AI assistant page, registered from `superset_config.py` (`FLASK_APP_MUTATOR`) |
| [`superset/init.sh`](superset/init.sh) | One-off: schema, `admin` user, `lenspack` service account, roles |
| [`lenspack/Dockerfile`](lenspack/Dockerfile) | The Lenspack server, built from a pinned commit of the public repo (`LENSPACK_REF`) |
| [`lenspack/start.sh`](lenspack/start.sh) | Entrypoint; turns `ANTHROPIC_API_KEY` into the provider list |
| [`lenspack/lenspack-superset.yaml`](lenspack/lenspack-superset.yaml) | Lenspack config for the sample data: datasets, names, hierarchy, guidance and examples for the model; `env:NAME` reads the environment |
| [`lenspack/lenspack-superset.clickhouse.yaml`](lenspack/lenspack-superset.clickhouse.yaml) | The same for the ClickHouse datasets; pick one with `LENSPACK_CONFIG` |
| [`proxy/nginx.conf`](proxy/nginx.conf) | Compose's single address (:8088), with the Superset sign-in check for `/lenspack/`, and the beside page's port (:8795) |
| [`docker-compose.yml`](docker-compose.yml) | Postgres, Superset (with an init step), Lenspack, the proxy, a one-off `setup`, and `clickhouse-tunnel` (profile `clickhouse`) |
| [`.env.example`](.env.example) | Every variable, explained; copy it to `.env` |
| [`setup/setup.mts`](setup/setup.mts) | One-off: data sources in Superset (sample Postgres and/or ClickHouse), datasets with metrics and descriptions, and a starter dashboard for each |
| [`sample-data/`](sample-data/) | Loads three HCM indices (tasks, households, stock) from Elasticsearch into Postgres, with no IDs or coordinates |
| [`k8s/`](k8s/) | The same stack on Kubernetes, with [its own README](k8s/README.md) |

## Run it with Docker Compose

```sh
cd nl-dashboard
cp .env.example .env        # fill in the secrets (openssl rand -base64 42)
docker compose up -d --build
# Sample data: three HCM indices from an Elasticsearch you can reach (a masked copy; see below)
ES_URL=http://127.0.0.1:9200 sample-data/load.sh
docker compose run --rm setup
```

Then open http://127.0.0.1:8088 and sign in as `admin` (`SUPERSET_ADMIN_PASSWORD`).
- **Inside:** open the dashboard "HCM campaign overview" and click **Ask Lenspack**.
- **Beside:** http://127.0.0.1:8795/superset/1 (set `LENSPACK_BESIDE_ORIGINS=http://127.0.0.1:8795` first).
  Use the same host name for both ports, so the browser sends Superset's cookie to both.
  The same page also works under the single address, at http://127.0.0.1:8088/lenspack/superset/1.
- **All dashboards, both ways:** http://127.0.0.1:8795/.
- **Settings:** Settings → Manage → AI assistant, http://127.0.0.1:8088/ai-assistant/. See
  [Custom pages](#custom-pages-and-where-to-find-them).

The `lenspack` container restarts until `setup` has created its datasets, then stays up. `setup` is safe to run again.

The proxy listens only on this machine (`BIND_ADDRESS=127.0.0.1`). Before opening it to a network, put TLS in front:
Superset's login form sends passwords as typed.

## Environment variables

| Variable | Used by | Required | Default | What it is |
|---|---|---|---|---|
| `SUPERSET_SECRET_KEY` | Superset | yes | | Signs sessions and encrypts the database passwords Superset saves. Keep it stable. |
| `PG_PASSWORD` | Postgres, Superset | yes | | Postgres password (metadata db `superset`, sample db `hcm`) |
| `SUPERSET_ADMIN_PASSWORD` | init, setup | yes | | Superset's `admin` user |
| `LENSPACK_SUPERSET_PASSWORD` | init, Lenspack | yes | | Superset's `lenspack` service account, which Lenspack signs in as |
| `ANTHROPIC_API_KEY` | Lenspack | for the chat | | Claude Sonnet, Opus and Haiku 5.5. Read by the Anthropic adapter, never logged. |
| `LENSPACK_LLM_PROVIDERS` | Lenspack | for the chat | | Any other models, as Lenspack's JSON provider list (wins over `ANTHROPIC_API_KEY`) |
| `DATA_SQLALCHEMY_URI` | setup | no | the sample `hcm` db | The data, as Superset connects to it |
| `TALISMAN_ENABLED` | Superset | no | `true` | Superset's security headers |
| `LENSPACK_BESIDE_ORIGINS` | Superset | for the beside port | | Origins of the beside page (`http://host:8795`, space-separated), allowed to frame Superset (CSP `frame-ancestors`) |
| `LENSPACK_BESIDE_URL` | Superset | no | | Beside page link on Settings → Manage → AI assistant |
| `MAPBOX_API_KEY` | superset | Mapbox public token (`pk.…`) for the basemap under deck.gl map charts. Empty: points on a blank background. |
| `LENSPACK_INTERNAL_URL` | Superset | no | `http://lenspack:8795` | How Superset's server reaches Lenspack, for the AI assistant page |
| `BIND_ADDRESS`, `PORT` | proxy | no | `127.0.0.1`, `8088` | Where the single address listens |
| `BESIDE_PORT` | proxy | no | `8795` | The beside page's port |
| `SUPERSET_PUBLIC_URL` | Lenspack | for the beside port | `http://127.0.0.1:8088` | Where browsers reach Superset; the beside page frames it from here |
| `LENSPACK_CONFIG` | compose | no | `lenspack-superset.yaml` | Which Lenspack config: the sample one or `lenspack-superset.clickhouse.yaml` |
| `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD` | setup | for ClickHouse | | Read-only ClickHouse user. Pass the password with `-e` to the setup run; Superset stores it encrypted |
| `CLICKHOUSE_HOST`, `CLICKHOUSE_PORT`, `CLICKHOUSE_DATABASE` | setup | no | `clickhouse-tunnel`, `8123`, `analytics` | Where Superset reaches ClickHouse |
| `CLICKHOUSE_TENANT` | setup | no | `ng` | The tenant the ClickHouse datasets are limited to |
| `CLICKHOUSE_KUBECONFIG`, `CLICKHOUSE_KUBE_CONTEXT`, `CLICKHOUSE_KUBE_NAMESPACE`, `CLICKHOUSE_KUBE_SERVICE` | clickhouse-tunnel | for the tunnel | `-`, current, `clickhouse`, `svc/clickhouse` | The read kubeconfig and the ClickHouse service to port-forward to |
| `LENSPACK_URL` | Superset | set by compose/k8s | `/lenspack` | Where the overlay script is loaded from |
| `SUPERSET_URL` | Lenspack, setup | set by compose/k8s | | How Lenspack reaches Superset's API |

Not secrets, and in the files themselves:
- `lenspack/lenspack-superset.yaml`: the datasets, the model's guidance, and the daily LLM budget (`budget.usdPerDay`).
- `superset/superset_config.py`: session and CSRF settings, and the Settings → Manage → **AI assistant** page
  (admins only, `/ai-assistant/`): Lenspack's datasets, models, where the LLM key comes from (never the key),
  budget and today's spend, and Superset's data connections with passwords masked.

## Data

- **Sample (Postgres):** `sample-data/export.py` flattens `project-task-index-v1`, `household-index-v1` and
  `stock-index-v1` into `hcm_task`, `hcm_household` and `hcm_stock`.
  - Only campaign fields are copied: boundaries, dates, product, outcome, dose and cycle.
  - It copies no individual, household or beneficiary IDs, no names, and no coordinates.
  - `field_worker` is the worker's user name, so run the export against a masked copy of the indices.
  - `setup/setup.mts` defines the datasets' metrics in Postgres SQL.
- **HCM analytics (ClickHouse):** the Superset image includes `clickhouse-connect`. Lenspack never connects to
  ClickHouse; Superset runs the SQL.
  - `setup/setup.mts` runs its ClickHouse part when `CLICKHOUSE_PASSWORD` is set. It creates the database
    "HCM analytics (ClickHouse)" and four virtual datasets over eGov's analytics marts: `ch_smc_doses`,
    `ch_households`, `ch_referrals` and `ch_stock`.
    - The datasets cover one tenant (`CLICKHOUSE_TENANT`, default `ng`).
    - Boundary codes are joined to their names: state, LGA, ward, health facility and settlement.
    - No household or individual IDs are selected.
  - It also creates the dashboard "SMC field test (ClickHouse)" (slug `ch-smc`).
  - Metrics are ClickHouse SQL (`sumIf`, `count()`, `uniqExactMerge`).
    - Distinct children is an `AggregateFunction` state in the mart, and Superset's driver cannot read that type
      when it inspects a dataset. The dataset passes it on as a String and the metric casts it back before merging.
  - `clickhouse-tunnel` (profile `clickhouse`) reaches ClickHouse inside a Kubernetes cluster with a read kubeconfig,
    using `kubectl port-forward`. Set `CLICKHOUSE_HOST`/`CLICKHOUSE_PORT` instead when ClickHouse is reachable directly.
  - Steps:

    ```sh
    docker compose --profile clickhouse up -d clickhouse-tunnel
    CLICKHOUSE_PASSWORD=… docker compose run --rm -e CLICKHOUSE_PASSWORD setup
    # then LENSPACK_CONFIG=lenspack-superset.clickhouse.yaml in .env, and: docker compose up -d lenspack
    ```

  - Superset stores the password (encrypted with `SUPERSET_SECRET_KEY`) in its database settings. Keep it out
    of `.env` and pass it to the setup run only.

## Custom pages and where to find them

Everything below is added without forking Superset.

| Page | Where | Who | What it is |
|---|---|---|---|
| **AI assistant settings** | Superset → **Settings** (top right) → Manage → **AI assistant**, or `/ai-assistant/` | Admins | Lenspack's status, the datasets it reads and what each becomes, its measures, the LLM models and whether they answer, which variable the LLM key comes from (never the key), the daily budget and today's spend, Superset's database connections (passwords masked), and where to change each setting. Registered in `superset_config.py` (`FLASK_APP_MUTATOR`), rendered from `templates/lenspack/settings.html`. Read-only. |
| **Ask Lenspack button** (inside) | Bottom right of any Superset dashboard page, at the single address | Anyone signed in to Superset | The chat, floating on Superset's page. Changes are saved to that dashboard. Loaded by `templates/tail_js_custom_extra.html` from `/lenspack/overlay.js`, which the proxy serves only to signed-in browsers. |
| **Beside page** | Its own port (compose: `BESIDE_PORT`, default 8795): `/superset/<dashboard id>`; the list of dashboards at `/` | Anyone signed in to Superset (same host name as Superset) | The chat on the left, the Superset dashboard in an iframe on the right. Not signed in: redirected to Superset's login. Also at `/lenspack/superset/<id>` and `/lenspack/` on the single address. |
| **Data connections** | Superset → **Settings** → Data → **Database Connections** | Admins | Superset's own page. `setup` adds "HCM (masked)" for the sample and "HCM analytics (ClickHouse)". |

Known limits of these pages:
- **Inside mode reloads the whole page** after a change, and the chat is restored from the browser's session storage.
  The beside page reloads only the iframe. Tracked in
  [theflywheel/lenspack#15](https://github.com/theflywheel/lenspack/issues/15), with where chat history should live.
- **Use the chat with the dashboard in view mode.** In Superset's edit mode, unsaved edits are lost when Lenspack
  reloads the page, and saving them afterwards overwrites what Lenspack saved.
- **The chat acts as the service account,** which has the Admin role: anyone signed in can change any dashboard they can
  open through the chat. Per-user checks are the auth follow-up in
  [issue #1](https://github.com/egovernments/innovations/issues/1).

## Limits

Most of these are covered in [issue #1](https://github.com/egovernments/innovations/issues/1#issuecomment-6999284286).
- **Service account:** Lenspack reads and writes as one Superset account, `lenspack`. It has the Admin role here; give
  it a narrower role for real use.
- **Sign-in check:** the proxy only checks that someone is signed in to Superset. Lenspack doesn't know *who*, and
  doesn't check whether that person may edit a dashboard.
- **Chart types:** only KPI, pie, line, area, bar and table charts can be edited. Other chart types are kept as
  Superset's.
- **Lenspack version:** the image pins a commit on Lenspack's `superset` branch. The package isn't on Lenspack's `main`
  yet ([theflywheel/lenspack#16](https://github.com/theflywheel/lenspack/pull/16), draft).
- **Framing:** with `LENSPACK_BESIDE_ORIGINS` set, Superset stops sending `X-Frame-Options` and relies on the CSP's
  `frame-ancestors`, which every current browser supports.
