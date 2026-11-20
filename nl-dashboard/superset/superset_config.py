"""Superset settings for the NL dashboard (Superset + Lenspack). Every value comes from the environment.

Environment:
  SUPERSET_SECRET_KEY      required. Signs sessions and encrypts saved database passwords. Keep it stable.
  SUPERSET_DATABASE_URI    metadata database URL; if unset, built from the DB_* variables below.
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
                           metadata Postgres (defaults: db, 5432, superset, -, superset).
  LENSPACK_URL             where browsers load the Lenspack overlay from, without a trailing slash:
                           a path on Superset's own host ("/lenspack", behind an ingress) or a full URL.
  LENSPACK_PORT            used when LENSPACK_URL is unset: Lenspack on the same host as Superset, this port.
  TALISMAN_ENABLED         Superset's security headers (CSP, X-Frame-Options). On by default.
  LENSPACK_BESIDE_ORIGINS  space-separated origins allowed to frame Superset (the "beside" page on its own
                           port, e.g. "http://superset-host:8795"). Added to the CSP's frame-ancestors.
  LENSPACK_INTERNAL_URL    where Superset's server reaches Lenspack, for the Settings → AI assistant page
                           (default http://lenspack:8795).
  LENSPACK_BESIDE_URL      where browsers reach the beside page, for links on that page (optional).
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

# The beside page on another origin (its own port) frames Superset: allow exactly those
# origins in the CSP's frame-ancestors, and drop X-Frame-Options (SAMEORIGIN would win in
# older browsers; frame-ancestors replaces it).
LENSPACK_BESIDE_ORIGINS = os.environ.get("LENSPACK_BESIDE_ORIGINS", "").split()
if LENSPACK_BESIDE_ORIGINS:
    from superset.config import TALISMAN_CONFIG as _DEFAULT_TALISMAN

    TALISMAN_CONFIG = {
        **_DEFAULT_TALISMAN,
        "content_security_policy": {
            **_DEFAULT_TALISMAN["content_security_policy"],
            "frame-ancestors": ["'self'", *LENSPACK_BESIDE_ORIGINS],
        },
        "frame_options": None,
    }

# Read by templates/tail_js_custom_extra.html.
LENSPACK_URL = os.environ.get("LENSPACK_URL", "").rstrip("/")
LENSPACK_PORT = os.environ.get("LENSPACK_PORT", "8795")

# Settings → Manage → "AI assistant": what Lenspack runs with (datasets, models, where the LLM key
# comes from, budget, today's usage) and Superset's data connections. Admins only. No fork: Superset
# calls FLASK_APP_MUTATOR once Flask-AppBuilder is set up, before its own views. Never shows secrets.
LENSPACK_INTERNAL_URL = os.environ.get("LENSPACK_INTERNAL_URL", "http://lenspack:8795").rstrip("/")
LENSPACK_BESIDE_URL = os.environ.get("LENSPACK_BESIDE_URL", "").rstrip("/")


def _lenspack_settings(app):
    import json
    import urllib.request

    from flask import abort
    from flask_appbuilder import BaseView, expose
    from flask_appbuilder.security.decorators import has_access

    from superset.extensions import appbuilder, db, security_manager

    def fetch(path):
        try:
            with urllib.request.urlopen(LENSPACK_INTERNAL_URL + path, timeout=5) as r:
                return json.load(r), None
        except Exception as e:  # unreachable, 404, not JSON: say so on the page
            return None, f"{type(e).__name__}: {str(e)[:160]}"

    class LenspackSettingsView(BaseView):
        route_base = "/ai-assistant"
        default_view = "index"

        @expose("/")
        @has_access
        def index(self):
            if not security_manager.is_admin():
                abort(403)
            from superset.models.core import Database

            settings, settings_error = fetch("/_superset/settings")
            info = None
            if settings is None:
                info, _ = fetch("/_superset/info")
            usage, usage_error = fetch("/api/_usage")
            databases = [
                {
                    "name": d.database_name,
                    "backend": d.backend,
                    # Superset stores the URI with the password already masked (XXXXXXXXXX).
                    "uri": d.sqlalchemy_uri,
                    "datasets": len(d.tables),
                }
                for d in db.session.query(Database).order_by(Database.database_name)
            ]
            account = security_manager.find_user(username="lenspack")
            return self.render_template(
                "lenspack/settings.html",
                settings=settings,
                settings_error=settings_error,
                info=info,
                usage=usage,
                usage_error=usage_error,
                databases=databases,
                account_roles=[r.name for r in account.roles] if account else None,
                lenspack_url=LENSPACK_URL or "",
                beside_url=LENSPACK_BESIDE_URL,
                internal_url=LENSPACK_INTERNAL_URL,
            )

    appbuilder.add_view_no_menu(LenspackSettingsView)
    appbuilder.add_link(
        "AI assistant",
        label="AI assistant",
        href="/ai-assistant/",
        icon="fa-comments",
        category="Manage",
        cond=lambda: security_manager.is_admin(),
    )


FLASK_APP_MUTATOR = _lenspack_settings
