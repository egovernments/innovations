"""Superset settings for the NL dashboard (Superset + Lenspack). Every value comes from the environment.

Lenspack's own additions live in lenspack_superset.py, imported at the end; that module is all an existing
Superset deployment needs (docs/ADD-TO-EXISTING-SUPERSET.md).

Environment:
  SUPERSET_SECRET_KEY      required. Signs sessions and encrypts saved database passwords. Keep it stable.
  SUPERSET_DATABASE_URI    metadata database URL; if unset, built from the DB_* variables below.
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
                           metadata Postgres (defaults: db, 5432, superset, -, superset).
  TALISMAN_ENABLED         Superset's security headers (CSP, X-Frame-Options). On by default.
  LENSPACK_*               see lenspack_superset.py.
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

# Behind a reverse proxy or ingress: trust X-Forwarded-* for scheme and host. One hop: the
# compose nginx (or the ingress) sets X-Forwarded-Proto/-Host to a single value, passing on a
# TLS gateway's when there is one, so https://<public host>/ links come out on the gateway path
# and http:// links on the direct one. X-Forwarded-For is appended per hop; trusting one entry
# means Superset logs the nearest proxy's address, never a value a client could set.
ENABLE_PROXY_FIX = True
PROXY_FIX_CONFIG = {"x_for": 1, "x_proto": 1, "x_host": 1, "x_port": 1, "x_prefix": 1}
# Session cookies are not marked Secure here, so plain-http access keeps working; a TLS gateway
# adds the flag on its path (nginx: proxy_cookie_flags ~ secure samesite=lax;). Talisman sends
# HSTS only on https requests and never redirects http to https (force_https stays False).

SESSION_COOKIE_NAME = "superset_session"
SESSION_COOKIE_SAMESITE = "Lax"
WTF_CSRF_ENABLED = True

TALISMAN_ENABLED = env_bool("TALISMAN_ENABLED", True)

# Superset's language menu (top right): English and French. Superset ships no Hindi; Lenspack's
# chat has its own language choice for that.
LANGUAGES = {
    "en": {"flag": "us", "name": "English"},
    "fr": {"flag": "fr", "name": "French"},
}


# Lenspack: the AI assistant page, the overlay's settings and the Flask-AppBuilder list-filter fix.
from lenspack_superset import *  # noqa: E402,F401,F403
