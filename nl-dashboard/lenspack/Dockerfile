# The Lenspack server for Superset (packages/superset in theflywheel/lenspack),
# built from a pinned commit of the public repo. It serves the chat API and the overlay
# script (/overlay.js), reached only through Superset's /lenspack/ route.
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* && corepack enable

# A commit on the lenspack "superset" branch (until packages/superset reaches main).
ARG LENSPACK_REF=e3adaeff66dc36513943fe883cec8671c6fcb750
WORKDIR /app
RUN git init -q . && git remote add origin https://github.com/theflywheel/lenspack.git \
 && git fetch -q --depth 1 origin "$LENSPACK_REF" && git checkout -q FETCH_HEAD \
 && pnpm install --frozen-lockfile --filter lenspack-monorepo --filter "@lenspack/superset..." --filter "@lenspack/serve..." \
 && rm -rf .git

COPY --chmod=0755 start.sh /app/start.sh
# Board bookkeeping (which charts Lenspack made) lives here; mount a volume to keep it.
RUN mkdir -p /data && chown node:node /data
USER node
ENV NODE_ENV=production
EXPOSE 8795
# The config is mounted at /config (compose: a bind mount, k8s: a ConfigMap).
CMD ["/app/start.sh", "/config/lenspack-superset.yaml"]
