#!/usr/bin/env bash
# One-off Superset setup: metadata schema, the admin, Lenspack's service account,
# roles and permissions. Safe to run again (existing users are left as they are).
# Environment: SUPERSET_ADMIN_PASSWORD, LENSPACK_SUPERSET_PASSWORD (and superset_config.py's).
set -euo pipefail
superset db upgrade
superset fab create-admin --username admin --firstname Superset --lastname Admin \
  --email admin@nl-dashboard.local --password "$SUPERSET_ADMIN_PASSWORD" || echo "admin: kept as it is"
# Lenspack signs in as this account to read datasets, run chart data and edit
# dashboards. Admin for the demo; give it a narrower role for real use (README).
superset fab create-user --role Admin --username lenspack --firstname Lenspack --lastname Service \
  --email lenspack@nl-dashboard.local --password "$LENSPACK_SUPERSET_PASSWORD" || echo "lenspack: kept as it is"
superset init
