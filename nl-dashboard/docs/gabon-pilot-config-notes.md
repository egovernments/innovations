# Gabon pilot: configuration notes

These notes record how the assistant ("HCM Assistant", button "Ask HCM") is set up for its first live rollout: the
Gabon bednet (ITN) distribution campaign, on the production Superset at `gabon-hcm.digit.org/superset`. They cover who
can use it, who runs it, where its settings live, the rest of its configuration, and what still has to happen before
go-live.

The deployment itself is two pull requests in the Nigeria-DevOps repository: one adds the Lenspack server chart,
the other adds Lenspack's plugin to the Superset chart. Both read one shared `lenspack:` block in the environment file,
which switches Lenspack on, so merging them is the deploy. How to run it: [FOR-DEVOPS.md](FOR-DEVOPS.md).

Decided on 27 November 2026 unless marked otherwise.

## In short

- **The Superset user `editor` (id 2) owns the assistant at launch.** It is an existing login on this Superset,
  named in the deployment by its id.
- **The owner decides who else gets in, later.** On the assistant's Access page the owner adds admins and users by
  Superset user name or id. Nothing is redeployed.
- **Superset roles grant no admin.** A Superset Admin can't make themselves an admin of the assistant.
- **Nobody else sees the Ask button at launch.**
- **The settings live inside Superset**, on its own "AI assistant" page, not on a separate admin panel.
- **No admin passwords.** People sign in through Superset. The one way in without Superset is an optional admin API
  key that the Lenspack team holds (the cluster keeps only its hash), so the assistant can be run without access to the
  server.

## Who runs it: the `editor` login

Decided on 27 November 2026: the owner is the existing Superset user `editor`, user id **2** (from
`/superset/api/v1/me/` signed in as it). A viewer login is used to test what a non-admin sees.

| | |
|---|---|
| **Why by id** | an id stays with one account; a user name would pass admin to any new account later created with the same name |
| **Roles** | unchanged. Admin comes from the id, so the chart's setup script resetting this login's Superset roles on every start doesn't affect it |
| **Shared login** | anyone who knows `editor`'s password is the assistant's owner, and the usage pages show every question from it as `editor`. Give people their own accounts and add them on the Access page as the pilot grows |
| **What it can see** | whatever `editor` sees in Superset (`hostPolicy: superset`); the assistant itself is limited to the Gabon datasets and dashboard 25 |

## Who is an admin: named users

**Settings** (in the Lenspack block's `extraEnv`):

```
LENSPACK_ADMIN_ACCESS=superset-users
LENSPACK_ADMIN_USERS=id:2
```

| | |
|---|---|
| **The owner** | `editor` (id 2). Owners come from the deployment and can't be removed on the page |
| **What an admin gets** | the assistant's settings, the usage pages (with user names), the audit log and the Access page |
| **Add an admin later** | the owner adds a Superset user name or `id:<n>` under **Admins** on the Access page. It applies from that person's next request |
| **Remove one** | the owner removes them on the same page |
| **Who can add admins** | owners only. An admin the owner added can't add others |
| **Superset roles** | grant no admin in this mode, not even Superset's `Admin` |

The Access page lists everyone who has used admin rights. The audit log gets a line the first time each person does,
and every admin sees "New admin since your last visit" when someone new appears.

The Superset chart still creates a `Lenspack admin` role. It is unused in this mode.

## Who may use it

**Settings:** `LENSPACK_USER_ACCESS=superset-role,granted`, with `auth.users: ["Lenspack user"]`.

| | |
|---|---|
| **At launch** | nobody added and nobody holds `Lenspack user`, so only the owner sees the Ask button |
| **Open it to people later** | an admin adds them under **Users** on the Access page, or a Superset Admin gives them `Lenspack user`. Either lets them in, from their next page load |
| **What they see** | still only what Superset lets them see; being let in only switches the assistant on |
| **Everyone else** | no Ask button; every chat route answers "The assistant isn't turned on for your account" |

To make the Access page the only way in, set `LENSPACK_USER_ACCESS=granted`.

## Where the settings live: inside Superset

**Setting:** `LENSPACK_ADMIN_SURFACE=superset`.

Every admin page (settings, usage, telemetry, review, models, off switches, cost, the audit log and access) opens
inside Superset's own frame, at `/superset/ai-assistant/`. The assistant's separate admin panel address leads there
too. We chose this because only one account has access at launch, and it already works in Superset.

**The menu entry** (Settings → Manage → AI assistant) shows to the owner and the admins the owner adds, as well as to
Superset Admins. The plugin refreshes that list from the assistant every 5 minutes, so a new admin can take a few
minutes to see it. Seeing the entry grants nothing: Lenspack still decides access on every request, so a Superset
Admin who isn't an admin of the assistant sees the entry but is refused on the page. The list only reaches the plugin
when Superset's `LENSPACK_SERVICE_USER` and the assistant's Superset login are the same name (both `lenspack` in the
deploy PRs).

## Lenspack version

| | |
|---|---|
| **Image** | `3d0bc57`, in `lenspack.image.tag` (the server) and `lenspack.pluginTag` (Superset's copy of the plugin) in the environment file. Changing only `image.tag` restarts only the Lenspack pod; changing `pluginTag` restarts Superset |
| **What it includes** | Lenspack #105 (access modes, named owners, the Access page, first-use audit lines, the new-admin notice), #111 (where the admin pages live, and the menu entry for named admins), #114 (the assistant on listed dashboards only), #115 (the admin API key) and #120/#121 (changing the vocabulary while it runs, and the Pack tab on the admin pages) |

## Admin API key

| | |
|---|---|
| **What it is for** | the Lenspack team has no access to the cluster or the server. With the key, sent as `Authorization: Bearer <key>` to `https://gabon-hcm.digit.org/superset/lenspack/_admin/<route>`, it can change settings and switches, grant access, and edit the vocabulary (labels, hints, measures, examples) while the assistant runs, and read the audit log and usage |
| **What it can't do** | use the chat, or read dashboards or data. It is not a Superset user |
| **Where it lives** | the secrets file holds one line, `lab:scrypt$…`: a hash, not the key. It reaches the server as `LENSPACK_ADMIN_API_KEYS` from `lenspack-secrets`, and is optional |
| **How it shows** | as `api:lab` in the audit log and on the Access page. It counts as an owner, so treat it as a master key |
| **Rotate or remove** | eGov replaces or removes the line and restarts the Lenspack pod |

## The rest of the configuration

What the deploy PRs set today, and why.

| Setting | Value | Why |
|---|---|---|
| Dashboards | only the Gabon ITN dashboard (`LENSPACK_DASHBOARD_SCOPE=listed`, `LENSPACK_DASHBOARDS=25`): no Ask button and no chat on any other dashboard, for anyone, admins included | this Superset also hosts other states' dashboards |
| Datasets | the seven Gabon ITN virtual datasets in schema `analytics` (`itn_gab_area`, `itn_gab_sync_hourly`, `itn_gab_bales`, `itn_gab_task_points`, `itn_gab_reg_points`, `itn_gab_complaints`, `itn_gab_refresh`) | the dashboard's own datasets. Not `itn_gab_codes` (one row per bednet code) |
| Campaign | every answer is about the November 2026 campaign, set by the deployment (`scope`), whatever is picked on the dashboard | the datasets hold more than one campaign. `itn_gab_refresh` has no campaign column and stays unscoped |
| Personal data | the assistant never uses household ids, exact coordinates, bednet codes or complaint ids (`overlay.exclude.columns`), though the datasets hold them | rows go to the model provider. Without coordinates there are no maps in the pilot |
| Model | Claude Haiku only (`LENSPACK_LLM_PROVIDERS`) | the cheapest model that scored well on our evaluations |
| Daily spend caps | 20 USD for the whole deployment (`budget.usdPerDay`) and 4 USD per person (`budget.usdPerUserPerDay`) | ceilings, not estimates |
| Language | French for the chat and the dashboard button | the campaign works in French |
| Name | "HCM Assistant", with the button "Ask HCM" ("Demander à HCM" in French), and no "Powered by Lenspack" line | |
| Saved answers | off (`features.cache: false`) | they keep the words of questions |
| Question text in usage records | off (the default) | |
| Audit log | kept 30 days | it holds questions, answers and result rows |
| Voice (the mic) | off | until consent is per person |
| "My dashboards" | off | logins are shared on this Superset |
| Dashboard edits | `editScope: own` and edits follow Superset's dashboard rights. `editor` can edit in Superset, so the chat could change dashboards `editor` owns. Tab controls (chat edits only its own tabs) are being added before edits are turned on for anyone | official dashboards stay as they are |
| Time zone | UTC | sync times are UTC hours; another zone would drop the hourly series |
| Storage | one replica; settings, usage records and the audit log on a 5 GiB volume at `/data` | |
| Health checks | the pod is ready only once Superset has given it the key that signs who is asking (`/readyz`); until then it refuses every chat and keeps retrying | |

**Maps, for later:** Superset 6.1 draws its point maps on OpenStreetMap tiles by default. Mapbox styles need a Mapbox
key. Neither applies to the pilot, since the assistant doesn't use coordinates.

## Before go-live

1. The owner's id (`id:2`) is in `LENSPACK_ADMIN_USERS` in the deploy PR (done).
2. **Secrets first.** eGov adds the `lenspack` Superset login's password and the model key (and, optionally, the admin
   API key's hash) to the secrets file and syncs `cluster-configs`. Superset creates the `lenspack` login only when it
   starts, so the password must be there before the merge.
3. **Then the merge.** eGov merges the Superset plugin PR, then the server PR, which has `lenspack.enabled: true`.
   Superset restarts once and the server starts.

## Checks after deploy

- **The pod** shows 1/1 ready. 0/1 means it is still waiting for Superset's signing key and retrying.
- **The server's start-up log** says who is an admin and who may use it:
  `admins: named Superset users (1 owner from LENSPACK_ADMIN_USERS, …` and a `users:` line naming
  `superset-role,granted`.
- **Signed in as `editor`:** the Ask button shows, a question about the campaign gets an answer, the
  AI assistant entry is in Superset's Settings menu, and its page opens with every section. The Access page lists the
  login as owner.
- **Signed in as the viewer login (or anyone else):** no Ask button until the owner adds them; after that, answers but no admin pages.
- **The usage pages** show `editor`'s question, with its user name.

## Rolling out to more people

1. The owner adds the people who should try it under **Users** on the Access page.
2. Watch the usage and review pages for a few days: answers people mark wrong, refusals, spend against the cap.
3. The owner adds anyone else who should run it under **Admins**. The new-admin notice tells existing admins.

## Open

- Whether users should come only from the Access page (`LENSPACK_USER_ACCESS=granted`), so that a Superset Admin
  can't let people in with the `Lenspack user` role.
- Whether to turn dashboard edits off entirely (`boardEdits: false`) before anyone with edit rights in Superset is
  let in.
- Whether filters picked on the dashboard should narrow answers. Today they are ignored and only the campaign scope
  applies.
