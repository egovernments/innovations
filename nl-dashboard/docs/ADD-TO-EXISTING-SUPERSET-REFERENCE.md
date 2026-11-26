# Add Lenspack to an existing Superset: reference

This is the detail behind the [quickstart](ADD-TO-EXISTING-SUPERSET.md): what each step does and why, the options the
quickstart leaves out, the full Helm and Kubernetes setup, and troubleshooting. Steps are numbered as in the quickstart.

When you're done you will have:
- an **Ask Lenspack** button on Superset's dashboard pages, which answers questions and edits the dashboard, for the
  people Superset lets edit it;
- an **AI assistant** page for admins under Settings → Manage;
- optionally, Superset's interface in French.

Everything is configuration: one Python file imported from `superset_config.py`, and a Lenspack container next to
Superset. You don't need this repository's Superset image, a fork, a proxy rule or a second shared secret. To remove
it, take those out and restart ([Roll back](#roll-back)).

The Docker Compose steps were tested by following them literally on a stock `apache/superset:5.0.0`, with its own
Postgres and Redis, reading HCM analytics from ClickHouse. Lenspack's Superset side is tested on `apache/superset:6.1.0`
and `5.0.0`. The Helm values were rendered with charts 0.15.5 (Superset 5.0) and 0.22.8 (Superset 6.1) but not installed.

## Contents

- [Before you start](#before-you-start)
- [How it fits together](#how-it-fits-together)
- [Get the files](#get-the-files)
- [Docker Compose, step by step](#docker-compose-step-by-step)
- [The ClickHouse driver](#the-clickhouse-driver)
- [French labels](#french-labels)
- [Datasets and dashboards](#datasets-and-dashboards)
- [Who may do what](#who-may-do-what)
- [What each person sees](#what-each-person-sees)
- [Lenspack's Superset account](#lenspacks-superset-account)
- [The audit log](#the-audit-log)
- [How many chats at once](#how-many-chats-at-once)
- [Helm (the official chart)](#helm-the-official-chart)
- [The list-filter fix](#the-list-filter-fix)
- [Behind a proxy or ingress](#behind-a-proxy-or-ingress)
- [What needs a restart](#what-needs-a-restart)
- [Roll back](#roll-back)
- [Plain Kubernetes manifests](#plain-kubernetes-manifests)
- [Troubleshooting](#troubleshooting)

## Before you start

| You need | Tested with | Notes |
|---|---|---|
| Superset 6.1 or 5.0 | `apache/superset:6.1.0` (Flask-AppBuilder 5.0.2) and `apache/superset:5.0.0` (4.5.5) | Superset 6.0 is untested. |
| The Lenspack image | `ghcr.io/theflywheel/lenspack:bfbad69` | Public. Built from Lenspack commit `bfbad69` on `main`; it starts with `superset --config <file>` ([`packages/hosts/superset`](https://github.com/theflywheel/lenspack/tree/main/packages/hosts/superset)). |
| A Superset admin's password | | Used once, on Lenspack's first start, to create its own account. |
| An LLM API key | Anthropic (Claude Sonnet, Opus and Haiku 5.5) | Or any OpenAI-compatible API through `LENSPACK_LLM_PROVIDERS`. |
| Your data in Superset | ClickHouse, through `clickhouse-connect` | The stock image has no ClickHouse driver: [adding it](#the-clickhouse-driver). |

A reverse proxy is not needed. If Superset already has one, it is left as it is: see [Behind a proxy or ingress](#behind-a-proxy-or-ingress).

## How it fits together

```
browser ──► Superset ──/lenspack/…──► Lenspack ──API (its own account)──► Superset
             checks the session,        trusts only the signed header;
             signs who is asking        reads datasets, runs chart data, saves dashboards
```

- **One address.** Browsers only ever talk to Superset, which forwards `/lenspack/…` to the Lenspack container for
  signed-in users (anyone else gets 401). Everything is same-origin, so CORS isn't needed and Superset's CSP stays on.
- **Who is asking.** Superset signs a header, `x-lenspack-identity`, on each forwarded request: the user, whether they
  are an admin, and whether they may view and edit the dashboard in question. Lenspack accepts nothing else, so its
  port never needs to be published.
- **No second secret.** The signing key is derived from Superset's `SECRET_KEY`. Rotating `SECRET_KEY` rotates it;
  restart Lenspack afterwards.

How the route, the signed header, the key and streaming work:
[ARCHITECTURE.md](ARCHITECTURE.md#the-proxy-through-superset).

## Get the files

Run the quickstart's download block in the folder that holds your Compose file, or anywhere for Helm.
`lenspack_superset.py` comes from the Lenspack repository
([`packages/hosts/superset/plugin/`](https://github.com/theflywheel/lenspack/tree/main/packages/hosts/superset/plugin)) at the
same commit as the Lenspack image, so Superset's side and the server match. To move to a newer image, change both
the image tag and the commit in the download URL. The config and `setup.mts` come from this repository: `BASE`
names a branch or commit of it.

`lenspack/lenspack-superset.yaml` is Lenspack's config for the HCM ClickHouse datasets that `setup.mts` creates. For your
own datasets, edit its `datasets`, `overlay.entities`, `hierarchies` and `instructions`.

## Docker Compose, step by step

The examples assume your Superset service is called `superset` and the new one `lenspack`. Change the names to match.

### 1. The import line

If your config already sets `FLASK_APP_MUTATOR`, keep yours. After the import, set it back to your function and call
`lenspack_app_mutator(app)` from inside it.

### 2. The mount

- The stock image has `/app/pythonpath` on `PYTHONPATH`, so a file mounted there can be imported. Superset's own
  Compose setup adds `/app/docker/pythonpath_dev` and keeps `/app/pythonpath`, so the same line works there.
- Add it to every service on the Superset image that loads the same config (an init job, Celery workers).
- **Optional environment** on the Superset service:
  - `LENSPACK_INTERNAL_URL`: where Superset's server reaches Lenspack. The default is `http://lenspack:8795`; set it if
    your service isn't called `lenspack`.
  - `LENSPACK_SERVICE_USER`: Lenspack's account. The default is `lenspack`.
  - `LENSPACK_TEMPLATES`: a folder whose `tail_js_custom_extra.html` or `lenspack/settings.html` replace the
    built-in ones.

### 3. Restart Superset

After the restart, sign in as an admin: Settings → Manage now has **AI assistant**. It says Lenspack is unreachable
until step 6.

### 4. The Lenspack service

- `command: ["superset", "--config", ...]` starts the image's Superset mode (the image's default command is
  Lenspack's own web app, which isn't used here).
- `LENSPACK_SUPERSET_URL` is Superset as Lenspack's container reaches it, not the public address. Lenspack learns the public
  address from each request.
- `SUPERSET_ADMIN_PASSWORD` is needed only until Lenspack has made its account ([Lenspack's Superset account](#lenspacks-superset-account)).
  If your admin isn't called `admin`, add `SUPERSET_ADMIN_USERNAME`.
- No ports: only Superset talks to Lenspack.
- Add `lenspack-data: {}` under the top-level `volumes:`. It holds:
  - the account's password;
  - the settings saved from the AI assistant page;
  - the audit log;
  - which charts Lenspack made.
- Don't start it yet. Lenspack exits until the datasets in its config exist (step 5).
- **Optional:**
  - `LENSPACK_SUPERSET_PASSWORD`: an existing `lenspack` account's password, used as it is. Lenspack then makes or resets no
    account, and other tools that sign in as `lenspack` (an eval harness, for example) keep working ([Lenspack's Superset account](#lenspacks-superset-account));
  - `LENSPACK_EDIT_POLICY` ([Who may do what](#who-may-do-what));
  - `LENSPACK_HOST_POLICY`, the same as `hostPolicy` in the config ([What each person sees](#what-each-person-sees));
  - `LENSPACK_AUDIT_RETENTION_DAYS` ([The audit log](#the-audit-log));
  - `OPENROUTER_API_KEY`, for the chat's microphone (speech to text);
  - `LENSPACK_LLM_PROVIDERS`, for models other than Claude. With only `ANTHROPIC_API_KEY`, the chat offers Claude
    Sonnet (the default), Opus and Haiku 5.5.

### 5. Datasets and dashboards

See [Datasets and dashboards](#datasets-and-dashboards). The run uses the Lenspack service's `LENSPACK_SUPERSET_URL` and
`SUPERSET_ADMIN_PASSWORD`.

### 6. Start Lenspack

The log shows these lines in order:
- `created the Superset account lenspack`, on the first start only;
- the pack, with counts of its datasets and measures;
- the edit policy and the audit log's place;
- the address.

Open any dashboard: **Ask Lenspack** is at the bottom right. Try "Don't change the board. What does this dashboard
show?" Then open Settings → Manage → AI assistant. It shows the datasets, models, today's usage and the audit log,
and lets you change the chat model.

## The ClickHouse driver

The stock image has no ClickHouse driver. If your Superset already reads ClickHouse, skip this. Otherwise, choose one:

- **The way you already add Python packages:** a derived image, or Superset's `docker-bootstrap.sh` with
  `requirements-local.txt`. Add `clickhouse-connect>=0.13,<1.0`.
- **At container start**, with Superset running as root (Superset's Compose files and the Helm chart, `runAsUser: 0`, already do):
  ```yaml
    superset:
      user: root
      command: ["sh", "-c", "uv pip install --no-cache --python /app/.venv/bin/python 'clickhouse-connect>=0.13,<1.0' && exec /usr/bin/run-server.sh"]
  ```
  If you have your own start command, keep it and put the `uv pip install … &&` in front of it. The install needs PyPI and adds
  a few seconds to every start. On Helm, put the same `uv pip install` line in `bootstrapScript`.

`lenspack_superset.py` imports the driver once while the config loads. Without that, Superset imports it lazily from
several request threads at once after a restart, and a worker can fail with "partially initialized module" until it is restarted.

Superset 6.1 stopped adding a short suffix to column names in ClickHouse queries. A saved metric named like the column it
adds up (`SUM(x)` saved as `x`) then breaks every other metric in the same chart that uses `x` (ClickHouse error 184).
`lenspack_superset.py` puts the suffix back when Superset starts; results keep their names, so nothing else changes. It
does nothing on Superset 5.0. To turn it off, set `LENSPACK_CLICKHOUSE_LABEL_SUFFIX=off` on Superset and rename such
metrics or columns instead.

## French labels

Optional. The stock images have no compiled French labels (6.1 ships the catalogue, 5.0 not even that), so switching to French changes nothing.
Build them once into a volume:

1. Download the build script: `curl -fsSL -o lenspack/build_translations.py $BASE/deploy/superset/build_translations.py`.
2. Add `LANGUAGES` to your `superset_config.py`:
   ```python
   LANGUAGES = {"en": {"flag": "us", "name": "English"}, "fr": {"flag": "fr", "name": "French"}}
   ```
3. Mount a volume on the `superset` service, and declare it under the top-level `volumes:`:
   ```yaml
       volumes:
         - superset-fr:/app/superset/translations/fr
   ```
4. Build the files once. On 5.0 this needs GitHub (6.1 has the catalogue in the image); the volume keeps them across restarts.
   ```sh
   docker compose run --rm --no-deps --user root -v "$PWD/lenspack/build_translations.py:/tmp/bt.py:ro" \
     --entrypoint python superset /tmp/bt.py fr
   ```

Then restart Superset. The chat follows the language each user picks in Superset. On Helm, see the `languages` override in [Helm](#helm-the-official-chart).

## Datasets and dashboards

Either create them with `setup.mts`, or import them from another Superset.

**With `setup.mts`** (the quickstart's step 5). This creates the ClickHouse connection in Superset, the `ni_*` datasets
with their metrics and descriptions, and two starter dashboards. It's safe to run again: the connection and datasets
are updated, and dashboards that already exist are left as they are. It runs on the Lenspack image.

- `CLICKHOUSE_HOST` is the name Superset reaches ClickHouse by. Superset, not Lenspack, connects to ClickHouse.
- Superset stores the password, encrypted with its secret key, in the connection. Pass it to this run only, not in
  `.env`.
- Optional: `CLICKHOUSE_DATABASE` (default `analytics`) and `CLICKHOUSE_TENANT` (default `ng`).

**By import.** On a Superset that has them: Dashboards → select → Bulk select → Export. This gives a ZIP with the
dashboards, charts, datasets and the database connection. Import it under Dashboards → Import, and type the
ClickHouse password when asked. Then make sure the `datasets` in `lenspack/lenspack-superset.yaml` name the imported
datasets (`<schema>.<table name>`).

## Who may do what

| | Who | Decided by |
|---|---|---|
| Open the chat and ask questions about a dashboard | Anyone signed in who can view that dashboard | Superset (`can_access_dashboard`), per request |
| Change a dashboard through the chat | `LENSPACK_EDIT_POLICY=superset` (default): whoever Superset lets edit it, meaning its owners who have `can_write` on Dashboard, and admins. `signed-in`: anyone signed in | Superset (`is_owner` and `can_write`), per request |
| Change Lenspack's settings, read the audit log | Superset admins | Superset |

The policy is set on the Lenspack container (`LENSPACK_EDIT_POLICY`, or `editPolicy` in its config), and the AI
assistant page shows which one is on. Under the default, with Superset's built-in roles (Alpha users can create and
edit content; Gamma users have limited access, usually for viewing):
- an Alpha who owns a dashboard can edit it through the chat;
- an Alpha who doesn't own it, and a Gamma viewer, can ask but not edit.

When someone without edit rights asks for a change, every edit tool answers "You can view this dashboard but not edit
it in Superset, so nothing was changed…". The model passes that on, and the refusal goes in the audit log.

Which data each person's answers may use is a separate setting: [What each person sees](#what-each-person-sees).

## What each person sees

Lenspack reads data through its own Superset account, and only the datasets in its config. With `hostPolicy: superset`
in `lenspack-superset.yaml` (or `LENSPACK_HOST_POLICY=superset` on the container), each answer follows the access of
the person asking:

- **Dataset permissions.** A dataset their roles can't read (no `datasource_access`, `schema_access`, `database_access`
  or `all_datasource_access`) is left out of their chat: its measures, its filter menus and any query on it.
- **Row-level security.** Each rule that applies to them narrows every query on that dataset, in the chat and the filter
  menus. Lenspack applies simple rules: `column = value`, `column IN (...)`, `AND`, brackets, and `OR` over one column.
  The column must be one Lenspack knows from its datasets.
- **Fails closed.** A rule Lenspack can't apply (`LIKE`, `!=`, functions, subqueries) hides the whole dataset from that
  person, and Lenspack's log says which rule and why. If Superset can't be asked, every dataset is hidden from that
  person until the next try.
- **Dashboard roles.** With Superset's `DASHBOARD_RBAC` on, someone who opens a dashboard only through its dashboard
  roles can ask about the data of that dashboard's charts on that dashboard, with their row-level security, and
  nowhere else. This needs the `lenspack_superset.py` from the same Lenspack version, so rebuild Superset's image.
- **Within a minute.** Lenspack asks Superset (through `lenspack_superset.py`) and keeps each person's answer for 60
  seconds, so a change to roles or rules reaches the chat within a minute, with no restart.

Before you switch it on, give everyone who uses the chat dataset access through their Superset roles. Superset's
built-in Gamma role has none, so a user with only Gamma gets a chat with no data. Superset's Admin role reads
everything.

Without `hostPolicy: superset`, anyone signed in to Superset can ask about every dataset in Lenspack's config, with no
row-level security. That is Lenspack's default for now and will change; set it yourself until then. What a dashboard
shows on its own is unaffected: Superset applies its security there as usual. Details:
[Lenspack's Superset README](https://github.com/theflywheel/lenspack/blob/main/packages/hosts/superset/README.md#what-each-user-sees).

## Lenspack's Superset account

Lenspack reads datasets and metrics, runs chart data, creates charts and saves dashboard layouts as its own Superset
user, `lenspack`.

- **First start.** Lenspack signs in once as an admin (`SUPERSET_ADMIN_USERNAME`, default `admin`, and
  `SUPERSET_ADMIN_PASSWORD`). It then calls `POST /api/v1/lenspack/bootstrap` (admins only), which creates `lenspack`
  with a random password, or resets the password if the user exists. The password is kept in `/data/superset-account.json`
  (mode 600), and later starts sign in with it. You can then remove `SUPERSET_ADMIN_PASSWORD`.
- **When it runs again.** If the saved password stops working (a new metadata database, the user deleted) and
  `SUPERSET_ADMIN_PASSWORD` is still set, Lenspack makes the account again. With `/data` on an `emptyDir`, this happens
  on every pod start, so keep the admin password set there or use a volume.
- **Role.** The account gets **Admin**. Lenspack edits dashboards it doesn't own, and Superset lets only owners and
  admins change a dashboard. Who may edit what *through the chat* is decided per person by
  [the edit policy](#who-may-do-what), not by this role.
- **An account you manage (optional).** Set `LENSPACK_SUPERSET_PASSWORD`, and set `superset.username` in the Lenspack config if the
  account isn't `lenspack`. Lenspack then uses that account as it is and never calls the bootstrap. That matters when
  something else signs in with the same password, because the bootstrap would reset it. Upgrading from a setup with a
  hand-made `lenspack` user, keep the variable and nothing changes for that account.

## The audit log

Lenspack writes a line to `/data/audit.jsonl` for each of these, with the Superset user and the dashboard:
- every board change;
- every refused change;
- every refused request;
- every chat turn;
- every settings change.

- **It is the durable record.** The spend and usage figures on the AI assistant page (`GET /api/_usage`) are kept in
  memory and reset when Lenspack restarts. The audit log doesn't reset; keep `/data` on a volume.
- **Rotation.** On the first write of a new month, `audit.jsonl` becomes `audit-YYYY-MM.jsonl`.
- **Retention.** Months older than 90 days are deleted. Change this with `LENSPACK_AUDIT_RETENTION_DAYS` or
  `audit: { retentionDays: … }` in the config; `audit: false` turns the log off.
- **Reading it.** The AI assistant page shows this month's latest 20. Admins can read more through the chat route:
  `GET /lenspack/_superset/audit?month=YYYY-MM&limit=500`. Or read the files on the volume.

## How many chats at once

Every chat turn streams through one of Superset's gunicorn threads for as long as the reply takes, typically
30–60 seconds. Other requests are unaffected while threads are free. Stock Superset runs 1 worker × 20 threads
(`SERVER_WORKER_AMOUNT`, `SERVER_THREADS_AMOUNT`, `gthread`).

Measured on stock `apache/superset:5.0.0` with 1 worker × 20 threads and replies streaming for 40 s each:

| Chats streaming at once | Slowest page request meanwhile |
|---|---|
| 0, 10, 18 | under 0.15 s |
| 22 (more than the threads) | one request waited 30 s for a free thread |

A 75-second reply also streamed to the end, even with the default 60-second `GUNICORN_TIMEOUT`, because `gthread`
workers keep beating while a thread streams.

**Rule of thumb:** threads per worker × workers ≥ chats at once + 10. The stock setting gives about 10 comfortable
simultaneous chats. For more, raise `SERVER_THREADS_AMOUNT` (threads are cheap) or `SERVER_WORKER_AMOUNT` (each worker
costs about 300–500 MB).

## Helm (the official chart)

This uses the `apache/superset` chart's `configOverrides`, `extraEnv`, `extraVolumes` and `bootstrapScript`. Chart
0.22.x ships Superset 6.1.0 and 0.15.x ships 5.0.0; the values below render with both (0.22.8 and 0.15.5). Namespace `superset` and release `superset` are examples.

**1. A ConfigMap with the file** (add `build_translations.py` for French):

```sh
kubectl -n superset create configmap superset-lenspack --from-file=lenspack/lenspack_superset.py
```

The chart mounts its own config over `/app/pythonpath`, so the file goes in a folder of its own, added to
`PYTHONPATH`. Use a ConfigMap you create, not the chart's `extraConfigs`: the chart runs those through Helm's `tpl`,
which breaks the `{{ … }}` in the file's templates.

**2. Values**, merged into yours. This is the full version, with the optional driver and French labels:

```yaml
configOverrides:
  lenspack: |
    from lenspack_superset import *  # noqa: F401,F403
  languages: |
    LANGUAGES = {"en": {"flag": "us", "name": "English"}, "fr": {"flag": "fr", "name": "French"}}

extraEnv:
  PYTHONPATH: /app/pythonpath:/app/lenspack
  LENSPACK_INTERNAL_URL: http://lenspack.superset.svc.cluster.local:8795
  ENABLE_PROXY_FIX: "True"          # only if your config reads it; see "Behind a proxy or ingress"

extraVolumes:
  - { name: lenspack, configMap: { name: superset-lenspack } }
extraVolumeMounts:
  - { name: lenspack, mountPath: /app/lenspack, readOnly: true }

bootstrapScript: |
  #!/bin/bash
  # ...your existing lines (e.g. psycopg2-binary for the metadata database)...
  uv pip install --no-cache --python /app/.venv/bin/python "clickhouse-connect>=0.13,<1.0"
  # Optional, French labels: rebuilt at each pod start (on 5.0 this needs GitHub); the page stays English if it fails.
  python /app/lenspack/build_translations.py fr || echo "French labels skipped"
```

- **`bootstrapScript` replaces the chart's default.** Keep the lines you already have.
- **Override order.** The chart writes `configOverrides` into `superset_config.py` in key order. If one of your
  overrides sets `FLASK_APP_MUTATOR` and sorts after `lenspack`, it wins over Lenspack's. Chain the two as described in
  [step 1](#1-the-import-line).
- **Merging lists.** With a second `-f` file, Helm replaces lists rather than merging them. If your values already set
  `extraVolumes` or `extraVolumeMounts`, add these entries to yours.

`helm upgrade` with these values restarts the Superset pods.

**3. Lenspack.** Use [`../deploy/k8s/lenspack.yaml`](../deploy/k8s/lenspack.yaml) as the template: a Deployment with one replica and a
Service on port 8795, with no Ingress. Change these:
- the image, to `ghcr.io/theflywheel/lenspack:bfbad69` (keep the template's `args`, which start its Superset mode);
- `LENSPACK_SUPERSET_URL`, to your Superset Service (e.g. `http://superset:8088`);
- the Secret holding `SUPERSET_ADMIN_PASSWORD` and the LLM key.

Name the Service `lenspack`, or change `LENSPACK_INTERNAL_URL`. Put the config in a ConfigMap with the key
`lenspack-superset.yaml`:

```sh
kubectl -n superset create configmap lenspack --from-file=lenspack-superset.yaml=lenspack/lenspack-superset.yaml
```

Mount a small PVC at `/data`, not the template's `emptyDir`, to keep the account, the settings and the audit log across restarts.

**4. Datasets and dashboards.** Run `setup.mts` as a one-off Job on the Lenspack image ([`../deploy/k8s/setup-job.yaml`](../deploy/k8s/setup-job.yaml)
shows how), or import them as in [Datasets and dashboards](#datasets-and-dashboards). Then restart Lenspack:
`kubectl -n superset rollout restart deploy/lenspack`.

Your Ingress needs no change for Lenspack. Raise its read timeout if it is under two minutes ([below](#behind-a-proxy-or-ingress)).

## The list-filter fix

**The problem.** Flask-AppBuilder keeps a list request's filters on the API view object. Each Superset worker has one
such object, shared by all its threads; gunicorn's `gthread` workers run 20 threads by default. Two requests like
`GET /api/v1/dataset/?q=(filters:…)` arriving together can therefore swap filters, and a lookup of dataset A answers
with dataset B, or with nothing. Lenspack looks datasets up by name, so it hits this. So can Superset's own list pages
under load.

On a stock Superset 5.0.0 with two workers, two runs of the check below gave 22 and 9 wrong answers out of 320 concurrent
name lookups. With the fix, there were none. Chart data (`/api/v1/chart/data`) isn't affected; it builds its query per request.

**The fix.** `lenspack_superset.py` replaces `ModelRestApi._handle_filters_args` with a version that builds the filters
per request, the same way Flask-AppBuilder builds them at start-up. It's applied when the config loads. A
Flask-AppBuilder version that already builds them per request is left alone.

**Does your version need it?** Every Flask-AppBuilder release from 4.5.5 (Superset 5.0) to 5.3.0 (Superset 6 and
`master`) has the shared filters. To check an installed one, without the fix loaded:

```sh
docker compose exec superset python -c "import inspect, flask_appbuilder as f, flask_appbuilder.api as a; \
print(f.__version__, 'affected' if 'self._filters' in inspect.getsource(a.ModelRestApi._handle_filters_args) else 'not affected')"
```

To see it in a running Superset, fire a few hundred concurrent lookups for different dataset names and count the
answers that name another dataset. The check below signs in as an admin; `NAMES` are dataset names that exist.

```sh
docker compose exec -T -e LP="$SUPERSET_ADMIN_PASSWORD" -e NAMES="ni_coverage ni_visits ni_missed ni_facilities" superset python - <<'EOF'
import concurrent.futures as cf, json, os, urllib.parse, urllib.request
B = "http://localhost:8088"
login = urllib.request.Request(B + "/api/v1/security/login", headers={"content-type": "application/json"},
    data=json.dumps({"username": "admin", "password": os.environ["LP"], "provider": "db"}).encode())
token = json.load(urllib.request.urlopen(login))["access_token"]
def lookup(name):
    q = urllib.parse.quote(f"(filters:!((col:table_name,opr:eq,value:'{name}')),columns:!(table_name))")
    r = urllib.request.Request(f"{B}/api/v1/dataset/?q={q}", headers={"authorization": "Bearer " + token})
    res = json.load(urllib.request.urlopen(r, timeout=30))["result"]
    return len(res) == 1 and res[0]["table_name"] == name
names = os.environ["NAMES"].split() * 80
with cf.ThreadPoolExecutor(32) as ex:
    wrong = sum(not ok for ok in ex.map(lookup, names))
print(f"{wrong} of {len(names)} lookups answered with another dataset")
EOF
```

## Behind a proxy or ingress

Lenspack needs nothing from your proxy. A few existing settings affect it:

- **ProxyFix.** Behind a proxy, Superset should trust its `X-Forwarded-*` headers (`ENABLE_PROXY_FIX = True`), so
  that links use the public scheme and host. Lenspack's links to dashboards come from the same request. Most
  deployments behind a proxy already set it. Without a proxy, leave it off: a client could then set those headers.
- **Read timeout.** A chat reply can pause for a while between chunks while the model works. nginx's default
  60-second `proxy_read_timeout` is usually enough, but 300 s is safer (ingress-nginx:
  `nginx.ingress.kubernetes.io/proxy-read-timeout: "300"`).
- **Buffering.** The route sends `X-Accel-Buffering: no`, which nginx and ingress-nginx honour. Other proxies may
  need buffering off for `/lenspack/`.
- **Body size.** The overlay saves dashboards through Superset's API. Keep `client_max_body_size` at least `20m` if you lowered it.
- **CSP.** If you've tightened `TALISMAN_CONFIG`, keep `'self'` in `script-src` and `connect-src`.
- **Cookies and paths.** The chat route is part of Superset, so if Superset works, the session reaches it.

**Upgrading from an older setup.** Earlier versions served Lenspack through a proxy rule with an `auth_request`
sign-in check, and had a separate page with the chat beside the dashboard, on a port of its own. Both are gone: when
you upgrade, remove the `/lenspack/` proxy locations or Ingress, and any `LENSPACK_BESIDE_*`, `LENSPACK_URL` or
`LENSPACK_SETTINGS_TOKEN` variables.

## What needs a restart

| Change | Restart |
|---|---|
| `superset_config.py`, `lenspack_superset.py`, the driver | Superset (all its pods or containers) |
| French translation files | Superset |
| `SECRET_KEY` | Superset, then Lenspack (it fetches the derived key at start) |
| `lenspack-superset.yaml`, the LLM key, `LENSPACK_EDIT_POLICY`, `LENSPACK_HOST_POLICY`, `LENSPACK_AUDIT_RETENTION_DAYS` | Lenspack |
| Datasets or saved metrics that Lenspack reads | Lenspack: it reads them at start |
| Who owns a dashboard, users' roles | Nothing; checked on every request |
| Dataset permissions and row-level security rules (with `hostPolicy: superset`) | Nothing; reach the chat within a minute |
| Chat model, effort and language, set on the AI assistant page | Nothing; applied to the next message |
| New dashboards | Nothing |

## Roll back

1. Remove the `from lenspack_superset import *` line (Helm: the `lenspack` override), the mount, and anything you added
   from this guide (`PYTHONPATH`, `LENSPACK_*`, the driver install).
2. Restart Superset. The overlay, the `/lenspack/` route and the AI assistant page are gone.
3. Stop and remove the Lenspack container and its volume (Helm: its Deployment, Service, ConfigMap and PVC).
4. Optional: delete the `lenspack` user and what `setup.mts` made. Delete the dashboards and datasets first:
   Superset won't delete a database connection that still has datasets.

Charts that Lenspack saved are ordinary Superset charts; they stay unless you delete them.

## Plain Kubernetes manifests

[`../deploy/k8s/`](../deploy/k8s/) deploys this folder's own Superset image, which has the driver, the French labels and
`lenspack_superset.py` built in. The stock image works there too, the same way as with Helm:
- the ConfigMap volume at `/app/lenspack`, plus `PYTHONPATH`, on the Superset Deployment and its init Job;
- the import line in the config;
- a start command that installs `clickhouse-connect` (and builds the French labels) before `/usr/bin/run-server.sh`,
  running as root.

## Troubleshooting

- **No Ask Lenspack button.**
  - Check that the module loaded: `python -c "import lenspack_superset"` in the Superset container.
  - Signed in, check that the page source has `/lenspack/overlay.js`. If it doesn't, the import line isn't reached,
    or a `FLASK_APP_MUTATOR` set after it replaced Lenspack's.
  - If `/lenspack/overlay.js` answers 502, Superset can't reach Lenspack: check `LENSPACK_INTERNAL_URL` from inside
    the Superset container.
- **Every chat request answers 401 "sign in to Superset first" although you are signed in.** Lenspack has no signing
  key. Its log says why: usually that Superset wasn't up yet, or that `lenspack_superset.py` isn't loaded. Restart
  Lenspack once Superset is up. After a `SECRET_KEY` change, restart Lenspack.
- **Lenspack keeps restarting.**
  - Read its log. "No Superset account for Lenspack" means `SUPERSET_ADMIN_PASSWORD` is missing or wrong on a first
    start, or the saved account no longer signs in.
  - "not found" means a dataset in its config doesn't exist yet (step 5).
  - "Invalid pack" names the config line at fault.
- **Someone can ask but every change is refused.** Under the default policy, that is Superset saying they can't edit
  that dashboard: make them an owner (with a role that has `can_write` on Dashboard), or set
  `LENSPACK_EDIT_POLICY=signed-in`. The audit log records each refusal.
- **Someone's chat has no data, or misses a dataset.** With `hostPolicy: superset`, their Superset roles don't give
  them access to it. Grant access through a role, or check Lenspack's log for a row-level security rule it couldn't
  apply ("access:" lines name the rule and why).
- **The AI assistant page can't save.** Only admins can change settings. If it says Lenspack is unreachable, see the 502 case above.
