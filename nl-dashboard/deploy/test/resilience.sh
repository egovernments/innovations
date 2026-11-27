#!/usr/bin/env bash
# Resilience test for the nl-dashboard compose stack (Superset + Lenspack + ClickHouse tunnel).
#
#   NLD=/path/to/deployed/nl-dashboard/deploy nl-dashboard/deploy/test/resilience.sh [scenario ...]
#   scenarios: restart crash upgrade superset-down both-restart tunnel ui readonly full chaos  (default: all but chaos)
#   CHAOS_ROUNDS=6 ... resilience.sh chaos      random stops and starts, health checked after each (a nightly job)
#   RESTORE=always|on-failure|never             put /data back from the backup at the end (default on-failure)
#
# What it touches: the lenspack, superset and clickhouse-tunnel containers (stop, start, restart, recreate), and
# the lenspack /data volume (backed up first, to $OUT). Never the Postgres volume (Superset's dashboards and
# datasets): db is not stopped, recreated or written. Edits go only to scratch boards; questions are read-only and
# asked on DASHBOARD (6) as the lenspack account, with Haiku and the reviewer off (a few cents in all).
# Passwords are read from $NLD/.env and passed to the helper through the environment, never printed.
#
# Results: one line per check in $OUT/results.tsv and a summary at the end; exit 1 if any check failed or the stack
# didn't end healthy (pack complete, Superset /health 200, Ask Lenspack answering).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
NLD="${NLD:-$(cd "$HERE/.." && pwd)}"
OUT="${OUT:-$HERE/resilience-out/$(date +%Y%m%d-%H%M%S)}"
DASHBOARD="${DASHBOARD:-6}"
EXPECT_ENTITIES="${EXPECT_ENTITIES:-8}"
EXPECT_MEASURES="${EXPECT_MEASURES:-40}"
RESTORE="${RESTORE:-on-failure}"
WAIT="${WAIT:-150}"           # seconds to wait for recovery before calling it a failure
LP=nl-dashboard-lenspack-1 SS=nl-dashboard-superset-1 TUN=nl-dashboard-clickhouse-tunnel-1 VOL=nl-dashboard_lenspack
HTTP="python3 -I $HERE/resilience_http.py"
mkdir -p "$OUT"
envget() { grep "^$1=" "$NLD/.env" | cut -d= -f2-; }
export SS_ADMIN_PW="$(envget SUPERSET_ADMIN_PASSWORD)" SS_USER_PW="$(envget LENSPACK_SUPERSET_PASSWORD)"
compose() { (cd "$NLD" && docker compose "$@"); }

FAILS=0
log() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$OUT/log.txt"; }
result() { # scenario check pass|fail detail
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$OUT/results.tsv"
  [ "$3" = pass ] || FAILS=$((FAILS + 1))
  log "[$3] $1 / $2: $4"
}
field() { python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get(sys.argv[2], ''))" "$1" "$2" 2>/dev/null; }
healthy() { # the whole stack answers and the pack is complete
  local h; h="$($HTTP health 2>/dev/null)"
  [ "$(field "$h" superset)" = 200 ] && [ "$(field "$h" lenspack)" = 200 ] && [ "$(field "$h" entities)" = "$EXPECT_ENTITIES" ] && [ "$(field "$h" measures)" = "$EXPECT_MEASURES" ]
}
wait_healthy() { # prints seconds taken, or returns 1 after WAIT
  local t0=$SECONDS
  while [ $((SECONDS - t0)) -lt "$WAIT" ]; do
    if healthy; then echo $((SECONDS - t0)); return 0; fi
    sleep 3
  done
  echo "$WAIT"; return 1
}
restarts() { docker inspect -f '{{.RestartCount}}' "$1"; }
running() { docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null; }
ask() { $HTTP ask "$DASHBOARD" "${1:-How many households were registered?}"; }
ask_check() { # scenario label
  local a; a="$(ask)"; echo "$a" >> "$OUT/answers.jsonl"
  if [ "$(field "$a" ok)" = True ] && [ "$(field "$a" edit_calls)" = 0 ]; then result "$1" "$2" pass "answered in $(field "$a" ms) ms"; else result "$1" "$2" fail "$(echo "$a" | cut -c1-200)"; fi
}
marker() { $HTTP setting get | python3 -c "import json,sys; print(json.load(sys.stdin).get('holdMs'))"; }
MARK=1700

preflight() {
  log "preflight: NLD=$NLD OUT=$OUT"
  if ! healthy; then result preflight healthy fail "$($HTTP health)"; log "the stack isn't healthy before the test; stopping"; exit 1; fi
  result preflight healthy pass "$($HTTP health)"
  docker run --rm -v "$VOL":/data:ro -v "$OUT":/b alpine:3.24.4 tar czf /b/lenspack-data.tgz -C /data . && result preflight backup pass "$OUT/lenspack-data.tgz ($(du -h "$OUT/lenspack-data.tgz" | cut -f1))" || { result preflight backup fail "tar failed"; exit 1; }
  $HTTP setting put "{\"holdMs\": $MARK}" > /dev/null
  [ "$(marker)" = "$MARK" ] && result preflight marker pass "speech.holdMs=$MARK saved" || result preflight marker fail "could not save the marker"
}

s_restart() {
  log "restart: docker restart lenspack"
  docker restart "$LP" > /dev/null
  local t; t=$(wait_healthy) && result restart recovers pass "healthy after ${t}s" || result restart recovers fail "not healthy after ${t}s"
  [ "$(marker)" = "$MARK" ] && result restart settings pass "marker kept" || result restart settings fail "marker is $(marker)"
}

s_crash() {
  log "crash: SIGKILL to lenspack's main process (by PID from docker inspect)"
  local pid before; pid=$(docker inspect -f '{{.State.Pid}}' "$LP"); before=$(restarts "$LP")
  kill -KILL "$pid" 2>/dev/null || docker exec "$LP" sh -c 'kill -KILL 1' 2>/dev/null
  local t; t=$(wait_healthy) && result crash recovers pass "restarted by Docker (restarts $before -> $(restarts "$LP")), healthy after ${t}s" || result crash recovers fail "not healthy after ${t}s; running=$(running "$LP")"
  [ "$(marker)" = "$MARK" ] && result crash settings pass "marker kept" || result crash settings fail "marker is $(marker)"
}

s_upgrade() {
  log "upgrade: recreate the lenspack container (same image, as a version bump does)"
  compose up -d --no-deps --force-recreate lenspack > /dev/null 2>&1
  local t; t=$(wait_healthy) && result upgrade recovers pass "healthy after ${t}s" || result upgrade recovers fail "not healthy after ${t}s"
  [ "$(marker)" = "$MARK" ] && result upgrade settings pass "marker kept across a new container" || result upgrade settings fail "marker is $(marker)"
}

s_superset_down() {
  log "superset-down: stop Superset 60 s with Lenspack running"
  local before; before=$(restarts "$LP")
  docker stop "$SS" > /dev/null; sleep 60
  [ "$(running "$LP")" = true ] && result superset-down lenspack-stays-up pass "lenspack running, restarts $before -> $(restarts "$LP")" || result superset-down lenspack-stays-up fail "lenspack running=$(running "$LP")"
  docker start "$SS" > /dev/null
  local t; t=$(wait_healthy) && result superset-down recovers pass "healthy ${t}s after Superset started, no Lenspack restart needed (restarts $(restarts "$LP"))" || result superset-down recovers fail "not healthy after ${t}s"
  ask_check superset-down answers
}

s_both_restart() {
  log "both-restart: restart Superset, then Lenspack while Superset is still starting (pack completeness)"
  docker restart "$SS" > /dev/null & sleep 3; docker restart "$LP" > /dev/null; wait
  local t; t=$(wait_healthy) && result both-restart pack-complete pass "8/8 entities, $EXPECT_MEASURES measures after ${t}s" || result both-restart pack-complete fail "$($HTTP health)"
  docker logs --since 5m "$LP" 2>&1 | grep -E "pack .*datasets|failed|trying again" | tail -4 >> "$OUT/log.txt"
}

s_tunnel() {
  log "tunnel: stop the ClickHouse tunnel 60 s"
  if [ "$(running "$TUN")" != true ]; then result tunnel skipped pass "no tunnel container running"; return; fi
  docker stop "$TUN" > /dev/null
  local a; a="$(ask)"; echo "$a" >> "$OUT/answers.jsonl"
  [ "$(running "$LP")" = true ] && result tunnel lenspack-stays-up pass "a question without data: $(field "$a" reply | cut -c1-120)" || result tunnel lenspack-stays-up fail "lenspack running=$(running "$LP")"
  # The reply must not hand on the deployment's internals: the tunnel's service name, ports, URLs.
  if field "$a" reply | grep -qiE "clickhouse-tunnel|:[0-9]{4,5}\b|https?://"; then result tunnel no-address fail "the reply names an address: $(field "$a" reply | cut -c1-160)"; else result tunnel no-address pass "no hosts or ports in the reply"; fi
  sleep 45
  docker start "$TUN" > /dev/null; sleep 10
  ask_check tunnel answers-after
}

s_ui() {
  log "ui: the Ask Lenspack button while Lenspack restarts (headless browser on dashboard $DASHBOARD)"
  if [ -z "${EXE:-}" ] || [ -z "${PLAYWRIGHT:-}" ]; then result ui skipped pass "set EXE (chromium) and PLAYWRIGHT (module path) to run it"; return; fi
  local r; r="$(SS_USER_PW="$SS_USER_PW" node "$HERE/resilience_ui.mjs" "$DASHBOARD" "$LP" 2>&1 | tail -1)"; echo "$r" >> "$OUT/ui.jsonl"
  [ "$(field "$r" ok)" = True ] && result ui reconnects pass "$r" || result ui reconnects fail "$r"
  wait_healthy > /dev/null
}

override_run() { # scenario, override yaml text: recreate lenspack with it, then put the normal one back
  printf '%s\n' "$2" > "$OUT/override-$1.yml"
  (cd "$NLD" && docker compose -f docker-compose.yml -f "$OUT/override-$1.yml" up -d --no-deps --force-recreate lenspack > /dev/null 2>&1)
}
back_to_normal() {
  compose up -d --no-deps --force-recreate lenspack > /dev/null 2>&1
  local t; t=$(wait_healthy) && result "$1" back-to-normal pass "healthy after ${t}s" || result "$1" back-to-normal fail "not healthy after ${t}s"
  [ "$(marker)" = "$MARK" ] && result "$1" settings pass "marker kept in the volume" || result "$1" settings fail "marker is $(marker)"
}

s_readonly() {
  log "readonly: lenspack with /data mounted read-only"
  # Compose merges a service's volumes by target, so this one line replaces the /data mount.
  override_run readonly "services: { lenspack: { volumes: [ \"lenspack:/data:ro\" ] } }"
  sleep 25
  local st; st="$(docker inspect -f '{{.State.Status}} restarts={{.RestartCount}}' "$LP")"
  docker logs --tail 15 "$LP" > "$OUT/readonly-logs.txt" 2>&1
  if healthy; then
    local p; p="$($HTTP setting put '{"holdMs": 1800}')"
    result readonly serves pass "answers with /data read-only ($st); a settings write gave: $(echo "$p" | cut -c1-120)"
    ask_check readonly answers
  else
    result readonly serves fail "not serving with /data read-only ($st); last log: $(grep -v '^\s*at ' "$OUT/readonly-logs.txt" | tail -2 | tr '\n' ' ' | cut -c1-200)"
  fi
  back_to_normal readonly
}

s_full() {
  log "full: lenspack with /data on a 2 MB tmpfs, filled up (the host disk is never touched)"
  # !override drops the volume from /data (the config file stays), so the tmpfs takes its place.
  override_run full "services:
  lenspack:
    volumes: !override
      - ./lenspack/\${LENSPACK_CONFIG:-lenspack-superset.yaml}:/config/lenspack-superset.yaml:ro
    tmpfs:
      - /data:size=2m,uid=1000,gid=1000"
  local t; t=$(wait_healthy) || true
  docker exec "$LP" sh -c 'dd if=/dev/zero of=/data/fill bs=64k 2>/dev/null; df -h /data | tail -1' >> "$OUT/log.txt" 2>&1
  local p; p="$($HTTP setting put '{"holdMs": 1900}')"
  sleep 3
  if [ "$(running "$LP")" = true ] && healthy; then
    result full survives pass "still serving with /data full; a settings write gave: $(echo "$p" | cut -c1-120)"
    ask_check full answers
  else
    result full survives fail "running=$(running "$LP"); $(docker logs --tail 5 "$LP" 2>&1 | tr '\n' ' ' | cut -c1-200)"
  fi
  back_to_normal full
}

s_chaos() {
  local n="${CHAOS_ROUNDS:-6}" i
  log "chaos: $n random stops and starts"
  for i in $(seq 1 "$n"); do
    case $((RANDOM % 4)) in
      0) log "chaos $i: restart lenspack"; docker restart "$LP" > /dev/null ;;
      1) log "chaos $i: kill lenspack"; kill -KILL "$(docker inspect -f '{{.State.Pid}}' "$LP")" 2>/dev/null ;;
      2) local d=$((20 + RANDOM % 40)); log "chaos $i: stop Superset ${d}s"; docker stop "$SS" > /dev/null; sleep "$d"; docker start "$SS" > /dev/null ;;
      3) if [ "$(running "$TUN")" = true ]; then local d=$((10 + RANDOM % 30)); log "chaos $i: stop the tunnel ${d}s"; docker stop "$TUN" > /dev/null; sleep "$d"; docker start "$TUN" > /dev/null; else log "chaos $i: no tunnel; restart lenspack"; docker restart "$LP" > /dev/null; fi ;;
    esac
    local t; t=$(wait_healthy) && result chaos "round-$i" pass "healthy after ${t}s" || result chaos "round-$i" fail "not healthy after ${t}s"
  done
}

finish() {
  log "finish: reset the marker, check the end state"
  for c in "$SS" "$LP"; do [ "$(running "$c")" = true ] || docker start "$c" > /dev/null; done
  [ "$(running "$TUN")" = true ] || docker start "$TUN" > /dev/null 2>&1
  local t; t=$(wait_healthy) || true
  $HTTP setting put '{"holdMs": null}' > /dev/null
  local endok=1
  healthy && result end healthy pass "$($HTTP health)" || { result end healthy fail "$($HTTP health)"; endok=0; }
  ask_check end "answers on dashboard $DASHBOARD"
  if [ "$RESTORE" = always ] || { [ "$RESTORE" = on-failure ] && [ $endok = 0 ]; }; then
    log "restoring /data from $OUT/lenspack-data.tgz"
    docker stop "$LP" > /dev/null
    docker run --rm -v "$VOL":/data -v "$OUT":/b alpine:3.24.4 sh -c 'find /data -mindepth 1 -delete && tar xzf /b/lenspack-data.tgz -C /data'
    docker start "$LP" > /dev/null
    t=$(wait_healthy) && result end restored pass "healthy after restore (${t}s)" || result end restored fail "not healthy after restore"
  fi
  local pass fail; pass=$(grep -c $'\tpass\t' "$OUT/results.tsv"); fail=$(grep -c $'\tfail\t' "$OUT/results.tsv")
  local usd; usd=$(python3 -c "import json,sys; print(round(sum((json.loads(l).get('usd') or 0) for l in open(sys.argv[1])), 4))" "$OUT/answers.jsonl" 2>/dev/null || echo 0)
  log "summary: $pass passed, $fail failed; model spend \$$usd; results in $OUT/results.tsv"
  [ "$fail" = 0 ]
}

SCEN=("$@"); [ ${#SCEN[@]} -eq 0 ] && SCEN=(restart crash upgrade superset-down both-restart tunnel ui readonly full)
preflight
for s in "${SCEN[@]}"; do
  case "$s" in
    restart) s_restart ;; crash) s_crash ;; upgrade) s_upgrade ;; superset-down) s_superset_down ;;
    both-restart) s_both_restart ;; tunnel) s_tunnel ;; ui) s_ui ;; readonly) s_readonly ;; full) s_full ;; chaos) s_chaos ;;
    *) log "unknown scenario $s" ;;
  esac
done
finish
