# Superset + Lenspack: start here (DevOps)

This page is for the engineers who deploy and run Superset and the Lenspack chat assistant ("Ask HCM") on eGov's
production clusters with Helm and Argo CD. Read it first. It says what runs, every environment variable and secret,
how to switch it on and off, how to upgrade, what to look for in the logs, and where the deeper docs are.

The deployment is two draft pull requests in `HCM-BAUCHI/Nigeria-DevOps`:

- [#99](https://github.com/HCM-BAUCHI/Nigeria-DevOps/pull/99) adds Lenspack's plugin to the existing
  `backbone-services/superset` chart;
- [#100](https://github.com/HCM-BAUCHI/Nigeria-DevOps/pull/100) adds the Lenspack server chart,
  `backbone-services/lenspack`, its Secret and its Argo CD entry.

Both are **off by default** and read one shared `lenspack:` block in `environments/bauchi-central-prd.yaml`. Everything
below was checked against the chart templates in those PRs (#99 at `3664857`, #100 at `41221a6`, rendered together with
`helm template`). Values written `{{…}}` are not known yet and are marked "<-- needs updating".

## What runs

| Piece | Kind and name (namespace `superset`) | Image | Notes |
|---|---|---|---|
| Lenspack server | Deployment `lenspack`, 1 replica, strategy `Recreate` | `ghcr.io/theflywheel/lenspack:70f1003` (public, no pull secret) | Starts with `superset --config /config/superset.yaml`. Runs as user 1000, read-only root filesystem, no service account token. Keep one replica: it keeps per-process state. |
| Its config | ConfigMap `lenspack-config` (`superset.yaml`) | | Built by the chart from the env file's `lenspack:` block. A change restarts the pod (checksum annotation). |
| Its state | PVC `lenspack-data`, 5 GiB, `gp3`, ReadWriteOnce, mounted at `/data` | | Settings changed on the settings page, the audit log, usage records. Argo CD never prunes it (`Prune=false`). |
| Its address | Service `lenspack`, ClusterIP, port 8795 | | **No Ingress.** Only Superset talks to it. |
| Optional | NetworkPolicy `lenspack` (`networkPolicy.enabled`, off) | | Lets only pods labelled `app: superset` reach port 8795, where the network plugin enforces it. |
| Superset's side | Existing Deployment `superset`: one more init container, `copy-lenspack-plugin` | the same Lenspack image and tag | Copies one file, `lenspack_superset.py`, into an `emptyDir` at `/app/lenspack`. `superset_config.py` imports it. Superset stays on the stock `apache/superset:6.1.0` image. |
| Superset setup | Existing `setup` init container | | Also creates two Superset roles, `Lenspack user` and `Lenspack admin` (no permissions), and the `lenspack` login (Superset `Admin` role, password from the Secret). |
| Argo CD | `lenspack` in the egov backbone ApplicationSet: app `egov-lenspack` | | Same wiring as `superset`: auto-sync with self-heal, **prune off**. |

**One dashboard.** The assistant is switched on for the Gabon ITN dashboard only (id 25). Its Ask button shows nowhere
else, and the server refuses chat requests about any other dashboard, for everyone, admins included.

**One switch, one version.** `lenspack.enabled` and `lenspack.image.tag` in the env file drive both charts, so the
plugin inside Superset and the server always come from the same Lenspack version.

## Network path

```
browser ─► ingress (gabon-hcm.digit.org/superset) ─► Superset :8088
                                                       │  /superset/lenspack/…  signed-in users only,
                                                       │  with a signed header saying who is asking
                                                       ▼
                                                     lenspack :8795 (ClusterIP)
                                                       ├─► Superset's REST API, in-cluster, as the "lenspack" login
                                                       │   http://superset.superset.svc.cluster.local:8088/superset
                                                       └─► api.anthropic.com:443 (the model)
```

- Browsers only ever reach Superset. The ingress doesn't change; its existing 300 s read timeout suits streamed chat
  replies, and the plugin turns nginx buffering off for them.
- Lenspack never connects to ClickHouse or Postgres. Every number comes from Superset, through Superset's permissions.
- The key that signs "who is asking" is derived from Superset's `secret-key`, so there is no extra shared secret.
- **Egress:** the Lenspack pod needs HTTPS to `api.anthropic.com`. Nothing else, while the microphone stays off.
- Optional, separate from Lenspack: `superset.ingress.proxyBufferSize: 16k` avoids 502s caused by Superset 6.1.0's
  growing session cookie.

## Every environment variable and secret

### Lenspack server container (`lenspack`)

| Variable | Value | Comes from | Required | If missing or wrong |
|---|---|---|---|---|
| `LENSPACK_SUPERSET_PASSWORD` | the `lenspack` login's password | Secret `superset-secrets`, key `lenspack-password` | yes | The pod does not start (`CreateContainerConfigError`). |
| `ANTHROPIC_API_KEY` | the model key | Secret `lenspack-secrets`, key `anthropic-api-key` | yes | The pod does not start. cluster-configs writes `lenspack-secrets` only when this key is in the secrets file. |
| `OPENROUTER_API_KEY` | speech-to-text key | Secret `lenspack-secrets`, key `openrouter-api-key` (marked optional) | no | No microphone. The mic is switched off for the pilot anyway (`features.voice: false`). |
| `LENSPACK_STATE_DIR` | `/data` | set by the chart (also the image's default) | set | |
| `LENSPACK_LLM_PROVIDERS` | `[{"name":"claude-haiku-5-5","kind":"anthropic","model":"claude-haiku-5-5"}]` | env file, `lenspack.extraEnv` | yes, for this setup | With only the key, the chat offers Claude Sonnet (the default), Opus and Haiku, which costs more. |
| `LENSPACK_ADMIN_ACCESS` | `superset-users` | env file, `lenspack.extraEnv` | yes, for this setup | Default `superset-role`: holders of the `Lenspack admin` Superset role become admins. |
| `LENSPACK_ADMIN_USERS` | `id:2` (the Superset user `editor`) | env file, `lenspack.extraEnv` | yes, for this setup | Empty: nobody is an admin (a warning in the log). A value that isn't a user name or `id:<n>` stops the server at start. |
| `LENSPACK_USER_ACCESS` | `superset-role,granted` | env file, `lenspack.extraEnv` | no | Default `superset-role`: holders of `Lenspack user`, and admins. |
| `LENSPACK_ADMIN_SURFACE` | `superset` | env file, `lenspack.extraEnv` | no | Default `split`: part of the settings move to Lenspack's own admin panel (still reached through Superset). |
| `LENSPACK_DASHBOARD_SCOPE` | `listed` | env file, `lenspack.extraEnv` | yes, for this setup | Default `any`: the Ask button on every dashboard a person may open in Superset. `listed` with no dashboards listed stops the server at start. |
| `LENSPACK_DASHBOARDS` | `"25"` (the Gabon ITN dashboard; ids separated by commas) | env file, `lenspack.extraEnv` | yes, with `listed` | Missing under `listed`: the server stops at start. A wrong id puts the assistant on the wrong dashboard, or on none. |
| `LENSPACK_HOST`, `NODE_ENV`, `LENSPACK_UI` | `0.0.0.0`, `production`, a folder | the image | | `LENSPACK_UI` is unused in this mode. |

Not set, and not needed here: `SUPERSET_ADMIN_USERNAME` / `SUPERSET_ADMIN_PASSWORD` (Superset's setup makes the
`lenspack` login, so Lenspack never needs an admin password) and `LENSPACK_ADMIN_PASSWORD(S)` (no password sign-in).
The chart sets `enableServiceLinks: false`, because Kubernetes would otherwise inject `LENSPACK_PORT=tcp://…`, which
Lenspack reads as its port. Anything else goes in `lenspack.extraEnv`; every variable Lenspack reads is in
[Lenspack's configuration reference](https://github.com/theflywheel/lenspack/blob/main/docs/reference/config.md#environment-variables).

### Superset web container (`superset`) and `setup` init container: what Lenspack adds

Only while `lenspack.enabled` is true. Superset's own variables (`SUPERSET_SECRET_KEY`, database, Redis) don't change.

| Variable | Value | Comes from | Container | Required | If missing or wrong |
|---|---|---|---|---|---|
| `LENSPACK_INTERNAL_URL` | `http://lenspack.superset.svc.cluster.local:8795` | set by the chart (`lenspack.internalUrl`) | web, setup | no (default `http://lenspack:8795`) | The Ask button's requests answer 502 "The assistant's server is not reachable". |
| `LENSPACK_SERVICE_USER` | `lenspack` | set by the chart (`lenspack.serviceUser`) | web, setup | no (default `lenspack`) | Must match the server's Superset login. If not, named admins never get the menu entry. |
| `LENSPACK_CLICKHOUSE_LABEL_SUFFIX` | `on` | set by the chart | web, setup | no (default `on`) | `off`: ClickHouse charts with a metric named like its column fail with error 184 on Superset 6.1. |
| `LENSPACK_PASSWORD` | the `lenspack` login's password | Secret `superset-secrets`, key `lenspack-password` (marked optional) | setup only | for the chat | Missing or under 24 characters: setup logs a `WARNING` and doesn't create or update the login. Superset starts normally, but Lenspack can't sign in. |

### `copy-lenspack-plugin` init container

No environment variables. Command: `cp /app/packages/hosts/superset/plugin/lenspack_superset.py /app/lenspack/`.
Resources 10m / 16Mi requested, 100m / 64Mi limit. **It runs on Superset's start path:** if the Lenspack image can't be
pulled (a mistyped tag, ghcr.io unreachable), the new Superset pod stays in `Init` and, because Superset uses
`Recreate`, Superset is down until it is fixed. Check that the tag exists before merging a tag change:
`docker manifest inspect ghcr.io/theflywheel/lenspack:<tag>`.

### The secrets file (`bauchi-central-prd-secrets.yaml`)

| Key | Value | Becomes |
|---|---|---|
| `cluster-configs.secrets.superset.lenspack-password` | `{{lenspack login password}}` <-- needs updating (24+ characters, for example `openssl rand -base64 32`) | key `lenspack-password` in `superset-secrets`; read by Superset's setup and by the Lenspack server |
| `cluster-configs.secrets.lenspack.anthropic-api-key` | `{{anthropic api key}}` <-- needs updating | Secret `lenspack-secrets` in namespace `superset` |
| `cluster-configs.secrets.lenspack.openrouter-api-key` | leave out for the pilot | the optional speech key |

To rotate the login password: change it in the secrets file, sync `cluster-configs`, restart Superset (setup resets the
login to the new value), then restart Lenspack.

### Config keys you set (the env file's `lenspack:` block)

| Key | Pilot value | Chart default |
|---|---|---|
| `enabled` | `false` now, `true` to switch on | `false` |
| `image.tag` | `70f1003` | `70f1003` |
| `datasets` | the seven Gabon ITN datasets in schema `analytics` | none: the chart refuses to render without them |
| `extraEnv` | the seven variables above | none |
| `config.auth.users` | `["Lenspack user"]` (held by nobody at launch) | the same |
| `config.scope`, `language`, `brand`, `overlay` | campaign scope, French, "Ask HCM", the vocabulary for the Gabon datasets | |
| `config.features.cache` | `false` (saved answers keep the words of questions) | on |
| `config.budget.usdPerDay` | not set, so the default | `20` (USD per UTC day, the whole deployment) |
| `config.audit.retentionDays` | not set | `30` |
| `config.hostPolicy`, `editPolicy`, `editScope` | not set | `superset`, `superset`, `own` |
| `config.features.voice`, `personalDashboards` | not set | `false`, `false` |
| `persistence`, `resources`, `networkPolicy.enabled` | not set | 5Gi `gp3`; see below; `false` |

Values an admin later changes on the settings page (switches, models, language) are kept on the volume and win over
the ConfigMap. All the keys are in [Lenspack's configuration reference](https://github.com/theflywheel/lenspack/blob/main/docs/reference/config.md#supersetyaml).
Why each pilot value was chosen: [gabon-pilot-config-notes.md](gabon-pilot-config-notes.md).

## Ports, probes, resources

| | Lenspack server |
|---|---|
| Port | 8795 (`http`) |
| Startup probe | `GET /healthz`, every 10 s, up to 30 failures |
| Readiness probe | `GET /readyz`, every 15 s. Ready only once Superset has handed over the signing key. Until then it refuses every chat and keeps retrying on its own. |
| Liveness probe | `GET /healthz`, every 30 s, 5 failures. Never point it at `/readyz`, or a Superset without the plugin would restart Lenspack in a loop. |
| Resources | requests 100m CPU / 256Mi, limits 1 CPU / 1Gi |
| Storage | `/data` on the PVC; `/tmp` on an `emptyDir` |

Superset's own probes (`/superset/health`) and its 2 workers × 20 threads are unchanged. Each chat reply holds one
Superset thread while it streams (30–60 s), so about 30 chats can run at once with room left for dashboards.

## Switch on

1. **Check the image exists:** `docker manifest inspect ghcr.io/theflywheel/lenspack:70f1003`. Superset's init container
   pulls it on every start, so a wrong tag keeps Superset in `Init`.
2. **Before:** the seven datasets and dashboard 25 exist in Superset. The owner is already set: `id:2`, the
   Superset user `editor` (no role changes needed).
3. **Secrets:** add the two keys above and sync `cluster-configs`. Check that `lenspack-secrets` exists in `superset`
   and that `superset-secrets` has `lenspack-password`. Without them the Lenspack pod stays in
   `CreateContainerConfigError`.
4. **Render and diff** with the deployer (`go run main.go deploy -e bauchi-central-prd superset -p`, and the same for
   `lenspack`), before and after the change. Switching on adds about 80 lines to Superset's render (the init container,
   a volume, the variables, the setup steps) and four Lenspack objects (ConfigMap, Deployment, PVC, Service).
5. **Set `lenspack.enabled: true`** on `ng-central-prd`. Argo CD syncs `egov-superset` (Superset restarts once; with
   `Recreate` that is a short outage) and `egov-lenspack` (the server starts).
6. **Check** the log lines below, then sign in as `editor`: "Demander à HCM" shows on the Gabon dashboard and
   on no other dashboard, a question gets an answer, and Settings → Manage → AI assistant opens. Any other login sees no
   button. Signed out, `/superset/lenspack/overlay.js` answers 401.

## Log lines to check

| Where | Command | Good | Bad |
|---|---|---|---|
| Superset setup | `kubectl -n superset logs deploy/superset -c setup` | `created role Lenspack user`, `created user lenspack` (later starts: nothing, or `reset password of lenspack`) | `WARNING: superset-secrets has no lenspack-password of at least 24 characters` |
| Superset web | `kubectl -n superset logs deploy/superset -c superset` | no Lenspack errors | `Lenspack plugin not loaded; Superset runs without it` |
| Lenspack | `kubectl -n superset logs deploy/lenspack` | `lenspack-superset: pack itn_gabon: 7 datasets, …`; `identity: signed by Superset; edit policy superset; host policy superset; audit … (30 days); Superset account lenspack (env)`; `admins: named Superset users (1 owner from LENSPACK_ADMIN_USERS, …`; `users: … (access superset-role,granted, from LENSPACK_USER_ACCESS)`; `admin pages: superset …`; `dashboards: listed (25 …)`; a line starting `http://0.0.0.0:8795/` that says `chat on` | `identity: NO KEY (still trying)` is fine for a while: wait for `identity key fetched from Superset after N tries`. Any `warning:` line deserves a read. |

## Switch off, roll back, upgrade

**Switch off.** Set `lenspack.enabled: false`. Superset goes back to exactly today's render (it restarts once). Argo CD
does not prune, so prune `egov-lenspack` in Argo CD to remove the server. The PVC stays until you delete it by hand.
Two things stay in Superset: the two roles and the `lenspack` login, which has the `Admin` role. Deactivate or delete
that login in Settings → List Users. Charts the chat saved are ordinary Superset charts and stay.

**Without a redeploy.** An admin can hide the Ask button for everyone (the "Ask Lenspack button" switch) or turn off
dashboard edits (the "Dashboard edits" switch) on the settings page.

**Upgrade Lenspack.**
1. Read [Lenspack's changes](https://github.com/theflywheel/lenspack/commits/main) between the two versions and
   [the upgrade notes](https://github.com/theflywheel/lenspack/blob/main/docs/hosts/superset/upgrading.md).
2. Snapshot the volume behind `lenspack-data`.
3. Check the new tag exists: `docker manifest inspect ghcr.io/theflywheel/lenspack:<tag>` (tags are commits of
   Lenspack's `main`).
4. Change `lenspack.image.tag` in the env file. That one value moves both charts. A tag given on the deployer's command
   line does not override it.
5. Render and diff: only the image lines and the config checksum should change. Merge. Superset restarts once (new
   plugin), and Lenspack is replaced (a few seconds without chat).
6. Check the log lines above.

**Roll back an upgrade.** Put the previous tag back. Restore the snapshot only if the new version wrote something you
don't want.

**Upgrade Superset.** The plugin supports Superset 6.1 (and 5.0). See
[Lenspack's Superset versions page](https://github.com/theflywheel/lenspack/blob/main/docs/hosts/superset/versions.md).

## Who administers what

Admins are named people, not a Superset role (`LENSPACK_ADMIN_ACCESS=superset-users`). The pilot team's Superset account
is the **owner**, named by its user id in `LENSPACK_ADMIN_USERS`; owners can only be changed there, with a restart. The
owner adds other admins and users on the **Access** page of the AI assistant settings, which take effect on their next
request with no redeploy. Holding a Superset role, even `Admin`, grants no admin rights to the assistant, so the
`Lenspack admin` role the chart creates is unused. Users are the people an admin adds, or holders of `Lenspack user`;
nobody else sees the Ask button. All settings pages are inside Superset, at Settings → Manage → AI assistant
(`/superset/ai-assistant/`). Being an admin or a user never shows anyone more data than Superset already lets them see.
DevOps doesn't need to be an admin to run the service. **Coming:** an admin API key, so that an operator can manage the
assistant without a Superset account or access to the server. It is being built in Lenspack and not released yet; this
page will list its secret when it is.
Details: [Who can use and administer the assistant](https://github.com/theflywheel/lenspack/blob/main/docs/access/admin-access.md).

## Data that leaves the cluster, and the spend cap

- **To Anthropic, on every chat turn:** the vocabulary (dataset and column labels, instructions, examples), the recent
  conversation, and **the rows the assistant reads** to answer: mostly totals and counts by group. Columns listed in
  `overlay.exclude` (household ids, coordinates, net codes, complaint ids) are never read or sent. Credentials, SQL and
  host names are never sent.
- **Kept on the volume:** the audit log for 30 days (questions, answers, result rows, who asked), usage records (user,
  tokens, cost; nothing deletes old lines, so trim `usage.jsonl` once in a while), settings, and usage telemetry for
  90 days (question text off by default). Saved answers are off.
- **Spend cap:** 20 USD per UTC day for the whole deployment. When it is reached the chat answers "today's budget is used
  up" (HTTP 429) until 00:00 UTC. It survives restarts. Change it with `config.budget.usdPerDay` in the env file.

More: [Privacy](https://github.com/theflywheel/lenspack/blob/main/docs/operating/privacy.md),
[Costs](https://github.com/theflywheel/lenspack/blob/main/docs/operating/costs.md),
[What Lenspack keeps on disk](https://github.com/theflywheel/lenspack/blob/main/docs/operating/state.md).

## When something is wrong

| You see | Likely cause | Do this |
|---|---|---|
| `lenspack` pod in `CreateContainerConfigError` | a missing Secret or key | add the secret, sync `cluster-configs` |
| Superset pod stuck in `Init` | the Lenspack image tag can't be pulled | fix `lenspack.image.tag`, or switch off |
| Lenspack exits: `is not a user id` | `LENSPACK_ADMIN_USERS` changed to something that isn't a user name or `id:<n>` | put back `id:2` |
| Lenspack exits: `… is "listed" but … lists none` | `LENSPACK_DASHBOARDS` empty or missing | list the dashboard ids |
| no Ask button on some dashboard | expected: only dashboard 25 is listed | add its id to `LENSPACK_DASHBOARDS` if it should have one |
| Lenspack exits: `Superset dataset "…": not found` | a dataset in `datasets` doesn't exist in Superset | create it, or fix the name (`schema.table`) |
| `Superset sign-in failed (401)` | the `lenspack` login wasn't created (see the setup `WARNING`) or Superset wasn't restarted after a password change | fix the secret, restart Superset, then Lenspack |
| pod 0/1 ready for a long time, `NO KEY` | the plugin isn't loaded, or Superset is down | look for `Lenspack plugin not loaded` in Superset's log |
| no Ask button for the owner | wrong user id, or the plugin isn't loaded | check `/superset/api/v1/me/`; signed in, `/superset/lenspack/healthz` gives 404 (no plugin) or 502 (server unreachable) |
| every chat says access "could not be checked" | Superset answered without the plugin | check every Superset process loads the plugin |
| "today's budget is used up" | the spend cap | wait for 00:00 UTC, or raise it |
| settings won't save (503) | the volume is full or read-only | free space or fix the mount |

Everything else: [Lenspack's troubleshooting page](https://github.com/theflywheel/lenspack/blob/main/docs/operating/troubleshooting.md).

## Further reading

- [gabon-pilot-config-notes.md](gabon-pilot-config-notes.md): the decisions behind the pilot's settings, and the steps
  before go-live.
- The PRs: [#99](https://github.com/HCM-BAUCHI/Nigeria-DevOps/pull/99) and
  [#100](https://github.com/HCM-BAUCHI/Nigeria-DevOps/pull/100) (the "Values to set" tables and render checks).
- [ARCHITECTURE.md](ARCHITECTURE.md): how the signed route and the assistant work, if you want the design.
- Lenspack's operator docs: [deploying](https://github.com/theflywheel/lenspack/blob/main/docs/operating/deploying.md),
  [feature switches](https://github.com/theflywheel/lenspack/blob/main/docs/operating/switches.md),
  [the settings pages](https://github.com/theflywheel/lenspack/blob/main/docs/features/admin-panel.md).
