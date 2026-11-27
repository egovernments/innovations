# Superset + Lenspack: start here (DevOps)

This page is for the engineers who deploy and run Superset and the Lenspack chat assistant ("HCM Assistant", button
"Ask HCM") on eGov's production clusters with Helm and Argo CD. Read it first. It says what runs, every environment
variable and secret, how it is switched on and off, how to upgrade, what to look for in the logs, and where the deeper
docs are.

The deployment is two pull requests in `HCM-BAUCHI/Nigeria-DevOps`:

- [#99](https://github.com/HCM-BAUCHI/Nigeria-DevOps/pull/99) adds Lenspack's plugin to the existing
  `backbone-services/superset` chart;
- [#100](https://github.com/HCM-BAUCHI/Nigeria-DevOps/pull/100) adds the Lenspack server chart,
  `backbone-services/lenspack`, its Secret and its Argo CD entry, and **switches Lenspack on for
  `bauchi-central-prd`**.

Both read one shared `lenspack:` block in `environments/bauchi-central-prd.yaml`. The charts are off by default, so
every other environment renders nothing. In `bauchi-central-prd` the block sets `enabled: true`, so **merging #100 is
the deploy**. The secrets have to be in place before that merge (see [Switch on](#switch-on)).

Everything below was checked against the chart templates in those PRs: #99 at `24f70c4` and #100 at `1dd8b5d`,
rendered together with `helm template`. Values written `{{…}}` are secrets we don't know and are marked
"<-- needs updating".

## What runs

| Piece | Kind and name (namespace `superset`) | Image | Notes |
|---|---|---|---|
| Lenspack server | Deployment `lenspack`, 1 replica, strategy `Recreate` | `ghcr.io/theflywheel/lenspack:3d0bc57` (public, no pull secret), from `lenspack.image.tag` | Starts with `superset --config /config/superset.yaml`. Runs as user 1000, with a read-only root filesystem and no service account token. Keep one replica, because it keeps per-process state. |
| Its config | ConfigMap `lenspack-config` (`superset.yaml`) | | Built by the chart from the env file's `lenspack:` block. A change restarts the pod (checksum annotation). |
| Its state | PVC `lenspack-data`, 5 GiB, `gp3`, ReadWriteOnce, mounted at `/data` | | Holds settings, access grants, changes to the vocabulary made while it runs, the audit log and usage records. Argo CD never prunes it (`Prune=false`). |
| Its address | Service `lenspack`, ClusterIP, port 8795 | | **No Ingress.** Only Superset talks to it. |
| Optional | NetworkPolicy `lenspack` (`networkPolicy.enabled`, off) | | Lets only pods labelled `app: superset` reach port 8795, where the network plugin enforces it. |
| Superset's side | Existing Deployment `superset`: one more init container, `copy-lenspack-plugin` | the Lenspack image at `lenspack.pluginTag` (`3d0bc57`) | Copies one file, `lenspack_superset.py`, into an `emptyDir` at `/app/lenspack`, and `superset_config.py` imports it. Superset stays on the stock `apache/superset:6.1.0` image. |
| Superset setup | Existing `setup` init container | | Also creates two Superset roles, `Lenspack user` and `Lenspack admin` (no permissions), and the `lenspack` login (Superset `Admin` role, password from the Secret). |
| Argo CD | `lenspack` in the egov backbone ApplicationSet: app `egov-lenspack` | | Same wiring as `superset`: auto-sync with self-heal, **prune off**. |

**One dashboard.** The assistant is on the Gabon ITN dashboard only (id 25). Its Ask button shows nowhere else, and the
server refuses chat requests about any other dashboard, for everyone, admins included.

**One switch, two tags.** `lenspack.enabled` turns both charts on or off. The two tags are separate so that the usual
upgrade leaves Superset alone:

- `lenspack.image.tag` is the server's image. Changing only this restarts only the Lenspack pod; Superset's render
  doesn't change.
- `lenspack.pluginTag` is the image Superset copies the plugin from. Changing it restarts Superset.

Both are `3d0bc57` today. If `pluginTag` is empty, it follows `image.tag`.

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

- **Browsers only reach Superset.** The ingress doesn't change. Its existing 300 s read timeout suits streamed chat
  replies, and the plugin turns nginx buffering off for them.
- **Lenspack never connects to ClickHouse or Postgres.** Every number comes from Superset, through Superset's
  permissions.
- **No extra shared secret.** The key that signs "who is asking" is derived from Superset's `secret-key`.
- **The admin API** comes in the same way. Requests to `/superset/lenspack/_admin/…` that carry an admin API key need no
  Superset session. Superset passes the key on for those addresses only. See [Who administers what](#who-administers-what).
- **Egress:** the Lenspack pod needs HTTPS to `api.anthropic.com`, and nothing else while the microphone stays off.
- **Optional, separate from Lenspack:** `superset.ingress.proxyBufferSize: 16k` avoids 502 errors caused by Superset
  6.1.0's growing session cookie.

## Every environment variable and secret

### Lenspack server container (`lenspack`)

| Variable | Value | Comes from | Required | If missing or wrong |
|---|---|---|---|---|
| `LENSPACK_SUPERSET_PASSWORD` | the `lenspack` login's password | Secret `superset-secrets`, key `lenspack-password` | yes | The pod does not start (`CreateContainerConfigError`). |
| `ANTHROPIC_API_KEY` | the model key | Secret `lenspack-secrets`, key `anthropic-api-key` | yes | The pod does not start; Superset is unaffected. cluster-configs writes `lenspack-secrets` only when this key is in the secrets file. |
| `OPENROUTER_API_KEY` | speech-to-text key | Secret `lenspack-secrets`, key `openrouter-api-key` (marked optional) | no | No microphone. The mic also needs `features.voice: true`, and it is off for the pilot. |
| `LENSPACK_ADMIN_API_KEYS` | `name:scrypt$…`, the hash of an admin API key | Secret `lenspack-secrets`, key `admin-api-keys` (marked optional) | no | No admin API key: admins work only through Superset's pages. An entry that doesn't read (no colon, a bad hash) stops the server at start. The log names the entry, never the key. |
| `LENSPACK_STATE_DIR` | `/data` | set by the chart (also the image's default) | set | |
| `LENSPACK_LLM_PROVIDERS` | `[{"name":"claude-haiku-5-5","kind":"anthropic","model":"claude-haiku-5-5"}]` | env file, `lenspack.extraEnv` | yes, for this setup | With only the key, the chat offers Claude Sonnet (the default), Opus and Haiku, which costs more. |
| `LENSPACK_ADMIN_ACCESS` | `superset-users` | env file, `lenspack.extraEnv` | yes, for this setup | The default, `superset-role`, makes holders of the `Lenspack admin` Superset role admins. |
| `LENSPACK_ADMIN_USERS` | `id:2` (the Superset user `editor`) | env file, `lenspack.extraEnv` | yes, for this setup | Empty: nobody is an admin through Superset (a warning in the log). A value that isn't a user name or `id:<n>` stops the server at start. |
| `LENSPACK_USER_ACCESS` | `superset-role,granted` | env file, `lenspack.extraEnv` | no | The default, `superset-role`, lets in holders of `Lenspack user`, and admins. |
| `LENSPACK_ADMIN_SURFACE` | `superset` | env file, `lenspack.extraEnv` | no | The default, `split`, moves part of the settings to Lenspack's own admin panel (still reached through Superset). |
| `LENSPACK_DASHBOARD_SCOPE` | `listed` | env file, `lenspack.extraEnv` | yes, for this setup | The default, `any`, puts the Ask button on every dashboard a person may open in Superset. |
| `LENSPACK_DASHBOARDS` | `"25"` (the Gabon ITN dashboard; ids separated by commas) | env file, `lenspack.extraEnv` | yes, with `listed` | Missing under `listed`: the server stops at start. A wrong id puts the assistant on the wrong dashboard, or on none. |
| `LENSPACK_HOST`, `NODE_ENV`, `LENSPACK_UI` | `0.0.0.0`, `production`, a folder | the image | | `LENSPACK_UI` is unused in this mode. |

**Not set, and not needed here:**

- `SUPERSET_ADMIN_USERNAME` and `SUPERSET_ADMIN_PASSWORD`. Superset's setup makes the `lenspack` login, so Lenspack
  never needs an admin password.
- `LENSPACK_ADMIN_PASSWORD(S)`. There is no password sign-in.

The chart sets `enableServiceLinks: false`. Otherwise Kubernetes would inject `LENSPACK_PORT=tcp://…`, which Lenspack
reads as its port.

Anything else goes in `lenspack.extraEnv`. Every variable Lenspack reads is in
[Lenspack's configuration reference](https://github.com/theflywheel/lenspack/blob/3d0bc57/docs/reference/config.md#environment-variables).

### Superset web container (`superset`) and `setup` init container: what Lenspack adds

These are set only while `lenspack.enabled` is true. Superset's own variables (`SUPERSET_SECRET_KEY`, database, Redis)
don't change.

| Variable | Value | Comes from | Container | Required | If missing or wrong |
|---|---|---|---|---|---|
| `LENSPACK_INTERNAL_URL` | `http://lenspack.superset.svc.cluster.local:8795` | set by the chart (`lenspack.internalUrl`) | web, setup | no (default `http://lenspack:8795`) | The Ask button's requests answer 502 "The assistant's server is not reachable". |
| `LENSPACK_SERVICE_USER` | `lenspack` | set by the chart (`lenspack.serviceUser`) | web, setup | no (default `lenspack`) | Must match the server's Superset login. If it doesn't, named admins never get the menu entry. |
| `LENSPACK_CLICKHOUSE_LABEL_SUFFIX` | `on` | set by the chart | web, setup | no (default `on`) | `off`: on Superset 6.1, a ClickHouse chart whose metric is named like its column fails with error 184. |
| `LENSPACK_PASSWORD` | the `lenspack` login's password | Secret `superset-secrets`, key `lenspack-password` (marked optional) | setup only | for the chat | Missing or under 24 characters: setup logs a `WARNING` and doesn't create or update the login. Superset starts normally, but Lenspack can't sign in until the key is added and Superset restarts. |

### `copy-lenspack-plugin` init container

- **Environment variables:** none.
- **Command:** `cp /app/packages/hosts/superset/plugin/lenspack_superset.py /app/lenspack/`.
- **Resources:** 10m / 16Mi requested, 100m / 64Mi limit.
- **It runs on Superset's start path.** If the image at `pluginTag` can't be pulled (a mistyped tag, or ghcr.io
  unreachable), the new Superset pod stays in `Init`. Because Superset uses `Recreate`, Superset is down until that is
  fixed. Check that the tag exists before merging a change to it:
  `docker manifest inspect ghcr.io/theflywheel/lenspack:<tag>`.

### The secrets file (`bauchi-central-prd-secrets.yaml`)

| Key | Value | Becomes |
|---|---|---|
| `cluster-configs.secrets.superset.lenspack-password` | `{{lenspack login password}}` <-- needs updating (24+ characters, for example `openssl rand -base64 32`) | key `lenspack-password` in `superset-secrets`. Read by Superset's setup and by the Lenspack server. |
| `cluster-configs.secrets.lenspack.anthropic-api-key` | `{{anthropic api key}}` <-- needs updating | Secret `lenspack-secrets` in namespace `superset` |
| `cluster-configs.secrets.lenspack.admin-api-keys` | optional: one line `lab:scrypt$…` <-- needs updating (the hash we send you) | key `admin-api-keys` in `lenspack-secrets` |
| `cluster-configs.secrets.lenspack.openrouter-api-key` | leave out for the pilot | the optional speech key |

The admin API key entry is a hash, so neither the secrets file nor the cluster holds the key itself. We keep the key.

**To rotate the login password:**

1. Change it in the secrets file and sync `cluster-configs`.
2. Restart Superset; setup resets the login to the new value.
3. Restart Lenspack.

**To change the admin API key:** replace the line, sync `cluster-configs`, and restart Lenspack. The old key stops
working.

### Config keys you set (the env file's `lenspack:` block)

| Key | Pilot value | Chart default |
|---|---|---|
| `enabled` | `true` (the merge switches it on) | `false` |
| `image.tag` | `3d0bc57` (the server) | `3d0bc57` |
| `pluginTag` | `3d0bc57` (Superset's copy of the plugin) | empty, which means it follows `image.tag` |
| `datasets` | the seven Gabon ITN datasets in schema `analytics` | none: the chart refuses to render without them |
| `extraEnv` | the seven variables above | none |
| `config.auth.users` | `["Lenspack user"]` (held by nobody at launch) | the same |
| `config.brand` | name `HCM Assistant`, button `Ask HCM`, French button `Demander à HCM`, no "Powered by" line | |
| `config.scope`, `language`, `overlay` | the campaign scope, French, and the vocabulary for the Gabon datasets | |
| `config.features.cache` | `false` (saved answers keep the words of questions) | on |
| `config.budget` | not set, so the defaults | `usdPerDay: 20` (the whole deployment), `usdPerUserPerDay: 4` (each person), in USD per UTC day |
| `config.audit.retentionDays` | not set | `30` |
| `config.hostPolicy`, `editPolicy`, `editScope` | not set | `superset`, `superset`, `own` |
| `config.features.voice`, `personalDashboards` | not set | `false`, `false` |
| `persistence`, `resources`, `networkPolicy.enabled` | not set | 5Gi `gp3`; see below; `false` |

What an admin later changes while the server runs is kept on the volume and wins over the ConfigMap. That covers
switches, models, language, access, and the vocabulary's labels, measures and examples. All the keys are in
[Lenspack's configuration reference](https://github.com/theflywheel/lenspack/blob/3d0bc57/docs/reference/config.md#supersetyaml).
Why each pilot value was chosen: [gabon-pilot-config-notes.md](gabon-pilot-config-notes.md).

## Ports, probes, resources

| | Lenspack server |
|---|---|
| Port | 8795 (`http`) |
| Startup probe | `GET /healthz`, every 10 s, up to 30 failures |
| Readiness probe | `GET /readyz`, every 15 s. The pod is ready only once Superset has handed over the signing key. Until then it refuses every chat and keeps retrying on its own. |
| Liveness probe | `GET /healthz`, every 30 s, 5 failures. Never point it at `/readyz`: a Superset without the plugin would then restart Lenspack in a loop. |
| Resources | requests 100m CPU / 256Mi, limits 1 CPU / 1Gi |
| Storage | `/data` on the PVC; `/tmp` on an `emptyDir` |

Superset's own probes (`/superset/health`) and its 2 workers × 20 threads are unchanged. Each chat reply holds one
Superset thread while it streams (30–60 s), so about 30 chats can run at once with room left for dashboards.

## Switch on

Merging #100 switches it on. Before merging:

1. **Check the image exists:** `docker manifest inspect ghcr.io/theflywheel/lenspack:3d0bc57`. Superset's init
   container pulls it on every start, so a wrong tag keeps Superset in `Init`.
2. **Check what Superset needs.** The seven datasets and dashboard 25 exist in Superset. The owner is already set: `id:2`,
   the Superset user `editor`. No role changes are needed.
3. **Add the secrets and sync `cluster-configs`, before the merge.** Check that `lenspack-secrets` exists in `superset`
   and that `superset-secrets` has `lenspack-password`.
   - Superset creates the `lenspack` login only when it starts. Without the password, Superset still starts, but the
     login is missing until Superset's next restart.
   - Without the model key, the Lenspack pod stays in `CreateContainerConfigError`; Superset is unaffected.
4. **Render and diff** with the deployer (`go run main.go deploy -e bauchi-central-prd superset -p`, and the same for
   `lenspack`), against the current branch.
   - Superset: about 80 more lines (the init container, a volume, the variables and the setup steps).
   - Lenspack: four objects (ConfigMap, Deployment, PVC and Service).
   - Other environments: nothing.
5. **Merge #99, then #100.** Argo CD syncs `egov-superset` and `egov-lenspack`. Superset restarts once, and with
   `Recreate` that is a short outage. The server starts.
6. **Check** the log lines below. Then sign in as `editor`:
   - "Demander à HCM" shows on the Gabon dashboard and on no other dashboard;
   - a question gets an answer;
   - Settings → Manage → AI assistant opens.

   Any other login sees no button. Signed out, `/superset/lenspack/overlay.js` answers 401.

## Log lines to check

### Superset setup

Command: `kubectl -n superset logs deploy/superset -c setup`

- **Good:** `created role Lenspack user` and `created user lenspack`. On later starts: nothing, or
  `reset password of lenspack`.
- **Bad:** `WARNING: superset-secrets has no lenspack-password of at least 24 characters`.

### Superset web

Command: `kubectl -n superset logs deploy/superset -c superset`

- **Good:** no Lenspack errors.
- **Bad:** `Lenspack plugin not loaded; Superset runs without it`.

### Lenspack

Command: `kubectl -n superset logs deploy/lenspack`

**Good:**

- `lenspack-superset: pack itn_gabon: 7 datasets, …`
- `identity: signed by Superset; edit policy superset; host policy superset; audit … (30 days); Superset account lenspack (env)`
- `admins: named Superset users (1 owner from LENSPACK_ADMIN_USERS, …`
- `users: … (access superset-role,granted, from LENSPACK_USER_ACCESS)`
- `admin pages: superset …`
- `dashboards: listed (25 …)`
- `admin API keys: 1 (lab) …` once the key is set, or `admin API keys: none …` without it
- a line starting `http://0.0.0.0:8795/` that says `chat on`

**Not a problem at first:** `identity: NO KEY (still trying)`. Wait for
`identity key fetched from Superset after N tries`. Any `warning:` line deserves a read.

## Upgrading later

**Most changes need no redeploy.** An admin can change these while the server runs, on Superset's AI assistant pages
or with the admin API key:

- settings, switches, the chat model and language;
- who is an admin and who may use the assistant (the owner stays in the env file);
- the vocabulary's labels, hints, measures and example questions.

They are kept on the volume.

**What still needs the env file:** the datasets, dashboards and campaign scope, the models on offer and their keys, the
spend caps, the access modes and owners, and the admin API keys themselves.

**A new server version (the usual case).**

1. Check the tag exists: `docker manifest inspect ghcr.io/theflywheel/lenspack:<tag>`. Tags are commits of
   Lenspack's `main`.
2. Change `lenspack.image.tag`. A tag given on the deployer's command line doesn't override the env file.
3. Merge. Only the Lenspack pod restarts, and chat is unavailable for about half a minute. Superset keeps running.
4. Check the log lines above.

Settings, access grants, changes made while it ran, usage records and the audit log stay on the volume.

**A new plugin version (rare; the release notes say so).** Also change `lenspack.pluginTag`, after the same check.
Superset restarts once, which is a short outage for every dashboard on it, so do it at a quiet hour.

**Going back.** Make the same change with the old tag.

**The worst case is losing the volume.** It holds the settings, grants, changes to the vocabulary and the audit log.
Snapshot the EBS volume behind `lenspack-data` before any change to the deployment.

**Upgrading Superset.** The plugin supports Superset 6.1 (and 5.0). See
[Lenspack's Superset versions page](https://github.com/theflywheel/lenspack/blob/main/docs/hosts/superset/versions.md)
and [its upgrade notes](https://github.com/theflywheel/lenspack/blob/main/docs/hosts/superset/upgrading.md).

## Switch off

**Without a redeploy.** An admin can hide the Ask button for everyone (the "Ask Lenspack button" switch) or turn off
dashboard edits (the "Dashboard edits" switch). This works on the settings page or through the admin API.

**Completely.**

1. Set `lenspack.enabled: false`, or revert #100. Superset goes back to exactly today's render and restarts once.
2. Argo CD does not prune, so prune `egov-lenspack` in Argo CD to remove the server.

The PVC stays until you delete it by hand. Two things stay in Superset: the two roles, and the `lenspack` login, which
has the `Admin` role. Deactivate or delete that login in Settings → List Users. Charts the chat saved are ordinary
Superset charts and stay.

## Who administers what

**Admins are named people, not a Superset role** (`LENSPACK_ADMIN_ACCESS=superset-users`).

- **The owner** is the Superset user `editor`, named by its id (`id:2`) in `LENSPACK_ADMIN_USERS`. Owners change only
  there, with a restart.
- **Other admins and users** are added by the owner on the **Access** page of the AI assistant settings. A change takes
  effect on that person's next request, with no redeploy.
- **Superset roles grant no admin rights,** even `Admin`, so the `Lenspack admin` role the chart creates is unused.
- **Users** are the people an admin adds, or holders of `Lenspack user`. Nobody else sees the Ask button.
- **All settings pages are inside Superset,** at Settings → Manage → AI assistant (`/superset/ai-assistant/`).
- **No extra data.** Being an admin or a user never shows anyone more data than Superset already lets them see.

**The admin API key.** We, the Lenspack team, have no access to the cluster or the server. The admin API key is how we
operate the assistant anyway:

- **What it does:** with an `Authorization: Bearer <key>` header, through Superset's public address
  (`https://gabon-hcm.digit.org/superset/lenspack/_admin/<route>`), it does what an admin does on the pages:
  settings, switches, access grants, changes to the vocabulary, the audit log and usage.
- **What it can't do:** use the chat, or read dashboards or data.
- **Treat it as a master key.** It counts as an owner. It shows up in the audit log as `api:lab`.
- **The cluster holds only its hash.** Wrong keys are slowed down and logged.

DevOps doesn't need to be an admin to run the service.

Details:

- [Who can use and administer the assistant](https://github.com/theflywheel/lenspack/blob/main/docs/access/admin-access.md)
- [The admin API key](https://github.com/theflywheel/lenspack/blob/main/docs/access/admin-api.md)

## Data that leaves the cluster, and the spend cap

**Sent to Anthropic on every chat turn:**

- the vocabulary: dataset and column labels, instructions and examples;
- the recent conversation;
- **the rows the assistant reads** to answer, mostly totals and counts by group.

**Never sent:** columns listed in `overlay.exclude` (household ids, coordinates, net codes and complaint ids), which are
never read either; credentials; SQL; host names.

**Kept on the volume:**

- the audit log, for 30 days: questions, answers, result rows and who asked;
- usage records: user, tokens and cost. Nothing deletes old lines, so trim `usage.jsonl` once in a while;
- settings and access grants;
- usage telemetry, for 90 days, with question text off by default.

Saved answers are off.

**Spend caps:**

- 20 USD per UTC day for the whole deployment;
- 4 USD per UTC day for each person.

When a cap is reached, the chat answers "today's budget is used up" (HTTP 429) until 00:00 UTC. The caps survive
restarts. Change them with `config.budget` in the env file.

More:

- [Privacy](https://github.com/theflywheel/lenspack/blob/main/docs/operating/privacy.md)
- [Costs](https://github.com/theflywheel/lenspack/blob/main/docs/operating/costs.md)
- [What Lenspack keeps on disk](https://github.com/theflywheel/lenspack/blob/main/docs/operating/state.md)

## When something is wrong

| You see | Likely cause | Do this |
|---|---|---|
| `lenspack` pod in `CreateContainerConfigError` | a missing Secret or key | add the secret, sync `cluster-configs` |
| Superset pod stuck in `Init` | the image at `lenspack.pluginTag` can't be pulled | fix `pluginTag`, or switch off |
| Lenspack exits: `is not a user id` | `LENSPACK_ADMIN_USERS` changed to something that isn't a user name or `id:<n>` | put back `id:2` |
| Lenspack exits, naming an admin API key entry | the `admin-api-keys` line doesn't read | fix the line (`name:scrypt$…`), or remove it |
| Lenspack exits: `… is "listed" but … lists none` | `LENSPACK_DASHBOARDS` is empty or missing | list the dashboard ids |
| no Ask button on some dashboard | expected: only dashboard 25 is listed | add its id to `LENSPACK_DASHBOARDS` if it should have one |
| Lenspack exits: `Superset dataset "…": not found` | a dataset in `datasets` doesn't exist in Superset | create it, or fix the name (`schema.table`) |
| `Superset sign-in failed (401)` | the `lenspack` login wasn't created (see the setup `WARNING`), or Superset wasn't restarted after the password was added or changed | fix the secret, restart Superset, then Lenspack |
| pod 0/1 ready for a long time, `NO KEY` | the plugin isn't loaded, or Superset is down | look for `Lenspack plugin not loaded` in Superset's log |
| no Ask button for the owner | the wrong user id, or the plugin isn't loaded | check `/superset/api/v1/me/`. Signed in, `/superset/lenspack/healthz` gives 404 (no plugin) or 502 (server unreachable). |
| every chat says access "could not be checked" | Superset answered without the plugin | check every Superset process loads the plugin |
| the admin API key gets 401 | a wrong key, or its hash isn't in the Secret | check the Secret, and the `admin API keys:` log line |
| "today's budget is used up" | a spend cap | wait for 00:00 UTC, or raise it |
| settings won't save (503) | the volume is full or read-only | free space or fix the mount |

Everything else: [Lenspack's troubleshooting page](https://github.com/theflywheel/lenspack/blob/main/docs/operating/troubleshooting.md).

## Further reading

- [gabon-pilot-config-notes.md](gabon-pilot-config-notes.md): the decisions behind the pilot's settings, and the steps
  before go-live.
- The PRs, [#99](https://github.com/HCM-BAUCHI/Nigeria-DevOps/pull/99) and
  [#100](https://github.com/HCM-BAUCHI/Nigeria-DevOps/pull/100), with their "Values to set" tables and render checks.
- [ARCHITECTURE.md](ARCHITECTURE.md): how the signed route and the assistant work, if you want the design.
- Lenspack's operator docs:
  - [deploying](https://github.com/theflywheel/lenspack/blob/main/docs/operating/deploying.md)
  - [feature switches](https://github.com/theflywheel/lenspack/blob/main/docs/operating/switches.md)
  - [the settings pages](https://github.com/theflywheel/lenspack/blob/main/docs/features/admin-panel.md)
  - [changing the vocabulary while it runs](https://github.com/theflywheel/lenspack/blob/main/docs/hosts/superset/pack-runtime.md)
