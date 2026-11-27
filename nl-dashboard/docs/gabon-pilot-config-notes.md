# Gabon pilot: configuration notes

These notes record how the assistant ("Ask HCM") is set up for its first live rollout: the Gabon bednet (ITN)
distribution campaign, on the production Superset at `gabon-hcm.digit.org/superset`. They cover who can use it, who
runs it, where its settings live, the rest of its configuration, and what still has to happen before go-live.

The deployment itself is two draft pull requests in the Nigeria-DevOps repository: one adds the Lenspack server chart,
the other adds Lenspack's plugin to the Superset chart. Both read one shared `lenspack:` block in the environment file.

Decided on 27 November 2026 unless marked otherwise.

## In short

- **One internal account owns the assistant at launch.** eGov creates a Superset account for the pilot team only. The
  deployment names it by its Superset user id as the assistant's owner. It is not a Superset Admin.
- **The owner decides who else gets in, later.** On the assistant's Access page the owner adds admins and users by
  Superset user name or id. Nothing is redeployed.
- **Superset roles grant no admin.** A Superset Admin can't make themselves an admin of the assistant.
- **Nobody else sees the Ask button at launch.**
- **The settings live inside Superset**, on its own "AI assistant" page, not on a separate admin panel.
- **No admin passwords.** Everyone signs in through Superset.

## Who runs it: one internal account

**The ask to eGov:** a Superset account for the pilot team, with:

| | |
|---|---|
| **Who uses it** | the pilot team only; the password stays in the team's password store and is never put on a shared list |
| **Roles** | a read-only role that opens the Gabon ITN dashboard and its datasets and nothing else |
| **Not** | Superset's `Admin` role, or any role that opens other countries' or states' data on the same Superset |
| **We need back** | the account's Superset user id |

**Getting the id:** sign in as the account and open `https://gabon-hcm.digit.org/superset/api/v1/me/`. The reply's
`result.id` is the id. A Superset Admin can also read it in Settings → List Users. An id stays with one account; a
user name would pass admin to any new account later created with the same name.

**Why a read role scoped to Gabon:** the assistant answers with whatever data the person asking may see in Superset
(`hostPolicy: superset`). A Superset Admin account would put every dataset on this Superset within the assistant's
reach. A Gabon-only role keeps the pilot to the Gabon data even if a question wanders. Superset's dashboard roles
(`DASHBOARD_RBAC`) are on, so the role can open the dashboard by name.

**Why not the shared logins:** the chart's setup script resets the roles of its fixed `admin`, `editor` and `viewer`
logins on every start. And a login many people share can't tell the usage pages who asked.

## Who is an admin: named users

**Settings** (in the Lenspack block's `extraEnv`):

```
LENSPACK_ADMIN_ACCESS=superset-users
LENSPACK_ADMIN_USERS=id:{{pilot account user id}}    <-- needs updating
```

| | |
|---|---|
| **The owner** | the internal account. Owners come from the deployment and can't be removed on the page |
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
| **Image** | `b91d2bb`, in `lenspack.image.tag` in the environment file (it pins both charts) |
| **What it includes** | Lenspack #105 (access modes, named owners, the Access page, first-use audit lines, the new-admin notice) and #111 (where the admin pages live, and the menu entry for named admins) |

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

1. eGov creates the internal account with the Gabon-only read role and sends us its user id.
2. The account's id put in `LENSPACK_ADMIN_USERS` in the deploy PR.
3. The deploy PRs come out of draft for eGov's review. Secrets are added by eGov: the `lenspack` Superset login's
   password and the model key.
4. `lenspack.enabled: true` in the environment file.

## Checks after deploy

- **The pod** shows 1/1 ready. 0/1 means it is still waiting for Superset's signing key and retrying.
- **The server's start-up log** says who is an admin and who may use it:
  `admins: named Superset users (1 owner from LENSPACK_ADMIN_USERS, …` and a `users:` line naming
  `superset-role,granted`.
- **Signed in as the internal account:** the Ask button shows, a question about the campaign gets an answer, the
  AI assistant entry is in Superset's Settings menu, and its page opens with every section. The Access page lists the
  account as owner.
- **Signed in as anyone else:** no Ask button.
- **The usage pages** show the internal account's question, with its user name.

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
