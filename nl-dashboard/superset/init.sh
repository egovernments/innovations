#!/usr/bin/env bash
# One-off Superset setup: metadata schema, the admin, roles and permissions. Safe to run again
# (an existing admin is left as it is). Lenspack makes its own account on its first start.
# Environment: SUPERSET_ADMIN_PASSWORD (and superset_config.py's).
set -euo pipefail
superset db upgrade
superset fab create-admin --username admin --firstname Superset --lastname Admin \
  --email admin@nl-dashboard.local --password "$SUPERSET_ADMIN_PASSWORD" || echo "admin: kept as it is"
superset init
