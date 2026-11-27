# Stock Apache Superset 6.1 with our settings baked in. Not a fork: drivers, a
# config file and one template that Superset documents as overridable.
# Lenspack's Superset side (lenspack_superset.py) comes from the Lenspack image of the same version as the
# server, so the two always match. Pass a different one with --build-arg LENSPACK_IMAGE=...
ARG LENSPACK_IMAGE=ghcr.io/theflywheel/lenspack:3d0bc57
FROM ${LENSPACK_IMAGE} AS lenspack

FROM apache/superset:6.1.0

USER root
# Postgres (metadata and the sample data) and ClickHouse (HCM analytics) drivers.
# clickhouse-connect is the driver Superset's own "clickhouse" extra names; Superset 6.1 needs 0.13 or later.
RUN . /app/.venv/bin/activate \
 && uv pip install --no-cache "psycopg2-binary==2.9.10" "clickhouse-connect>=0.13,<1.0"

# Superset's own French labels for the language menu (LANGUAGES in superset_config.py): the
# stock image ships without compiled translations.
COPY build_translations.py /tmp/build_translations.py
RUN /app/.venv/bin/python /tmp/build_translations.py fr && rm /tmp/build_translations.py

COPY superset_config.py /app/superset_config.py
# Lenspack's additions, imported by superset_config.py. On PYTHONPATH (/app/pythonpath) for the CLI and the server.
COPY --from=lenspack /app/packages/hosts/superset/plugin/lenspack_superset.py /app/pythonpath/lenspack_superset.py
COPY init.sh /app/nl-dashboard-init.sh
RUN chmod 0755 /app/nl-dashboard-init.sh
ENV SUPERSET_CONFIG_PATH=/app/superset_config.py

USER superset
