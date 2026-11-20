"""Superset settings for the NL dashboard (Superset + Lenspack). Every value comes from the environment.

Environment:
  SUPERSET_SECRET_KEY      required. Signs sessions and encrypts saved database passwords. Keep it stable.
  SUPERSET_DATABASE_URI    metadata database URL; if unset, built from the DB_* variables below.
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
                           metadata Postgres (defaults: db, 5432, superset, -, superset).
  LENSPACK_URL             where browsers load the Lenspack overlay from, without a trailing slash:
                           a path on Superset's own host ("/lenspack", behind an ingress) or a full URL.
  LENSPACK_PORT            used when LENSPACK_URL is unset: Lenspack on the same host as Superset, this port.
  TALISMAN_ENABLED         Superset's security headers (CSP, X-Frame-Options). On by default; "false" only for the
                           two-port setup (LENSPACK_PORT), where the overlay and iframe are cross-origin.
"""

import os


def env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


SECRET_KEY = os.environ["SUPERSET_SECRET_KEY"]

SQLALCHEMY_DATABASE_URI = os.environ.get("SUPERSET_DATABASE_URI") or (
    "postgresql+psycopg2://{user}:{password}@{host}:{port}/{name}".format(
        user=os.environ.get("DB_USER", "superset"),
        password=os.environ["DB_PASSWORD"],
        host=os.environ.get("DB_HOST", "db"),
        port=os.environ.get("DB_PORT", "5432"),
        name=os.environ.get("DB_NAME", "superset"),
    )
)

# Behind a reverse proxy or ingress: trust X-Forwarded-* for scheme and host.
ENABLE_PROXY_FIX = True

SESSION_COOKIE_NAME = "superset_session"
SESSION_COOKIE_SAMESITE = "Lax"
WTF_CSRF_ENABLED = True

# The "beside" page frames Superset and the "inside" overlay loads a script from
# Lenspack. With Lenspack under Superset's own host (LENSPACK_URL=/lenspack) both
# are same-origin, so Superset's default CSP allows them: the overlay's script tag
# carries the page's nonce (templates/tail_js_custom_extra.html) and the iframe is
# SAMEORIGIN. On two ports they are cross-origin, and the CSP blocks them.
TALISMAN_ENABLED = env_bool("TALISMAN_ENABLED", True)

# Read by templates/tail_js_custom_extra.html.
LENSPACK_URL = os.environ.get("LENSPACK_URL", "").rstrip("/")
LENSPACK_PORT = os.environ.get("LENSPACK_PORT", "8795")
