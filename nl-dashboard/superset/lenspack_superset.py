"""Lenspack's additions to Superset 5, as one module. No fork and no custom image needed.

Load it at the end of superset_config.py (on the Helm chart: a configOverrides entry):

    from lenspack_superset import *  # noqa: F401,F403

It adds the Settings → Manage → "AI assistant" page (FLASK_APP_MUTATOR), the settings that
templates/tail_js_custom_extra.html reads to load the "Ask Lenspack" overlay, a fix for concurrent
list requests in Flask-AppBuilder, and (only with LENSPACK_BESIDE_ORIGINS) CSP frame-ancestors for the
beside page. If your config already sets FLASK_APP_MUTATOR, call lenspack_app_mutator(app) from yours
and set FLASK_APP_MUTATOR back to yours after this import.

Environment:
  LENSPACK_URL             where browsers load the Lenspack overlay from, without a trailing slash:
                           a path on Superset's own host ("/lenspack", behind an ingress) or a full URL.
  LENSPACK_PORT            used when LENSPACK_URL is unset: Lenspack on the same host as Superset, this port.
  LENSPACK_BESIDE_ORIGINS  space-separated origins allowed to frame Superset (the "beside" page on its own
                           port, e.g. "http://superset-host:8795"). Added to the CSP's frame-ancestors.
  LENSPACK_INTERNAL_URL    where Superset's server reaches Lenspack, for the Settings → AI assistant page
                           (default http://lenspack:8795).
  LENSPACK_BESIDE_URL      where browsers reach the beside page, for links on that page (optional).
  LENSPACK_SETTINGS_TOKEN  shared with the Lenspack container; lets the AI assistant page change Lenspack's
                           runtime settings (chat model, speech-to-text model). Unset: the page is read-only.
  LENSPACK_TEMPLATES       a folder of templates that take precedence over Superset's own: tail_js_custom_extra.html
                           and lenspack/settings.html. Default: "templates" next to this file, if it exists. Lets a
                           stock image use them from a mounted folder instead of files copied into the image.
"""

import os

# Import the ClickHouse driver once, while the config loads. Otherwise Superset imports it lazily
# from several request threads at once after a restart, and a worker can fail with "partially
# initialized module clickhouse_connect.common" until it is restarted.
try:
    import clickhouse_connect  # noqa: F401
    import clickhouse_connect.cc_sqlalchemy.dialect  # noqa: F401
except ImportError:  # the image without clickhouse-connect
    pass


# Flask-AppBuilder 4.x (the line Superset 5 pins) keeps the filters of a list request on the API view, which is
# one object per worker: `GET /api/v1/<thing>/?q=(filters:...)` clears and refills `self._filters` and then runs
# the query. Superset serves with gunicorn gthread (20 threads per worker), so two list requests at the same time
# can swap filters, and a lookup of dataset "a" answers with dataset "b" (or nothing). Build the filters per request.
# Every release from 4.5.5 to 5.3.0 has it. A version that already builds its filters per request is left alone, so
# the patch is safe to keep after an upgrade.
def _per_request_list_filters() -> None:
    import inspect

    from flask_appbuilder.api import ModelRestApi
    from flask_appbuilder.const import API_FILTERS_RIS_KEY

    try:
        if "self._filters" not in inspect.getsource(ModelRestApi._handle_filters_args):
            return
    except (OSError, TypeError):  # no source to inspect: patch anyway, the replacement is equivalent
        pass

    def _handle_filters_args(self, rison_args):
        filters = self.datamodel.get_filters(search_columns=self.search_columns, search_filters=self.search_filters)
        filters.rest_add_filters(rison_args.get(API_FILTERS_RIS_KEY, []))
        return filters.get_joined_filters(self._base_filters)

    ModelRestApi._handle_filters_args = _handle_filters_args


_per_request_list_filters()


# The "beside" page frames Superset and the "inside" overlay loads a script from
# Lenspack. With Lenspack under Superset's own host (LENSPACK_URL=/lenspack) both
# are same-origin, so Superset's default CSP allows them: the overlay's script tag
# carries the page's nonce (templates/tail_js_custom_extra.html) and the iframe is
# SAMEORIGIN. On two ports they are cross-origin, and the CSP blocks them.
#
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
LENSPACK_SETTINGS_TOKEN = os.environ.get("LENSPACK_SETTINGS_TOKEN", "")

# Speech-to-text models measured by the lab's voice bench (OpenRouter, with a language hint):
# word error rate on four test sets and median latency. Help text on the AI assistant page only.
STT_BENCH = {
    "mistralai/voxtral-mini-transcribe-3-0": ("6.4%", "9.1%", "3.5%", "8.2%", "0.67 s"),
    "assemblyai/universal-3-6-pro": ("6.6%", "8.5%", "3.9%", "9.4%", "0.37 s"),
    "deepgram/nova-3": ("5.1%", "8.6%", "7.5%", "14.0%", "0.65 s"),
    "elevenlabs/scribe-v2": ("7.5%", "8.6%", "3.0%", "11.7%", "0.75 s"),
    "google/chirp-3": ("6.4%", "9.6%", "3.9%", "7.8%", "1.91 s"),
    "google/gemini-3.5-transcribe": ("7.7%", "8.6%", "3.4%", "7.4%", "2.31 s"),
    "nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b": ("7.5%", "11.1%", "12.1%", "13.3%", "1.33 s"),
    "openai/gpt-4o-mini-transcribe": ("10.3%", "14.6%", "4.2%", "13.6%", "0.85 s"),
    "openai/gpt-transcribe": ("5.5%", "8.2%", "3.7%", "10.4%", "0.84 s"),
    "openai/whisper-large-v3-turbo": ("9.2%", "13.9%", "7.9%", "61.9%", "1.41 s"),
    "qwen/qwen3-asr-1.7b": ("4.0%", "8.6%", "4.2%", "13.7%", "0.80 s"),
}
LENSPACK_BESIDE_URL = os.environ.get("LENSPACK_BESIDE_URL", "").rstrip("/")
LENSPACK_TEMPLATES = os.environ.get("LENSPACK_TEMPLATES") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "templates"
)


def lenspack_app_mutator(app):
    # Templates from a mounted folder win over Superset's own (its tail_js_custom_extra.html is documented as
    # overridable). Without the folder, the templates must be in /app/superset/templates, as in a built image.
    if os.path.isdir(LENSPACK_TEMPLATES):
        from jinja2 import ChoiceLoader, FileSystemLoader

        app.jinja_loader = ChoiceLoader([FileSystemLoader(LENSPACK_TEMPLATES), app.jinja_loader])

    import json
    import urllib.error
    import urllib.request

    from flask import abort, flash, redirect, request
    from flask_appbuilder import BaseView, expose
    from flask_appbuilder.security.decorators import has_access

    from superset.extensions import appbuilder, db, security_manager

    def fetch(path):
        try:
            with urllib.request.urlopen(LENSPACK_INTERNAL_URL + path, timeout=5) as r:
                return json.load(r), None
        except Exception as e:  # unreachable, 404, not JSON: say so on the page
            return None, f"{type(e).__name__}: {str(e)[:160]}"

    def put(path, body):
        """Change a Lenspack runtime setting. The token never reaches the browser."""
        req = urllib.request.Request(
            LENSPACK_INTERNAL_URL + path,
            data=json.dumps(body).encode(),
            method="PUT",
            headers={"content-type": "application/json", "x-lenspack-settings-token": LENSPACK_SETTINGS_TOKEN},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.load(r), None
        except urllib.error.HTTPError as e:
            try:
                return None, json.load(e).get("error") or f"HTTP {e.code}"
            except Exception:
                return None, f"HTTP {e.code}"
        except Exception as e:
            return None, f"{type(e).__name__}: {str(e)[:160]}"

    def saved(what, result):
        data, error = result
        flash(f"{what} saved." if error is None else f"{what} not saved: {error}", "info" if error is None else "danger")
        return redirect("/ai-assistant/")

    class LenspackSettingsView(BaseView):
        route_base = "/ai-assistant"
        default_view = "index"
        # The forms below use the page's own permission (can_index), so no new permissions to sync.
        method_permission_name = {"index": "index", "chat": "index", "speech": "index", "language": "index"}

        @expose("/")
        @has_access
        def index(self):
            if not security_manager.is_admin():
                abort(403)
            from superset.models.core import Database

            settings, settings_error = fetch("/_superset/settings")
            stt_models = None
            if settings and settings.get("speech"):
                stt_models, _ = fetch("/_superset/settings/speech/models")
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
                stt_models=stt_models,
                stt_bench=STT_BENCH,
                token_set=bool(LENSPACK_SETTINGS_TOKEN),
            )

        # Forms on the page. Admin only, Superset's CSRF token required (Flask-WTF checks every POST).
        @expose("/chat", methods=["POST"])
        @has_access
        def chat(self):
            if not security_manager.is_admin():
                abort(403)
            if request.form.get("reset"):
                return saved("Chat model", put("/_superset/settings/chat", {"model": None}))
            model, _, effort = request.form.get("choice", "").partition("|")
            return saved("Chat model", put("/_superset/settings/chat", {"model": model, "effort": effort or None}))

        @expose("/speech", methods=["POST"])
        @has_access
        def speech(self):
            if not security_manager.is_admin():
                abort(403)
            model = None if request.form.get("reset") else request.form.get("model", "")
            return saved("Speech-to-text model", put("/_superset/settings/speech", {"model": model}))

        @expose("/language", methods=["POST"])
        @has_access
        def language(self):
            if not security_manager.is_admin():
                abort(403)
            if request.form.get("reset"):
                body = {"default": None, "titles": None, "board": None}
            else:
                body = {k: request.form[k] for k in ("default", "titles", "board") if request.form.get(k)}
            return saved("Chat language", put("/_superset/settings/language", body))

    appbuilder.add_view_no_menu(LenspackSettingsView)
    appbuilder.add_link(
        "AI assistant",
        label="AI assistant",
        href="/ai-assistant/",
        icon="fa-comments",
        category="Manage",
        cond=lambda: security_manager.is_admin(),
    )


FLASK_APP_MUTATOR = lenspack_app_mutator

__all__ = [
    "LENSPACK_URL", "LENSPACK_PORT", "LENSPACK_BESIDE_ORIGINS", "LENSPACK_BESIDE_URL", "LENSPACK_INTERNAL_URL",
    "LENSPACK_SETTINGS_TOKEN", "LENSPACK_TEMPLATES", "STT_BENCH", "FLASK_APP_MUTATOR", "lenspack_app_mutator",
] + (["TALISMAN_CONFIG"] if LENSPACK_BESIDE_ORIGINS else [])
