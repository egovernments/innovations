# NL dashboard: Superset + Lenspack

Use case 3.1, *Natural-Language Dashboard/Query Assistant*. People ask for a chart or a change in plain language,
and get it as ordinary Superset charts on an ordinary Superset dashboard. Goal, approaches and limitations:
[issue #1](https://github.com/egovernments/innovations/issues/1).

- **Superset is not forked.** We use the stock `apache/superset:5.0.0` image plus two database drivers, a config file,
  and one Python file (`lenspack_superset.py`) that the config imports.
- **[Lenspack](https://github.com/theflywheel/lenspack/tree/superset/packages/superset) adds the chat.**
  - It reads Superset's datasets and saved metrics as its vocabulary.
  - It gets every number from Superset (`/api/v1/chart/data`).
  - It writes changes back as Superset charts and dashboard layout.
- **The chat is on every dashboard:** an "Ask Lenspack" button on Superset's own dashboard page. Anyone who can view
  the dashboard can ask; changes follow Superset's own rights on that dashboard.
- **Admins get a settings page** in Superset: Settings → Manage → **AI assistant**.
- **Already running Superset 5?** [Add Lenspack to an existing Superset](docs/ADD-TO-EXISTING-SUPERSET.md) on the stock
  image, with Docker Compose or the official Helm chart, without this folder's Superset image.
- **How it's built:** [ARCHITECTURE.md](docs/ARCHITECTURE.md) (design, data flow, security, capacity). **In one page,
  for decision makers:** [ONE-PAGER.md](docs/ONE-PAGER.md).

## How it fits together

```
browser ──► Superset 5 (:8088) ──────────────────────────► metadata Postgres, data (Postgres / ClickHouse)
              └── /lenspack/…  Superset forwards, signed ──► Lenspack server ──► Superset REST API (its own account)
                   (signed-in users only)                                     └► LLM API (Anthropic or OpenAI-compatible)
```

- **Browsers reach Superset only.** `lenspack_superset.py` adds a `/lenspack/` route to Superset itself, which forwards
  to the Lenspack container for signed-in users. There is no proxy in front and Lenspack's port isn't published.
- **Who is asking.** On every forwarded request Superset signs a header with the user, whether they're an admin, and
  whether Superset lets them view and edit the dashboard in question. Lenspack trusts nothing else. The key is
  derived from `SUPERSET_SECRET_KEY`, so there is no second secret.
- **Same origin,** so the overlay needs no CORS, and Superset's security headers (Talisman's CSP) stay on.
- **Lenspack's own account** is created on its first start from the admin password, and its password is kept in Lenspack's volume.

## What's here

| Path | What it is |
|---|---|
| [`superset/Dockerfile`](superset/Dockerfile) | `apache/superset:5.0.0` + `psycopg2-binary` + `clickhouse-connect` + French labels, with the files below baked in |
| [`superset/superset_config.py`](superset/superset_config.py) | Superset settings, all from environment variables (documented at the top of the file) |
| [`superset/lenspack_superset.py`](superset/lenspack_superset.py) | Lenspack's additions as one file, imported at the end of `superset_config.py`. It adds the `/lenspack/` route with the signed identity, the "Ask Lenspack" script tag (Superset's overridable `tail_js_custom_extra.html`), the AI assistant page, the endpoints Lenspack calls at start, and the Flask-AppBuilder list-filter fix. |
| [`superset/init.sh`](superset/init.sh) | One-off: schema, `admin` user, roles |
| [`lenspack/Dockerfile`](lenspack/Dockerfile) | The Lenspack server, built from a pinned commit of the public repo (`LENSPACK_REF`) |
| [`lenspack/start.sh`](lenspack/start.sh) | Entrypoint; turns `ANTHROPIC_API_KEY` into the provider list |
| [`lenspack/lenspack-superset.yaml`](lenspack/lenspack-superset.yaml) | Lenspack config for the sample data: datasets, names, hierarchy, guidance and examples for the model; `env:NAME` reads the environment |
| [`lenspack/lenspack-superset.clickhouse.yaml`](lenspack/lenspack-superset.clickhouse.yaml) | The same for the ClickHouse datasets; pick one with `LENSPACK_CONFIG` |
| [`docker-compose.yml`](docker-compose.yml) | Postgres, Superset (with an init step), Lenspack, a one-off `setup`, and `clickhouse-tunnel` (profile `clickhouse`) |
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
- **The chat:** open the dashboard "HCM campaign overview" and click **Ask Lenspack**.
- **Settings:** Settings → Manage → AI assistant, http://127.0.0.1:8088/ai-assistant/. See
  [Custom pages](#custom-pages-and-where-to-find-them).

The `lenspack` container restarts until `setup` has created its datasets, then stays up. `setup` is safe to run again.

Superset listens only on this machine (`BIND_ADDRESS=127.0.0.1`). Before opening it to a network, put TLS in front:
Superset's login form sends passwords as typed.

### Behind a TLS gateway (a second proxy)

To publish the stack on an https host, put a TLS-terminating proxy in front of Superset's port
8088 (everything, `/lenspack/` included, is Superset). Set `ENABLE_PROXY_FIX=true` on Superset, and on
that gateway:

- pass `Host` (the public name) and `X-Forwarded-Proto https`, so redirects and links come out
  as `https://<public host>/…`;
- `proxy_buffering off` and a long `proxy_read_timeout` (300 s): chat replies stream;
- `proxy_cookie_flags ~ secure samesite=lax;` so Superset's session cookie is Secure on the
  https path only (setting `SESSION_COOKIE_SECURE` in Superset would break plain-http sign-in);
- Talisman already sends HSTS only on https requests and never redirects http to https.

An https origin is also what browsers require before they let a page use the microphone
(voice input). With `ENABLE_PROXY_FIX` on, only let the gateway reach port 8088: Superset then
trusts the `X-Forwarded-*` headers it receives.

## Environment variables

| Variable | Used by | Required | Default | What it is |
|---|---|---|---|---|
| `SUPERSET_SECRET_KEY` | Superset | yes | | Signs sessions and encrypts the database passwords Superset saves. Keep it stable. |
| `PG_PASSWORD` | Postgres, Superset | yes | | Postgres password (metadata db `superset`, sample db `hcm`) |
| `SUPERSET_ADMIN_PASSWORD` | init, setup, Lenspack | yes | | Superset's `admin` user. Lenspack uses it once, on its first start, to create its own account `lenspack`, whose password stays in Lenspack's volume |
| `LENSPACK_SUPERSET_PASSWORD` | Lenspack | no | | An existing `lenspack` account's password, used as is: no account is made or reset. For stacks where other tools sign in as `lenspack` (the eval harness) |
| `ANTHROPIC_API_KEY` | Lenspack | for the chat | | Claude Sonnet, Opus and Haiku 5.5. Read by the Anthropic adapter, never logged. |
| `LENSPACK_LLM_PROVIDERS` | Lenspack | for the chat | | Any other models, as Lenspack's JSON provider list (wins over `ANTHROPIC_API_KEY`) |
| `DATA_SQLALCHEMY_URI` | setup | no | the sample `hcm` db | The data, as Superset connects to it |
| `TALISMAN_ENABLED` | Superset | no | `true` | Superset's security headers |
| `ENABLE_PROXY_FIX` | Superset | behind a gateway | `false` | Trust the gateway's `X-Forwarded-*` headers |
| `LENSPACK_EDIT_POLICY` | Lenspack | no | `superset` | Who may change dashboards through the chat: `superset` means whoever Superset lets edit that dashboard (owners with `can_write`, admins); `signed-in` means anyone signed in |
| `OPENROUTER_API_KEY` | Lenspack | for the microphone | | Speech to text for the chat's microphone; empty hides it |
| `MAPBOX_API_KEY` | superset | Mapbox public token (`pk.…`) for the basemap under deck.gl map charts. Empty: points on a blank background. |
| `LENSPACK_INTERNAL_URL` | Superset | no | `http://lenspack:8795` | How Superset's server reaches Lenspack (the `/lenspack/` route and the AI assistant page) |
| `BIND_ADDRESS`, `PORT` | Superset | no | `127.0.0.1`, `8088` | Where Superset listens |
| `LENSPACK_CONFIG` | compose | no | `lenspack-superset.yaml` | Which Lenspack config: the sample one or `lenspack-superset.clickhouse.yaml` |
| `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD` | setup | for ClickHouse | | Read-only ClickHouse user. Pass the password with `-e` to the setup run; Superset stores it encrypted |
| `CLICKHOUSE_HOST`, `CLICKHOUSE_PORT`, `CLICKHOUSE_DATABASE` | setup | no | `clickhouse-tunnel`, `8123`, `analytics` | Where Superset reaches ClickHouse |
| `CLICKHOUSE_TENANT` | setup | no | `ng` | Tenant for the targets and referrals marts (the `su_ni_*` views are eGov's views for the ng field test) |
| `CLICKHOUSE_KUBECONFIG`, `CLICKHOUSE_KUBE_CONTEXT`, `CLICKHOUSE_KUBE_NAMESPACE`, `CLICKHOUSE_KUBE_SERVICE` | clickhouse-tunnel | for the tunnel | `-`, current, `clickhouse`, `svc/clickhouse` | The read kubeconfig and the ClickHouse service to port-forward to |
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
    "HCM analytics (ClickHouse)" and virtual datasets over **eGov's own Superset-ready views** (`default.su_ni_*`,
    which already carry boundary names), plus two analytics marts the views lack (targets, referrals):

    | Dataset | From | One row per | Holds |
    |---|---|---|---|
    | `ni_coverage` | `su_ni_cov`, `dm_targets_base`, `su_ni_days` | settlement × campaign day | children vaccinated, households registered, targets, zero-dose and enumerated children, coverage and zero-dose %, cumulative actual vs planned % |
    | `ni_status` | `su_ni_cov`, `dm_targets_base` | settlement × group × status | reached vs remaining, for coverage pies |
    | `ni_visits` | `su_ni_task` | child visit | outcome, refusal and absence reasons, gender, age band, settlement type, access, team (no names, ids or locations) |
    | `ni_missed` | `su_ni_missed` | settlement × campaign day | children missed, children outstanding |
    | `ni_team_stock` | `su_ni_team_stock` | team | vials issued, returned, spoilt, used; wastage (50 doses per vial), vials per child |
    | `ni_facilities` | `su_ni_zd_facility` | health facility | location and zero-dose band, for the map |
    | `ni_referrals` | `dm_referral_summary` | day × boundary | referrals |
    | `ni_freshness` | `su_ni_freshness` | — | last day in the marts and the source (Superset only) |

    - Each quantity has one home: children vaccinated, households registered, targets and zero-dose children
      are on `ni_coverage` only.
    - Every percentage is a saved metric `sum(numerator) / sum(denominator)`, so Superset computes it right for any
      grouping. End-of-campaign values (targets, zero-dose, enumerated) sit on the last day's row, so they add up
      over places; coverage % is for the whole campaign, and progress by day uses the cumulative % metrics.
    - "Children vaccinated" follows eGov's coverage view: distinct children vaccinated, including children
      recorded on a revisit. Counting visits with outcome `VACCINATED` gives a smaller number. Switch with
      `CHILDREN_VACCINATED` in `setup/setup.mts`.
    - The `su_ni_*` views are eGov's views for the ng field-test campaign. `CLICKHOUSE_TENANT` scopes only the
      targets and referrals marts.
  - It also creates two dashboards: "nOPV2 field test overview (ClickHouse)" (slug `ni-smc`) and a national view
    (slug `ni-national`).
  - `lenspack/lenspack-superset.clickhouse.yaml` is the Lenspack config for these datasets (pack `hcm_clickhouse`).
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
| **AI assistant settings** | Superset → **Settings** (top right) → Manage → **AI assistant**, or `/ai-assistant/` | Admins | Lenspack's status, the datasets it reads and what each becomes, its measures, the LLM models and whether they answer, which variable the LLM key comes from (never the key), the daily budget and today's spend, Superset's database connections (passwords masked), and where to change each setting. **Editable:** the chat model and effort, the speech-to-text model and the chat language; saved in Lenspack's state and applied without a restart. Also shows the edit policy and the latest audit-log entries. Registered by `lenspack_superset.py` (`FLASK_APP_MUTATOR`). |
| **Superset language** | The flag menu in Superset's top bar | Everyone | English or French for Superset's own interface (`LANGUAGES` in `superset_config.py`). Superset ships no Hindi; Lenspack's chat has its own language setting. |
| **Ask Lenspack button** | Bottom right of any Superset dashboard page | Anyone who can view the dashboard; changes only for those Superset lets edit it (`LENSPACK_EDIT_POLICY`) | The chat, floating on Superset's page. Changes are saved to that dashboard. Loaded from `/lenspack/overlay.js`, which Superset serves only to signed-in users. |
| **Data connections** | Superset → **Settings** → Data → **Database Connections** | Admins | Superset's own page. `setup` adds "HCM (masked)" for the sample and "HCM analytics (ClickHouse)". |

Known limits of these pages:
- **The page reloads** after a change, and the chat is restored from the browser's session storage. Tracked in
  [theflywheel/lenspack#15](https://github.com/theflywheel/lenspack/issues/15), with where chat history should live.
- **Use the chat with the dashboard in view mode.** In Superset's edit mode, unsaved edits are lost when Lenspack
  reloads the page, and saving them afterwards overwrites what Lenspack saved.
- **Who did what** is in Lenspack's audit log (`/data/audit.jsonl`, 90 days): every change, refusal, chat turn and
  settings change, with the Superset user. The usage figures on the settings page reset when Lenspack restarts; the log doesn't.

## Limits

Most of these are covered in [issue #1](https://github.com/egovernments/innovations/issues/1#issuecomment-6999284286).
- **Service account:** Lenspack reads and writes as one Superset account, `lenspack`, with the Admin role (it edits
  dashboards it doesn't own). Who may edit through the chat is checked per person against Superset's rights, but chart
  data runs as that account, so row-level security applies to it, not to the person asking.
- **Chart types:** only KPI, pie, line, area, bar, table and heatmap charts can be edited. Other chart types are kept as
  Superset's.
- **Lenspack version:** the image pins a commit on Lenspack's `superset` branch. The package isn't on Lenspack's `main`
  yet ([theflywheel/lenspack#16](https://github.com/theflywheel/lenspack/pull/16), draft).
- **No beside page:** the earlier page with the chat beside a framed dashboard, on a port of its own, is no longer part
  of this setup; the chat is on Superset's own dashboard page.
