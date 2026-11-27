# Gabon pilot: configuration notes

These notes record how the assistant ("Ask HCM") is set up for its first live rollout: the Gabon bednet (ITN)
distribution campaign, on the production Superset at `gabon-hcm.digit.org/superset`. They cover who can use it, who
runs it, where its settings live, the rest of its configuration, and what still has to happen before go-live.

The deployment itself is two draft pull requests in the Nigeria-DevOps repository: one adds the Lenspack server chart,
the other adds Lenspack's plugin to the Superset chart. Both read one shared `lenspack:` block in the environment file.

Decided on 27 November 2026 unless marked otherwise.

## In short

- **One internal account runs the assistant at launch.** eGov creates a Superset account for the pilot team only. It
  holds the `Lenspack admin` role and sees the assistant's settings and usage pages. It is not a Superset Admin.
- **Nobody else sees the Ask button at launch.** The `Lenspack user` role exists but nobody holds it yet. Opening the
  assistant to more people later means giving them that role in Superset. Nothing is redeployed.
- **More admins later** get the `Lenspack admin` role the same way.
- **The settings live inside Superset**, on its own "AI assistant" page, not on a separate admin panel.
- **No admin passwords.** Everyone signs in through Superset.

## Who runs it: one internal account

**The ask to eGov:** a Superset account for the pilot team, with:

| | |
|---|---|
| **Who uses it** | the pilot team only; the password stays in the team's password store and is never put on a shared list |
| **Roles** | `Lenspack admin`, plus a read-only role that opens the Gabon ITN dashboard and its datasets and nothing else |
| **Not** | Superset's `Admin` role, or any role that opens other countries' or states' data on the same Superset |

**Why a read role scoped to Gabon:** the assistant answers with whatever data the person asking may see in Superset
(`hostPolicy: superset`). A Superset Admin account would put every dataset on this Superset within the assistant's
reach. A Gabon-only role keeps the pilot to the Gabon data even if a question wanders. Superset's dashboard roles
(`DASHBOARD_RBAC`) are on, so the role can open the dashboard by name.

**Why not the shared logins:** the chart's setup script resets the roles of its fixed `admin`, `editor` and `viewer`
logins on every start, so a role given to them would vanish. And a login many people share can't tell the usage pages
who asked.

## Who is an admin

**Setting:** `auth.admins: ["Lenspack admin"]`. This is already in the Lenspack chart. The access mode is
`superset-role`, the default, so nothing else needs setting.

| | |
|---|---|
| **What an admin gets** | the assistant's settings, the usage pages (including user names in telemetry), the audit log and the Access list |
| **At launch** | only the internal account |
| **Add an admin later** | in Superset, Settings → List Users, give the person `Lenspack admin`. It applies from their next page load |
| **Remove one** | take the role away the same way |
| **Who sees user names on the usage pages** | the admin roles (`auth.usage` follows `auth.admins` unless set) |

**What this mode can't stop.** Anyone who can edit roles in Superset (every Superset Admin on this instance) could give
themselves `Lenspack admin`. We accept that for the pilot. With the access release (Lenspack #105, below) it is visible:
the admin pages list everyone who has used admin rights, the audit log gets a line the first time each person does, and
every admin sees "New admin since your last visit" when someone new appears.

If that turns out not to be enough, the stricter mode is `superset-users`: name the internal account by its Superset
user id (`LENSPACK_ADMIN_ACCESS=superset-users`, `LENSPACK_ADMIN_USERS=id:<n>`), and holding a role grants nothing.
Admins are then added on the assistant's Access page, not in Superset.

## Who may use it

**Setting:** `auth.users: ["Lenspack user"]`. This is already in the Lenspack chart. The access mode is
`superset-role`, the default.

| | |
|---|---|
| **At launch** | nobody holds `Lenspack user`, so only admins (the internal account) see the Ask button |
| **Open it to people later** | give them `Lenspack user` in Superset. It applies from their next page load |
| **What they see** | still only what Superset lets them see; the role only switches the assistant on |
| **Everyone else** | no Ask button; every chat route answers "The assistant isn't turned on for your account" |

Both roles are made by the Superset chart's setup script (`lenspack.roles.user` and `lenspack.roles.admin`), with no
Superset permissions of their own. They grant nothing in Superset itself.

## Where the settings live: inside Superset

**Setting:** `LENSPACK_ADMIN_SURFACE=superset`, in the Lenspack chart's `extraEnv`.

Every admin page (settings, usage, telemetry, review, models, off switches, cost, the audit log and access) opens
inside Superset's own frame, at `/superset/ai-assistant/`. The assistant's separate admin panel address leads there
too. We chose this because only one account has access at launch, and it already works in Superset.

**To fix before go-live:** Superset's menu entry (Settings → Manage → AI assistant) shows only for Superset Admins.
The internal account isn't one, so it would have to open the page by its address. The fix is for the plugin to also
show the entry to holders of the `Lenspack admin` role. That check stays inside Superset and needs no call to the
assistant.

## Lenspack version

| | |
|---|---|
| **In the deploy PRs today** | Lenspack `2b9eb83`. Roles for users and admins already work |
| **Needed for the choices above** | Lenspack #105 (access modes, the admins list, first-use audit lines, the new-admin notice) and #111 (where the admin pages live), both merged, then a new image |
| **Then** | bump `lenspack.image.tag` in the environment file (it pins both charts), add `LENSPACK_ADMIN_SURFACE`, and drop the admin-password key and comments from the Lenspack chart |

## The rest of the configuration

What the deploy PRs set today, and why.

| Setting | Value | Why |
|---|---|---|
| Datasets | the seven Gabon ITN virtual datasets in schema `analytics` (`itn_gab_area`, `itn_gab_sync_hourly`, `itn_gab_bales`, `itn_gab_task_points`, `itn_gab_reg_points`, `itn_gab_complaints`, `itn_gab_refresh`) | the dashboard's own datasets. Not `itn_gab_codes` (one row per bednet code) |
| Campaign | every answer is about the November 2026 campaign, set by the deployment (`scope`), whatever is picked on the dashboard | the datasets hold more than one campaign. `itn_gab_refresh` has no campaign column and stays unscoped |
| Personal data | the assistant never uses household ids, exact coordinates, bednet codes or complaint ids (`overlay.exclude.columns`), though the datasets hold them | rows go to the model provider. Without coordinates there are no maps in the pilot |
| Model | Claude Haiku only (`LENSPACK_LLM_PROVIDERS`) | the cheapest model that scored well on our evaluations |
| Daily spend cap | 20 USD for the whole deployment (`budget.usdPerDay`) | a ceiling, not an estimate |
| Language | French for the chat and the dashboard button | the campaign works in French |
| Name | "Ask HCM" ("Demander à HCM"), no "Powered by Lenspack" line | |
| Saved answers | off (`features.cache: false`) | they keep the words of questions |
| Question text in usage records | off (the default) | |
| Audit log | kept 30 days | it holds questions, answers and result rows |
| Voice (the mic) | off | until consent is per person |
| "My dashboards" | off | logins are shared on this Superset |
| Dashboard edits | `editScope: own` and edits follow Superset's dashboard rights. The internal account's read-only role can't edit, so in practice the pilot asks questions only | official dashboards stay as they are |
| Time zone | UTC | sync times are UTC hours; another zone would drop the hourly series |
| Storage | one replica; settings, usage records and the audit log on a 5 GiB volume at `/data` | |
| Health checks | the pod is ready only once Superset has given it the key that signs who is asking (`/readyz`); until then it refuses every chat and keeps retrying | |

**Maps, for later:** Superset 6.1 draws its point maps on OpenStreetMap tiles by default. Mapbox styles need a Mapbox
key. Neither applies to the pilot, since the assistant doesn't use coordinates.

## Before go-live

1. eGov creates the internal account and the Gabon-only read role, and gives it `Lenspack admin`.
2. Lenspack #105 and #111 merged (with the menu-entry fix), and the new image tag put in both deploy PRs with
   `LENSPACK_ADMIN_SURFACE=superset`.
3. The deploy PRs come out of draft for eGov's review. Secrets are added by eGov: the `lenspack` Superset login's
   password and the model key.
4. `lenspack.enabled: true` in the environment file.

## Checks after deploy

- **The pod** shows 1/1 ready. 0/1 means it is still waiting for Superset's signing key and retrying.
- **The server's start-up log** says who is an admin and who may use it:
  `admins: Superset role Lenspack admin from auth.admins (access superset-role, …)` and
  `users: Superset role Lenspack user and admins (access superset-role, …)`.
- **Signed in as the internal account:** the Ask button shows, a question about the campaign gets an answer, and
  Superset's AI assistant page opens with every section.
- **Signed in as anyone else:** no Ask button.
- **The usage pages** show the internal account's question, with its user name.

## Rolling out to more people

1. In Superset, give `Lenspack user` to the people who should try it.
2. Watch the usage and review pages for a few days: answers people mark wrong, refusals, spend against the cap.
3. Give `Lenspack admin` to anyone else who should run it. The new-admin notice tells existing admins.

## Open

- Whether eGov wants admins limited to named people (`superset-users`) rather than a role.
- Whether to turn dashboard edits off entirely (`boardEdits: false`) before anyone with edit rights gets the
  `Lenspack user` role.
- Whether filters picked on the dashboard should narrow answers. Today they are ignored and only the campaign scope
  applies.
