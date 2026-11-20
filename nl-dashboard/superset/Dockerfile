# Stock Apache Superset 5.0 with our settings baked in. Not a fork: drivers, a
# config file and one template that Superset documents as overridable.
FROM apache/superset:5.0.0

USER root
# Postgres (metadata and the sample data) and ClickHouse (HCM analytics) drivers.
# clickhouse-connect is the driver Superset's own "clickhouse" extra names.
RUN . /app/.venv/bin/activate \
 && uv pip install --no-cache "psycopg2-binary==2.9.10" "clickhouse-connect>=0.8,<1.0"

COPY superset_config.py /app/superset_config.py
COPY templates/tail_js_custom_extra.html /app/superset/templates/tail_js_custom_extra.html
COPY templates/lenspack /app/superset/templates/lenspack
COPY init.sh /app/nl-dashboard-init.sh
RUN chmod 0755 /app/nl-dashboard-init.sh
ENV SUPERSET_CONFIG_PATH=/app/superset_config.py

USER superset
