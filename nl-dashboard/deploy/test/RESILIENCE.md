# Resilience test

`resilience.sh` breaks the nl-dashboard compose stack in the ways a real deployment breaks: a restart, a crash, an
upgrade, Superset or the data source going away, and a state volume that is read-only or full. It checks that the
stack comes back by itself, keeps its settings, and answers again.

```sh
NLD=/path/to/deployed/nl-dashboard/deploy nl-dashboard/deploy/test/resilience.sh   # every scenario except chaos
NLD=… nl-dashboard/deploy/test/resilience.sh restart superset-down ui             # some of them
NLD=… CHAOS_ROUNDS=10 nl-dashboard/deploy/test/resilience.sh chaos                # random stops and starts
```

- **`NLD`**: the directory the stack was deployed from, holding `docker-compose.yml` and `.env`; default
  `nl-dashboard/deploy`. The script reads the Superset passwords from `.env` and never prints them.
- **`DASHBOARD`**: where the questions are asked; default 6.
- **`EXPECT_ENTITIES` / `EXPECT_MEASURES`**: what a complete pack has; default 8 / 40.
- **`WAIT`**: how long recovery may take before a check fails; default 150 s.
- **`OUT`**: where results and the backup go; default `deploy/test/resilience-out/<time>`, which is git-ignored.
- **`RESTORE`**:
  - `on-failure` (default) puts `/data` back from the backup if the stack doesn't end healthy;
  - `always` puts it back every time;
  - `never` leaves it.
- **The `ui` scenario** needs `EXE` (a Chromium or headless-shell binary) and `PLAYWRIGHT` (the path to
  Playwright's `index.mjs`). Without them it is skipped.

## What it touches

**Touched:**
- the `lenspack`, `superset` and `clickhouse-tunnel` containers: stop, start, restart, `SIGKILL`, and recreate with
  the deployed image and config;
- the lenspack `/data` volume, which is backed up to `OUT` first. The only change the test leaves in it is the audit
  lines for its own settings writes, because a marker setting (`speech.holdMs`) is written at the start and reset at
  the end.

**Never touched:** the `db` container and its volume (Superset's dashboards and datasets), and every dashboard.

**Questions** are read-only. They are asked as the `lenspack` account through Superset's `/lenspack` route, the way
the overlay asks them, with Haiku and the reviewer off. A full run costs well under a cent.

Tell anyone sharing the deployment before running it: each scenario takes Lenspack or Superset away for up to about
two minutes.

## Scenarios

| Scenario | What happens | Passes when |
|---|---|---|
| `restart` | `docker restart` Lenspack | healthy again; the marker setting is still there |
| `crash` | `SIGKILL` to Lenspack's main process | Docker restarts it (`unless-stopped`); healthy; marker kept |
| `upgrade` | recreate the Lenspack container, as a version bump does | healthy; marker kept in the volume |
| `superset-down` | stop Superset for 60 s | Lenspack stays up without restarting; healthy once Superset is back; answers |
| `both-restart` | restart Superset, then Lenspack while Superset is still starting | the pack comes back complete, not with datasets missing |
| `tunnel` | stop the ClickHouse tunnel for 60 s | Lenspack stays up and says it can't read the data, without naming hosts or ports; answers once the tunnel is back |
| `ui` | in a headless browser on the dashboard: stop Lenspack, then start it | the Ask Lenspack button stays visible and turns grey "Reconnecting…", then comes back by itself with no page reload |
| `readonly` | recreate Lenspack with `/data` mounted read-only | it serves and answers; back to normal afterwards |
| `full` | recreate Lenspack with `/data` on a 2 MB tmpfs and fill it (the host disk is never filled) | it serves and answers; back to normal afterwards |
| `chaos` | `CHAOS_ROUNDS` random restarts, kills, Superset and tunnel outages | healthy after each round |

"Healthy" means all of these:
- Superset `/health` returns 200;
- Lenspack's `/healthz` returns 200 through Superset;
- the pack has every entity and measure;
- a question on the dashboard gets an answer and no edits.

Each check writes one line to `OUT/results.tsv`. The script exits 1 if any check failed or the stack didn't end
healthy.

## Results

### 2026-11-23, 16c

Run against Lenspack `2e621ee` and Superset image `superset5-76676fb`, 09:51–09:57 CET. 24 checks passed and 2
failed, for $0.003 of model spend.

| Scenario | Result |
|---|---|
| restart | healthy after 10 s, settings kept |
| crash | Docker restarted it, healthy after 9 s, settings kept |
| upgrade (recreate) | healthy after 9 s, settings kept |
| superset-down | Lenspack stayed up (0 restarts); healthy 13 s after Superset started; answered in 4.1 s |
| both-restart | pack complete (8/8, 40 measures) after 14 s |
| tunnel | Lenspack stayed up and said the data couldn't be read, but named the internal host (the `no-address` check, added after this run, would have failed); answered again once the tunnel was back |
| ui | "Reconnecting…" 4.8 s after the stop, never vanished, normal again 12.2 s after the start, no reload |
| readonly | **failed**: Lenspack served, but binding a dashboard returned 500 (`EROFS` on `superset-boards.json`), so the chat couldn't open; a settings write returned a bare 500 |
| full | **failed**: same as read-only, with `ENOSPC` |
| end state | healthy, answering on dashboard 6; `/data` matched its backup |

The run turned up four problems. All four are fixed in lenspack#35:

1. **Binding a dashboard failed when `/data` couldn't be written.** The first use of a dashboard saves its
   widget-chart links, and a refused save failed the whole request. Now the links stay in memory, the log says so
   once, and the next save that works catches up.
2. **A refused settings write was half-applied.** It changed the running value, then returned a bare 500. Now it
   changes nothing and returns 503: "Lenspack can't save settings: the disk is full. Nothing was changed."
3. **A full disk could leave a truncated `superset-boards.json` behind.** The file was written in place, and a
   truncated file would stop the next start. Now it is written whole (a temporary file renamed into place), and an
   unreadable file is set aside instead of crashing the server.
4. **With the data source down, the chat named the internal host.** The database driver's message reached the
   model, and the model repeated the host to the person asking. Now the model hears "The data source is unreachable
   (connection refused)" or a similar reason, and other errors lose their URLs, hosts and ports. The raw error stays
   in the server log.

### 2026-11-23, 16c, after the fixes

Run against Lenspack `a109f45` (lenspack#35), 10:15–10:18 CET, scenarios `readonly full tunnel`. All 16 checks
passed, for $0.005 of model spend.

- **readonly and full:** Lenspack serves and answers (in 4.1 s and 4.3 s). A settings write gets 503 with the
  reason, and the settings on the volume are unchanged.
- **tunnel:** the reply says the data source is unreachable ("host not found") and names no host or port. The raw
  error is in the server log.
- **End state:** healthy, and `/data` matched its backup.
