# NL dashboard: Superset + Lenspack

Use case 3.1, *Natural-Language Dashboard/Query Assistant*. People ask for a chart or a change in plain language,
and get it as ordinary Superset charts on an ordinary Superset dashboard. Goal, approaches and limitations:
[issue #1](https://github.com/egovernments/innovations/issues/1).

- **Superset is not forked.** We use the stock `apache/superset:6.1.0` image plus two database drivers, a config file,
  and one Python file (`lenspack_superset.py`) that the config imports.
- **[Lenspack](https://github.com/theflywheel/lenspack/tree/main/packages/hosts/superset) adds the chat.**
  - It reads Superset's datasets and saved metrics as its vocabulary (Lenspack calls this vocabulary a *pack*).
  - It gets every number from Superset (`/api/v1/chart/data`).
  - It writes changes back as Superset charts and dashboard layout.
- **The chat is on every dashboard:** an "Ask Lenspack" button on Superset's own dashboard page. Anyone who can view
  the dashboard can ask; changes follow Superset's own rights on that dashboard.
- **Admins get a settings page** in Superset: Settings → Manage → **AI assistant**.
- **Already running Superset?** Superset 6.1 (5.0 also works; 6.0 untested): [add Lenspack to an existing Superset](docs/ADD-TO-EXISTING-SUPERSET.md) on the stock
  image, with Docker Compose or the official Helm chart, without this folder's Superset image.
- **How it's built:** [ARCHITECTURE.md](docs/ARCHITECTURE.md) (design, data flow, security, capacity). **Where the
  data comes from:** [ANALYTICS-PIPELINE.md](docs/ANALYTICS-PIPELINE.md) (HCM records to ClickHouse tables to Superset
  datasets, step by step). **In one page, for decision makers:** [ONE-PAGER.md](docs/ONE-PAGER.md).
- **All the docs,** grouped by reader: [docs/README.md](docs/README.md).
- **What's ours and what's Lenspack's:** [where things live](#where-things-live). Lenspack's code is not copied
  here; it runs from its published image at a pinned version.

## How it fits together

```
browser ──► Superset 6.1 (:8088) ────────────────────────► metadata Postgres, data (Postgres / ClickHouse)
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

The design in full: [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Where things live

This folder has two sides, and they are kept apart:

- **Lenspack** (open source, [theflywheel/lenspack](https://github.com/theflywheel/lenspack)) is the chat: the
  server, the agent and its Superset plugin. We don't copy its code. Both containers use its published image at one
  pinned version, **`b91d2bb`**, and this folder only configures it.
- **The Superset deployment and the HCM material** are owned here: the Superset image and settings, the Lenspack
  configs for HCM data, the dataset setup, the deploy files, and the evaluation results.

**Owned here**

| Part | Where | What it is |
|---|---|---|
| Superset image and settings | [`deploy/superset/`](deploy/superset/) | `apache/superset:6.1.0` + `psycopg2-binary` + `clickhouse-connect` + French labels, our settings ([`superset_config.py`](deploy/superset/superset_config.py), all from environment variables) and the one-off [`init.sh`](deploy/superset/init.sh) (schema, `admin` user, roles) |
| Running the stack | [`deploy/docker-compose.yml`](deploy/docker-compose.yml), [`deploy/.env.example`](deploy/.env.example), [`deploy/k8s/`](deploy/k8s/) | Docker Compose (Postgres, Superset with an init step, Lenspack, a one-off `setup`, and `clickhouse-tunnel` in profile `clickhouse`) and the same stack on Kubernetes ([its README](deploy/k8s/README.md)). These files pin the Lenspack version |
| Resilience test | [`deploy/test/`](deploy/test/) | Restarts and breaks parts of a running stack and checks it recovers |
| HCM configs for Lenspack | [`deploy/lenspack/`](deploy/lenspack/) | Which Superset datasets the chat reads, their names, the place hierarchy, and guidance and examples for the model: [`lenspack-superset.yaml`](deploy/lenspack/lenspack-superset.yaml) for the sample data, [`lenspack-superset.clickhouse.yaml`](deploy/lenspack/lenspack-superset.clickhouse.yaml) for ClickHouse (pick one with `LENSPACK_CONFIG`) |
| HCM datasets in Superset | [`demo-data/setup/setup.mts`](demo-data/setup/setup.mts) | One-off: data sources (sample Postgres and/or ClickHouse), datasets with metrics and descriptions, and a starter dashboard for each |
| HCM sample data | [`demo-data/sample-data/`](demo-data/sample-data/) | Loads three HCM indices (tasks, households, stock) from Elasticsearch into Postgres, with no IDs or coordinates |
| How the HCM data is built | [`docs/ANALYTICS-PIPELINE.md`](docs/ANALYTICS-PIPELINE.md) | From HCM records to ClickHouse tables to Superset datasets |
| Docs for this deployment | [`docs/`](docs/README.md) | How it works, adding it to a Superset you already run, updating, a one-page summary |
| Evaluation results | [`evals/`](evals/README.md) | How often the chat gives the right answer on HCM data, and the speech-to-text comparison |

**From Lenspack, at the pinned version `b91d2bb`** (the links open that exact commit)

| Part | How this folder uses it | Code | Docs |
|---|---|---|---|
| The Lenspack server: chat, agent, Superset connector | the `lenspack` container runs `ghcr.io/theflywheel/lenspack:b91d2bb` | [`packages/hosts/superset`](https://github.com/theflywheel/lenspack/tree/b91d2bb54ccb20c27891c77186b06a1069671290/packages/hosts/superset) | [Superset host](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/docs/hosts/superset/README.md) |
| Superset plugin, `lenspack_superset.py` | copied into our Superset image from the same Lenspack image when it is built ([`Dockerfile`](deploy/superset/Dockerfile)), and imported at the end of `superset_config.py` | [`plugin/lenspack_superset.py`](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/packages/hosts/superset/plugin/lenspack_superset.py) | [install](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/docs/hosts/superset/install.md), [identity](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/docs/hosts/superset/identity.md) |
| The config file format of `deploy/lenspack/*.yaml` | | | [config reference](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/docs/reference/config.md), [datasets and dashboards](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/docs/hosts/superset/datasets-and-dashboards.md) |
| Superset API client in `setup.mts` | `setup` runs inside the Lenspack image and imports it | [`src/client.ts`](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/packages/hosts/superset/src/client.ts) | |
| Who sees what | | | [access](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/docs/access/superset.md) |
| Upgrading | steps for this stack: [`docs/UPDATING.md`](docs/UPDATING.md) | | [upgrading](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/docs/hosts/superset/upgrading.md), [Superset versions](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/docs/hosts/superset/versions.md) |
| The eval runner and the HCM question sets | run from a Lenspack checkout; our results are in [`evals/`](evals/README.md) | [`evals/`](https://github.com/theflywheel/lenspack/tree/b91d2bb54ccb20c27891c77186b06a1069671290/evals), question sets at the version our results used: [`evals/suites/hcm` @ `ce9cd0f`](https://github.com/theflywheel/lenspack/tree/ce9cd0fe932f811d2542be607716bd8a4ef5c602/evals/suites/hcm) | [evals](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/evals/README.md) |
| Speech-to-text scripts | our results are in [`evals/speech/`](evals/speech/README.md) | [`evals/speech` @ `09d59f3`](https://github.com/theflywheel/lenspack/tree/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech), the version our results used | |

All of Lenspack's docs at this version: [docs/README.md](https://github.com/theflywheel/lenspack/blob/b91d2bb54ccb20c27891c77186b06a1069671290/docs/README.md).

**Production deploys** are not in this repository. The Helm charts for HCM's production Superset (first: the Gabon
pilot) are draft pull requests in
[HCM-BAUCHI/Nigeria-DevOps](https://github.com/HCM-BAUCHI/Nigeria-DevOps): the Lenspack server chart
([#100](https://github.com/HCM-BAUCHI/Nigeria-DevOps/pull/100)) and the plugin in the Superset chart
([#99](https://github.com/HCM-BAUCHI/Nigeria-DevOps/pull/99)). How the pilot is set up:
[gabon-pilot-config-notes.md](docs/gabon-pilot-config-notes.md).

**Changing the Lenspack version.** The tag is pinned in [`deploy/docker-compose.yml`](deploy/docker-compose.yml)
(three places), [`deploy/.env.example`](deploy/.env.example), [`deploy/superset/Dockerfile`](deploy/superset/Dockerfile),
[`deploy/k8s/kustomization.yaml`](deploy/k8s/kustomization.yaml) (the Lenspack tag, and the Superset image built
with it) and [`deploy/k8s/setup-job.yaml`](deploy/k8s/setup-job.yaml). Change them together, with the links to that
version in this README and the docs (`grep -rn b91d2bb nl-dashboard` finds every place).
[`docs/UPDATING.md`](docs/UPDATING.md) has the steps for a running deployment.

**Lenspack's Superset side** is one file, `lenspack_superset.py`, imported at the end of `superset_config.py`. It
adds the `/lenspack/` route with the signed identity, the "Ask Lenspack" script tag (Superset's overridable
`tail_js_custom_extra.html`), the AI assistant page, the endpoints Lenspack calls at start, and a fix for a bug in
Superset's web framework (Flask-AppBuilder) where two dataset lookups at the same moment could each get the other's
result. It lives in the Lenspack repository, next to the server it talks to.

## Run it with Docker Compose

```sh
cd nl-dashboard/deploy
cp .env.example .env        # fill in the secrets (openssl rand -base64 42)
docker compose up -d --build
# Sample data: three HCM indices from an Elasticsearch you can reach (a masked copy; see below)
ES_URL=http://127.0.0.1:9200 ../demo-data/sample-data/load.sh
docker compose run --rm setup
```

Then open http://127.0.0.1:8088 and sign in as `admin` (`SUPERSET_ADMIN_PASSWORD`).
- **The chat:** open the dashboard "HCM campaign overview" and click **Ask Lenspack**.
- **Settings:** Settings → Manage → AI assistant, http://127.0.0.1:8088/ai-assistant/. See
  [Custom pages](#custom-pages-and-where-to-find-them).

The `lenspack` container restarts until `setup` has created its datasets, then stays up. `setup` is safe to run again.
The Lenspack image is pulled from `ghcr.io/theflywheel/lenspack`; `LENSPACK_IMAGE` in `.env` picks another version
(both containers use it, so Superset's side and the server always match).

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
| `LENSPACK_SUPERSET_PASSWORD` | Lenspack | no | | An existing `lenspack` account's password, used as is: no account is made or reset. For stacks where other tools sign in as `lenspack` (such as the evaluation runner) |
| `ANTHROPIC_API_KEY` | Lenspack | for the chat | | With only this key set, the chat offers Claude Sonnet (the default), Opus and Haiku 5.5. Never logged. |
| `LENSPACK_LLM_PROVIDERS` | Lenspack | for the chat | | Any other models, as Lenspack's JSON provider list (wins over `ANTHROPIC_API_KEY`) |
| `DATA_SQLALCHEMY_URI` | setup | no | the sample `hcm` db | The data, as Superset connects to it |
| `TALISMAN_ENABLED` | Superset | no | `true` | Superset's security headers |
| `ENABLE_PROXY_FIX` | Superset | behind a gateway | `false` | Trust the gateway's `X-Forwarded-*` headers |
| `LENSPACK_EDIT_POLICY` | Lenspack | no | `superset` | Who may change dashboards through the chat: `superset` means whoever Superset lets edit that dashboard (owners with `can_write`, admins); `signed-in` means anyone signed in |
| `OPENROUTER_API_KEY` | Lenspack | for the microphone | | Speech to text for the chat's microphone; empty hides it |
| `MAPBOX_API_KEY` | Superset | no | | Mapbox public token (`pk.…`) for the basemap under deck.gl map charts. Empty: points on a blank background. |
| `LENSPACK_INTERNAL_URL` | Superset | no | `http://lenspack:8795` | How Superset's server reaches Lenspack (the `/lenspack/` route and the AI assistant page) |
| `BIND_ADDRESS`, `PORT` | Superset | no | `127.0.0.1`, `8088` | Where Superset listens |
| `LENSPACK_CONFIG` | compose | no | `lenspack-superset.yaml` | Which Lenspack config in `deploy/lenspack/`: the sample one or `lenspack-superset.clickhouse.yaml` |
| `LENSPACK_IMAGE` | compose | no | `ghcr.io/theflywheel/lenspack:b91d2bb` | The Lenspack image (a commit of Lenspack's `main`). Superset's image copies `lenspack_superset.py` from it, so rebuild with `docker compose up -d --build` after changing it |
| `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD` | setup | for ClickHouse | | Read-only ClickHouse user. Pass the password with `-e` to the setup run; Superset stores it encrypted |
| `CLICKHOUSE_HOST`, `CLICKHOUSE_PORT`, `CLICKHOUSE_DATABASE` | setup | no | `clickhouse-tunnel`, `8123`, `analytics` | Where Superset reaches ClickHouse |
| `CLICKHOUSE_TENANT` | setup | no | `ng` | Tenant id for the targets and referrals tables. eGov's ready-made views cover a single field-test campaign and don't use it |
| `CLICKHOUSE_KUBECONFIG`, `CLICKHOUSE_KUBE_CONTEXT`, `CLICKHOUSE_KUBE_NAMESPACE`, `CLICKHOUSE_KUBE_SERVICE` | clickhouse-tunnel | for the tunnel | `-`, current, `clickhouse`, `svc/clickhouse` | The read kubeconfig and the ClickHouse service to port-forward to |
| `LENSPACK_SUPERSET_URL` | Lenspack | set by compose/k8s | | How Lenspack reaches Superset's API |
| `SUPERSET_URL` | setup | set by compose/k8s | | How the setup step reaches Superset's API |

Not secrets, and in the files themselves:
- `deploy/lenspack/lenspack-superset.yaml`: the datasets, the model's guidance, and the daily LLM budget (`budget.usdPerDay`).
- `deploy/superset/superset_config.py`: session and CSRF settings, and the Settings → Manage → **AI assistant** page
  (admins only, `/ai-assistant/`): Lenspack's datasets, models, where the LLM key comes from (never the key),
  budget and today's spend, and Superset's data connections with passwords masked.

## Data

- **Sample (Postgres):** `demo-data/sample-data/export.py` flattens `project-task-index-v1`, `household-index-v1` and
  `stock-index-v1` into `hcm_task`, `hcm_household` and `hcm_stock`.
  - Only campaign fields are copied: boundaries, dates, product, outcome, dose and cycle.
  - It copies no individual, household or beneficiary IDs, no names, and no coordinates.
  - `field_worker` is the worker's user name, so run the export against a masked copy of the indices.
  - `demo-data/setup/setup.mts` defines the datasets' metrics in Postgres SQL.
- **HCM analytics (ClickHouse):** the Superset image includes `clickhouse-connect`. Lenspack never connects to
  ClickHouse; Superset runs the SQL.
  - `demo-data/setup/setup.mts` runs its ClickHouse part when `CLICKHOUSE_PASSWORD` is set. It creates the database
    "HCM analytics (ClickHouse)" and virtual datasets (datasets defined by a SQL query) over **eGov's own
    Superset-ready views** (`default.su_ni_*`, which already carry boundary names), plus two of eGov's analytics
    summary tables, or *marts* (`analytics.dm_*`), for what the views lack (targets, referrals):

    | Dataset | From | One row per | Holds |
    |---|---|---|---|
    | `ni_coverage` | `su_ni_cov`, `dm_targets_base`, `su_ni_days` | settlement × campaign day | children vaccinated, households registered, targets, zero-dose and enumerated children, coverage and zero-dose %, cumulative actual vs planned % |
    | `ni_status` | `su_ni_cov`, `dm_targets_base` | settlement × group × status | reached vs remaining, for coverage pies |
    | `ni_visits` | `su_ni_task` | child visit | outcome, refusal and absence reasons, gender, age band, settlement type, access, team (no names, ids or locations) |
    | `ni_members` | `su_ni_member` | household member | place, registration day, gender, age band (no names, ids or locations) |
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
      `CHILDREN_VACCINATED` in `demo-data/setup/setup.mts`.
    - eGov's views cover one field-test campaign. `CLICKHOUSE_TENANT` scopes only the targets and referrals marts.
  - It also creates two dashboards: "nOPV2 field test overview (ClickHouse)" (slug `ni-smc`) and a national view
    (slug `ni-national`).
  - `deploy/lenspack/lenspack-superset.clickhouse.yaml` is the Lenspack config for these datasets (its pack is named
    `hcm_clickhouse`).
  - How these views and marts are built from HCM's records, and what each step drops:
    [ANALYTICS-PIPELINE.md](docs/ANALYTICS-PIPELINE.md).
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
- **After a change** the dashboard re-renders in place, or reloads if that takes too long. Chat history is kept in the
  browser's session storage; where it should live is tracked in
  [theflywheel/lenspack#15](https://github.com/theflywheel/lenspack/issues/15).
- **Use the chat with the dashboard in view mode.** In Superset's edit mode, unsaved edits are lost when Lenspack
  refreshes the dashboard, and saving them afterwards overwrites what Lenspack saved.
- **Who did what** is in Lenspack's audit log (`/data/audit.jsonl`, 90 days): every change, refusal, chat turn and
  settings change, with the Superset user. The usage figures on the settings page reset when Lenspack restarts; the log doesn't.

## Limits

Most of these are covered in [issue #1](https://github.com/egovernments/innovations/issues/1#issuecomment-6999284286).
- **Service account:** Lenspack reads and writes as one Superset account, `lenspack`, with the Admin role (it edits
  dashboards it doesn't own). Who may edit through the chat is checked per person against Superset's rights. With
  `hostPolicy: superset` (set in the sample configs), each person's dataset permissions and simple row-level security
  rules apply to their answers, and a rule too complex to apply hides its dataset from them
  ([details](docs/ADD-TO-EXISTING-SUPERSET-REFERENCE.md#what-each-person-sees)).
- **Chart types:** only KPI, pie, line, area, bar, table, heatmap and point-map (`deck_scatter`) charts can be edited.
  Other chart types are kept as Superset's.
- **Lenspack version:** compose and Kubernetes pin a commit of Lenspack's `main` (now `b91d2bb`). Where it is pinned,
  and links to that version's code and docs: [where things live](#where-things-live).

## History

An earlier version put the chat on a page of its own, beside a framed dashboard, on a separate port. It is no longer
part of this setup: the chat is on Superset's own dashboard page.
