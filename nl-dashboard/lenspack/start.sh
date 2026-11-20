#!/bin/sh
# Starts the Lenspack server for Superset.
# LLM: set LENSPACK_LLM_PROVIDERS yourself, or set ANTHROPIC_API_KEY and get
# Claude Sonnet, Opus and Haiku 5.5 (the key itself is read by the Anthropic adapter from
# ANTHROPIC_API_KEY; it is never written into the provider list or the logs).
set -eu
if [ -z "${LENSPACK_LLM_PROVIDERS:-}" ] && [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  LENSPACK_LLM_PROVIDERS='[{"name":"claude-sonnet-5-5","kind":"anthropic","model":"claude-sonnet-5-5"},{"name":"claude-opus-5-5","kind":"anthropic","model":"claude-opus-5-5"},{"name":"claude-haiku-5-5","kind":"anthropic","model":"claude-haiku-5-5"}]'
  # So the settings page can say where the key came from (the name, never the value).
  LENSPACK_LLM_KEY_SOURCE=ANTHROPIC_API_KEY
  export LENSPACK_LLM_PROVIDERS LENSPACK_LLM_KEY_SOURCE
fi
exec /app/node_modules/.bin/tsx --tsconfig /app/tsconfig.base.json /app/packages/superset/bin/serve.ts "$@"
