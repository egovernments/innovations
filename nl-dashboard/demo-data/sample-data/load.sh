#!/usr/bin/env bash
# Exports the three indices (export.py) and loads them into the "hcm" database of the compose Postgres.
# With the stack up (nl-dashboard/deploy), from anywhere:  ES_URL=http://… nl-dashboard/demo-data/sample-data/load.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
compose() { docker compose -f "$here/../../deploy/docker-compose.yml" "$@"; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
compose exec -T db psql -q -U superset -d hcm < "$here/schema.sql"
for t in task household stock; do
  python3 "$here/export.py" "$t" > "$tmp/$t.csv"
  compose exec -T db psql -q -U superset -d hcm -c "\copy hcm_$t FROM STDIN WITH (FORMAT csv, HEADER true)" < "$tmp/$t.csv"
  echo "hcm_$t: $(($(wc -l < "$tmp/$t.csv") - 1)) rows"
done
