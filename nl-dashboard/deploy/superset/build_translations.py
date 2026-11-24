"""Adds Superset's own translations for the languages in LANGUAGES to the image.

The apache/superset 5.0 image ships without compiled translations (its build skips them by
default), so the language menu switches the locale but every label stays English. This fetches
Superset 5.0.0's messages.po for each language and builds the two files Superset reads:
messages.mo (server-side labels) and messages.json (the frontend's language pack).
Run at image build time: python build_translations.py fr [de ...]
"""

import json
import sys
import urllib.request
from io import BytesIO
from pathlib import Path

from babel.messages.mofile import write_mo
from babel.messages.pofile import read_po

REF = "5.0.0"
ROOT = Path("/app/superset/translations")


def build(lang: str) -> None:
    url = f"https://raw.githubusercontent.com/apache/superset/{REF}/superset/translations/{lang}/LC_MESSAGES/messages.po"
    with urllib.request.urlopen(url, timeout=60) as r:
        po = r.read()
    catalog = read_po(BytesIO(po), locale=lang, domain="superset")
    out = ROOT / lang / "LC_MESSAGES"
    out.mkdir(parents=True, exist_ok=True)
    (out / "messages.po").write_bytes(po)
    with open(out / "messages.mo", "wb") as f:
        write_mo(f, catalog, use_fuzzy=False)
    # The frontend's pack: Jed's format, as Superset's po2json step makes it.
    messages = {"": {"domain": "superset", "plural_forms": catalog.plural_forms, "lang": lang}}
    for m in catalog:
        if not m.id or m.fuzzy:
            continue
        if isinstance(m.id, (list, tuple)):
            strings = list(m.string) if isinstance(m.string, (list, tuple)) else [m.string]
            if any(strings):
                messages[m.id[0]] = strings
        elif m.string:
            messages[m.id] = [m.string]
    pack = {"domain": "superset", "locale_data": {"superset": messages}}
    (out / "messages.json").write_text(json.dumps(pack, ensure_ascii=False), encoding="utf8")
    print(f"{lang}: {len(messages) - 1} messages")


if __name__ == "__main__":
    for lang in sys.argv[1:]:
        build(lang)
