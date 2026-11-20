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
  - **Beside:** a Lenspack page with the chat on the left and the dashboard in an iframe.

## How it fits together

```
browser ──► one address (compose: proxy/nginx.conf, k8s: ingress)
              ├── /            Superset 5 ───────────────► metadata Postgres, data (Postgres / ClickHouse)
              └── /lenspack/   Lenspack server ──► Superset REST API (service account "lenspack")
                   (only for users signed in to Superset)  └► LLM API (Anthropic or OpenAI-compatible)
```

Serving both apps from one address makes them the same origin:
- Superset's session cookie, the overlay script and the iframe work without CORS.
- Superset's security headers (Talisman's CSP) stay on.
- The proxy lets a request through to `/lenspack/` only if Superset confirms the browser is signed in (`GET /api/v1/me/`).

## What's here

| Path | What it is |
|---|---|
| [`superset/Dockerfile`](superset/Dockerfile) | `apache/superset:5.0.0` + `psycopg2-binary` + `clickhouse-connect`, with the two files below baked in |
| [`superset/superset_config.py`](superset/superset_config.py) | Superset settings, all from environment variables (documented at the top of the file) |
| [`superset/templates/tail_js_custom_extra.html`](superset/templates/tail_js_custom_extra.html) | Replaces Superset's [file of the same name](https://github.com/apache/superset/blob/5.0.0/superset/templates/tail_js_custom_extra.html) with a single script tag that loads the overlay |
| [`superset/init.sh`](superset/init.sh) | One-off: schema, `admin` user, `lenspack` service account, roles |
| [`lenspack/Dockerfile`](lenspack/Dockerfile) | The Lenspack server, built from a pinned commit of the public repo (`LENSPACK_REF`) |
| [`lenspack/start.sh`](lenspack/start.sh) | Entrypoint; turns `ANTHROPIC_API_KEY` into the provider list |
| [`lenspack/lenspack-superset.yaml`](lenspack/lenspack-superset.yaml) | Lenspack config: datasets, names, hierarchy, guidance and examples for the model; `env:NAME` reads the environment |
| [`proxy/nginx.conf`](proxy/nginx.conf) | Compose's single address, with the Superset sign-in check for `/lenspack/` |
| [`docker-compose.yml`](docker-compose.yml) | Postgres, Superset (with an init step), Lenspack, the proxy, and a one-off `setup` |
| [`.env.example`](.env.example) | Every variable, explained; copy it to `.env` |
| [`setup/setup.mts`](setup/setup.mts) | One-off: the data source in Superset, three datasets with metrics and descriptions, and a starter dashboard |
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
- **Beside:** go to http://127.0.0.1:8088/lenspack/superset/1.
- **All dashboards, both ways:** http://127.0.0.1:8088/lenspack/.

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
| `BIND_ADDRESS`, `PORT` | proxy | no | `127.0.0.1`, `8088` | Where the single address listens |
| `LENSPACK_URL` | Superset | set by compose/k8s | `/lenspack` | Where the overlay script is loaded from |
| `SUPERSET_URL` | Lenspack, setup | set by compose/k8s | | How Lenspack reaches Superset's API |

Not secrets, and in the files themselves:
- `lenspack/lenspack-superset.yaml`: the datasets, the model's guidance, and the daily LLM budget (`budget.usdPerDay`).
- `superset/superset_config.py`: session and CSRF settings.

## Data

- **Sample (Postgres):** `sample-data/export.py` flattens `project-task-index-v1`, `household-index-v1` and
  `stock-index-v1` into `hcm_task`, `hcm_household` and `hcm_stock`.
  - Only campaign fields are copied: boundaries, dates, product, outcome, dose and cycle.
  - It copies no individual, household or beneficiary IDs, no names, and no coordinates.
  - `field_worker` is the worker's user name, so run the export against a masked copy of the indices.
  - `setup/setup.mts` defines the datasets' metrics in Postgres SQL.
- **ClickHouse:** the Superset image includes `clickhouse-connect`, so a Superset database can be
  `clickhousedb://user:password@host:8123/db`.
  - Lenspack understands ClickHouse metric expressions (`count()`, `countIf`, `sumIf`, `uniq*`) when it reads datasets.
  - Datasets and metrics over the HCM ClickHouse tables come with the HCM ClickHouse pack, which is waiting for the
    ClickHouse setup.

## Limits

Most of these are covered in [issue #1](https://github.com/egovernments/innovations/issues/1#issuecomment-6999284286).
- **Service account:** Lenspack reads and writes as one Superset account, `lenspack`. It has the Admin role here; give
  it a narrower role for real use.
- **Sign-in check:** the proxy only checks that someone is signed in to Superset. Lenspack doesn't know *who*, and
  doesn't check whether that person may edit a dashboard.
- **Chart types:** only KPI, pie, line, area, bar and table charts can be edited. Other chart types are kept as
  Superset's.
- **Lenspack version:** the image pins a commit on Lenspack's `superset` branch. The package isn't on Lenspack's `main`
  yet.
