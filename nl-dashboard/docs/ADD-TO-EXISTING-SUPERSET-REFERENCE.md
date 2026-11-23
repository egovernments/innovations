# Add Lenspack to an existing Superset 5: reference

The detail behind the [quickstart](ADD-TO-EXISTING-SUPERSET.md): what each step does and why, the options it leaves
out, the full Helm and Kubernetes setup, and troubleshooting. Steps are numbered as in the quickstart.

When you're done you will have:
- an **Ask Lenspack** button on Superset's dashboard pages, which answers questions and edits the dashboard;
- an **AI assistant** page for admins under Settings → Manage;
- optionally, Superset's interface in French.

Everything is configuration: one Python module, two templates, a few environment variables, a proxy rule, and a
Lenspack container next to Superset. You don't need this repository's Superset image or a fork. To remove it, take
those out and restart ([Roll back](#roll-back)).

The Docker Compose steps were tested by following them literally on a stock `apache/superset:5.0.0`, with its own
Postgres, Redis and nginx, reading HCM analytics from ClickHouse. The Helm values were checked by rendering them with
chart 0.15.5, not by installing them.

## Contents

- [Before you start](#before-you-start)
- [What gets added](#what-gets-added)
- [Get the files](#get-the-files)
- [Docker Compose, step by step](#docker-compose-step-by-step)
- [French labels](#french-labels)
- [Datasets and dashboards](#datasets-and-dashboards)
- [Helm (the official chart)](#helm-the-official-chart)
- [The service account](#the-service-account)
- [The list-filter fix](#the-list-filter-fix)
- [Proxy, cookies and security headers](#proxy-cookies-and-security-headers)
- [What needs a restart](#what-needs-a-restart)
- [Roll back](#roll-back)
- [Plain Kubernetes manifests](#plain-kubernetes-manifests)
- [Troubleshooting](#troubleshooting)

## Before you start

| You need | Tested with | Notes |
|---|---|---|
| Superset 5.0 | `apache/superset:5.0.0` (Flask-AppBuilder 4.5.5) | Superset 6 is untested. |
| A reverse proxy in front of Superset | nginx 1.27; ingress-nginx | Lenspack is served under Superset's own address at `/lenspack/`, and only to people signed in to Superset. |
| The Lenspack image | `ghcr.io/theflywheel/lenspack:superset-58a2101` | Public. This tag is built from Lenspack's `superset` branch until the Superset support reaches `main`; after that, use a `main` tag. |
| An LLM API key | Anthropic (Claude Sonnet, Opus and Haiku 5.5) | Or any OpenAI-compatible API through `LENSPACK_LLM_PROVIDERS`. |
| Your data in Superset | ClickHouse, through `clickhouse-connect` | The stock image has no ClickHouse driver; step 3 adds it. |
| Network access from Superset at start-up | | Only for installing the driver and the French labels, if you take them that way. |

### Running as root

Superset must run as **root** for the driver install in step 3. Superset's own Compose files and the Helm chart
(`runAsUser: 0`) already do. If yours doesn't, install the driver the way you already add Python packages (your own
derived image, or `requirements-local.txt`), and skip that part of step 3.

## What gets added

| What | Why | Where it lives |
|---|---|---|
| `lenspack_superset.py` | Registers the **AI assistant** page (`FLASK_APP_MUTATOR`), tells the overlay where Lenspack is, fixes concurrent list requests in Flask-AppBuilder, and serves the two templates below from a mounted folder | A mounted folder on `PYTHONPATH`, imported at the end of your `superset_config.py` |
| `templates/tail_js_custom_extra.html` | Loads the overlay script on every page; Superset documents this template as overridable. The script tag carries the page's CSP nonce. | Same folder |
| `templates/lenspack/settings.html` | The AI assistant page | Same folder |
| `clickhouse-connect` | Superset's ClickHouse driver | Installed into Superset's virtualenv at start |
| French translations (optional) | Superset's own labels in French; the stock image ships them uncompiled | `/app/superset/translations/fr`, built once by `build_translations.py` |
| A `lenspack` Superset user | Lenspack reads datasets and saves charts as this user | Superset's database |
| `/lenspack/` on your proxy | Same address as Superset; let through only if Superset says the browser is signed in | Your nginx or ingress |
| The Lenspack container | The chat API and the overlay script | Next to Superset |
| Datasets, metrics and dashboards | What Lenspack reads and edits | Superset's database (by `setup.mts`, or by import) |

## Get the files

Run the quickstart's download block in the folder that holds your Compose file, or anywhere for Helm. `REF` is a
branch or commit of this repository.

`lenspack/lenspack-superset.yaml` is Lenspack's config for the HCM ClickHouse datasets that `setup.mts` creates. For your
own datasets, edit its `datasets`, `overlay.entities`, `hierarchies` and `instructions`.

## Docker Compose, step by step

The examples assume your Superset service is called `superset`, and that your proxy is an nginx service in the same
Compose project. Change the names to match.

### 1. Secrets

`LENSPACK_SETTINGS_TOKEN` lets the AI assistant page change Lenspack's chat model and language. Leave it out and the
page is read-only.

### 2. The import line

If your config already sets `FLASK_APP_MUTATOR`, keep yours: after the import, set it back to your function, and call
`lenspack_app_mutator(app)` from inside it.

### 3. The Superset service

Add the block to the `superset` service, and to any other service on the Superset image that loads the same config
(an init job, Celery workers).

- **Keep your own start command** if you have one; put the `uv pip install … &&` in front of it. If you already
  install packages through Superset's `docker-bootstrap.sh` and `requirements-local.txt`, add
  `clickhouse-connect>=0.8,<1.0` there instead.
- **The install runs at every container start.** It needs PyPI and adds a few seconds. To avoid that, build a
  three-line image `FROM apache/superset:5.0.0` that runs the same `uv pip install`.
- **`environment` and `volumes` add to what the service already has.** If you set `PYTHONPATH` already, append
  `:/app/lenspack` to it.
- `LENSPACK_URL` is where browsers load the overlay; `LENSPACK_INTERNAL_URL` is where Superset's server reaches Lenspack.

### 4. Restart Superset

After the restart, sign in as an admin: Settings → Manage now has **AI assistant**. It says Lenspack is unreachable
until step 9.

### 5. The service account

No restart is needed. Read [The service account](#the-service-account) before you use this beyond a demo.

### 6. The Lenspack service

- `SUPERSET_URL` is Superset itself, not the proxy; `SUPERSET_PUBLIC_URL` is where browsers reach Superset.
- Add `lenspack-data: {}` under the top-level `volumes:`. It holds which charts Lenspack made and the settings saved
  from the AI assistant page (`/data/settings.json`).
- Don't start it yet. Lenspack exits until the datasets in its config exist (step 8).

### 7. The proxy

- Add the two locations to the `server` block that serves Superset, next to your `location /`.
- `resolver 127.0.0.11` is Docker's DNS: it picks up a restarted container's new address.
- `auth_request /_superset_me` lets through only browsers signed in to Superset; `proxy_buffering off` is because
  chat replies stream.
- After the reload, signed out, `/lenspack/overlay.js` answers 401.
- The overlay saves dashboards through Superset's API, so keep `client_max_body_size` at least `20m` if you lowered it.
- Without a proxy today, add one: [`../proxy/nginx.conf`](../proxy/nginx.conf) is a complete example.
- More on how the sign-in check and the headers work: [Proxy, cookies and security headers](#proxy-cookies-and-security-headers).

### 8. Datasets and dashboards

See [Datasets and dashboards](#datasets-and-dashboards).

### 9. Start Lenspack

The log names the pack and counts its datasets and measures, then prints the address. Open any dashboard: **Ask
Lenspack** is at the bottom right. Try "Don't change the board. What does this dashboard show?" Then open Settings →
Manage → AI assistant, which now shows the datasets, models and today's usage, and lets you change the chat model.

## French labels

Optional. Superset 5's image has the French catalogue but no compiled files, so switching to French changes nothing.
Build them once into a volume:

1. Add `LANGUAGES` to your `superset_config.py`:
   ```python
   LANGUAGES = {"en": {"flag": "us", "name": "English"}, "fr": {"flag": "fr", "name": "French"}}
   ```
2. Mount a volume on the `superset` service, and declare it under the top-level `volumes:`:
   ```yaml
       volumes:
         - superset-fr:/app/superset/translations/fr
   ```
3. Build the files once (this needs GitHub; the volume keeps them across restarts):
   ```sh
   docker compose run --rm --no-deps --user root --entrypoint python superset /app/lenspack/build_translations.py fr
   ```

Then restart Superset. On Helm, see the `languages` override and the `bootstrapScript` line in [Helm](#helm-the-official-chart).

## Datasets and dashboards

Either create them with `setup.mts`, or import them from another Superset.

**With `setup.mts`** (the quickstart's step 8). This creates the ClickHouse connection in Superset, the `ni_*` datasets
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

## Helm (the official chart)

This uses the `apache/superset` chart's `configOverrides`, `extraEnv`, `extraSecretEnv`, `extraVolumes` and
`bootstrapScript`. Chart 0.15.x ships Superset 5.0.0. Namespace `superset` and release `superset` are examples.

**1. A ConfigMap with the module and templates**, from the files in [Get the files](#get-the-files):

```sh
kubectl -n superset create configmap superset-lenspack \
  --from-file=lenspack/superset/lenspack_superset.py \
  --from-file=lenspack/superset/build_translations.py \
  --from-file=lenspack/superset/templates/tail_js_custom_extra.html \
  --from-file=lenspack/superset/templates/lenspack/settings.html
```

Use a ConfigMap you create, not the chart's `extraConfigs` or `extraSecrets`: the chart runs those through Helm's
`tpl`, which breaks the templates' `{{ … }}`.

**2. Values**, merged into yours. This is the full version, with the optional French labels (the quickstart leaves
them out):

```yaml
configOverrides:
  lenspack: |
    from lenspack_superset import *  # noqa: F401,F403
  languages: |
    LANGUAGES = {"en": {"flag": "us", "name": "English"}, "fr": {"flag": "fr", "name": "French"}}

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
  # Optional, French labels: rebuilt at each pod start, needs GitHub; the page stays English if it fails.
  python /app/lenspack/build_translations.py fr || echo "French labels skipped"
```

- **`bootstrapScript` replaces the chart's default.** Keep the lines you already have.
- **The bootstrap runs as root.** That's the chart's default (`runAsUser: 0`).
- **Override order:** the chart writes `configOverrides` into `superset_config.py` in key order. An override of yours
  that sets `FLASK_APP_MUTATOR` and sorts after `lenspack` wins over Lenspack's; chain the two as described in
  [step 2](#2-the-import-line).
- **Merging lists:** with a second `-f` file, Helm replaces lists rather than merging them. If your values already set
  `extraVolumes` or `extraVolumeMounts`, add these entries to yours.

`helm upgrade` with these values restarts the Superset pods.

**3. The service account**, in a Superset pod:

```sh
kubectl -n superset exec deploy/superset -- superset fab create-user --role Admin --username lenspack \
  --firstname Lenspack --lastname Service --email lenspack@example.org --password '<LENSPACK_SUPERSET_PASSWORD>'
```

**4. Lenspack.** Use [`../k8s/lenspack.yaml`](../k8s/lenspack.yaml) as the template: a Deployment with one replica and a
Service on port 8795. Change these:
- the image, to `ghcr.io/theflywheel/lenspack:superset-58a2101`;
- `SUPERSET_URL`, to your Superset Service (e.g. `http://superset:8088`);
- `SUPERSET_PUBLIC_URL`, to your public address;
- the secret names.

Name the Service `lenspack`, or change `LENSPACK_INTERNAL_URL`. Put the config in a ConfigMap with the key
`lenspack-superset.yaml`:

```sh
kubectl -n superset create configmap lenspack --from-file=lenspack-superset.yaml=lenspack/lenspack-superset.yaml
```

For the settings saved from the AI assistant page to survive a restart, mount a small PVC at `/data` instead of the
template's `emptyDir`.

**5. The ingress for `/lenspack/`**, on the same host as Superset. See [`../k8s/ingress.yaml`](../k8s/ingress.yaml): a
second Ingress with
`nginx.ingress.kubernetes.io/auth-url: http://superset.superset.svc.cluster.local:8088/api/v1/me/`, a rewrite that
strips `/lenspack`, `proxy-buffering: "off"`, and 600-second read and send timeouts.

**6. Datasets and dashboards.** Run `setup.mts` as a one-off Job on the Lenspack image ([`../k8s/setup-job.yaml`](../k8s/setup-job.yaml)
shows how), or import as in [Datasets and dashboards](#datasets-and-dashboards). Then restart Lenspack:
`kubectl -n superset rollout restart deploy/lenspack`.

## The service account

Lenspack signs in to Superset as `lenspack`. It reads datasets and metrics, runs chart data, creates charts, and saves
dashboard layouts. This guide gives it the **Admin** role, which is what has been tested.

- Anyone who can open the chat can change, through Lenspack, any dashboard Lenspack can edit. The proxy only checks
  that a person is signed in to Superset, not who they are.
- A narrower role is possible but untested: Superset's **Alpha** role, with `lenspack` added as an owner of each
  dashboard it should edit. Superset only lets owners and admins change a dashboard.

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
answers that name another dataset. The check below signs in as `lenspack`; `NAMES` are dataset names that exist.

```sh
docker compose exec -T -e LP="$LENSPACK_SUPERSET_PASSWORD" -e NAMES="ni_coverage ni_visits ni_missed ni_facilities" superset python - <<'EOF'
import concurrent.futures as cf, json, os, urllib.parse, urllib.request
B = "http://localhost:8088"
login = urllib.request.Request(B + "/api/v1/security/login", headers={"content-type": "application/json"},
    data=json.dumps({"username": "lenspack", "password": os.environ["LP"], "provider": "db"}).encode())
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

## Proxy, cookies and security headers

- **One address.** With Lenspack at `/lenspack/` on Superset's host, the overlay script, its API calls and Superset's
  session cookie are all same-origin. Superset's default security headers (Talisman's CSP) stay on: the overlay's
  script tag carries the page's nonce, and its requests go to `'self'`. If you've tightened `TALISMAN_CONFIG`, keep
  `'self'` in `script-src` and `connect-src`.
- **The sign-in check** passes the browser's cookies to Superset's `GET /api/v1/me/`, which answers 401 when nobody is
  signed in. Superset's default cookie settings work. If you serve Superset under a path prefix, or set
  `SESSION_COOKIE_PATH`, the cookie must still reach `/lenspack/`.
- **ProxyFix.** Behind a proxy, Superset should trust its `X-Forwarded-*` headers (`ENABLE_PROXY_FIX = True`), so
  links and redirects use the public scheme and host. Most deployments behind a proxy already have it.
- **The beside page.** Lenspack can also show the chat next to a dashboard on a page of its own, on another port. It
  needs `LENSPACK_BESIDE_ORIGINS`, which replaces your `TALISMAN_CONFIG` with Superset's default plus those origins in
  `frame-ancestors`. This guide doesn't set it up.

## What needs a restart

| Change | Restart |
|---|---|
| `superset_config.py`, `lenspack_superset.py`, the templates, `LENSPACK_*` variables on Superset, the driver | Superset (all its pods or containers) |
| French translation files | Superset |
| The `lenspack` user's role | Nothing |
| The `lenspack` user's password | Lenspack, after changing `LENSPACK_SUPERSET_PASSWORD` to match |
| The proxy locations | `nginx -s reload`, or nothing on ingress-nginx |
| `lenspack-superset.yaml`, the LLM key, `LENSPACK_SETTINGS_TOKEN` | Lenspack |
| Datasets or saved metrics that Lenspack reads | Lenspack: it reads them at start |
| Chat model, effort and language, set on the AI assistant page | Nothing; applied to the next message |
| New dashboards | Nothing |

## Roll back

1. Remove the `from lenspack_superset import *` line (Helm: the `lenspack` override). Then remove the `PYTHONPATH`,
   `LENSPACK_*` and volume additions, and the driver install from the start command or bootstrap script.
2. Restart Superset. The overlay and the AI assistant page are gone.
3. Remove the two proxy locations and reload nginx, or delete the `/lenspack` Ingress.
4. Stop and remove the Lenspack container and its volume (Helm: its Deployment, Service, ConfigMap and PVC).
5. Optional: delete the `lenspack` user, and what `setup.mts` made. Delete the dashboards and datasets first:
   Superset won't delete a database connection that still has datasets.

Charts that Lenspack saved are ordinary Superset charts; they stay unless you delete them.

## Plain Kubernetes manifests

[`../k8s/`](../k8s/) deploys this folder's own Superset image, which has the driver, the French labels and these
files built in. The stock image works there too, the same way as with Helm:
- the ConfigMap volume at `/app/lenspack`, plus `PYTHONPATH` and the `LENSPACK_*` variables on the Superset Deployment
  and its init Job;
- the import line in the config;
- a start command that installs `clickhouse-connect` (and builds the French labels) before `/usr/bin/run-server.sh`,
  running as root.

The cost is a package install, and a download from GitHub, at every pod start. A built image avoids both.

## Troubleshooting

- **No Ask Lenspack button.**
  - Check that the module loaded: `python -c "import lenspack_superset"` in the Superset container.
  - Check that the page source has `/lenspack/overlay.js`. If it's missing, the template isn't being used: check
    that `/app/lenspack/templates` is mounted.
  - If the script is there but 401s, you aren't signed in, or the proxy's cookie check isn't reaching Superset.
- **AI assistant page says Lenspack is unreachable.** `LENSPACK_INTERNAL_URL` must be reachable from Superset's
  server, not only from browsers.
- **Lenspack keeps restarting.**
  - Read its log. "not found" means a dataset in its config doesn't exist yet (step 8).
  - "Invalid pack" names the config line at fault.
- **Settings page is read-only.** `LENSPACK_SETTINGS_TOKEN` must be set to the same value on both Superset and
  Lenspack.
