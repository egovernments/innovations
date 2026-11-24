#!/usr/bin/env bash
# Exports the three indices (export.py) and loads them into the "hcm" database of the compose Postgres.
# Run from nl-dashboard/ with the stack up:  ES_URL=http://… sample-data/load.sh
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
docker compose exec -T db psql -q -U superset -d hcm < sample-data/schema.sql
for t in task household stock; do
  python3 sample-data/export.py "$t" > "$tmp/$t.csv"
  docker compose exec -T db psql -q -U superset -d hcm -c "\copy hcm_$t FROM STDIN WITH (FORMAT csv, HEADER true)" < "$tmp/$t.csv"
  echo "hcm_$t: $(($(wc -l < "$tmp/$t.csv") - 1)) rows"
done
