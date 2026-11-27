# Updating a running deployment

For whoever runs Superset and ClickHouse. This page covers moving an existing deployment to a newer Lenspack. To install
it for the first time, see [ADD-TO-EXISTING-SUPERSET.md](ADD-TO-EXISTING-SUPERSET.md) (your own Superset) or
[`../deploy/`](../deploy/) (this folder's stack: [Compose](../README.md#run-it-with-docker-compose),
[Kubernetes](../deploy/k8s/README.md)).

## What you are updating

A deployment has two Lenspack pieces. They must come from the **same Lenspack version**.

| Piece | Where it runs | Where it comes from |
|---|---|---|
| The Lenspack server | its own container or pod | the image `ghcr.io/theflywheel/lenspack:<version>` |
| `lenspack_superset.py` | inside Superset, loaded from `superset_config.py` | the same version of the [Lenspack repository](https://github.com/theflywheel/lenspack/tree/main/packages/hosts/superset/plugin), or copied out of the image |

The version is a commit of Lenspack's `main` branch: for example `3d6fa92`. Every merge to `main` builds and publishes an
image with that tag ([how the image is built](https://github.com/theflywheel/lenspack/blob/main/Dockerfile),
[the workflow](https://github.com/theflywheel/lenspack/blob/main/.github/workflows/image.yml)). What changed between
two versions is in [the commit list](https://github.com/theflywheel/lenspack/commits/main).

Lenspack never writes to ClickHouse or to your data. It reads through Superset, using the datasets you gave it. An update
doesn't touch ClickHouse, Superset's metadata database or your dashboards, unless the release notes say a dataset should
change.

## Before you start

1. **Pick the version** and note the current one, for rolling back.
2. **Back up Lenspack's data volume** (`/data` in the container). It holds the audit log and the settings made on
   Settings → Manage → AI assistant.
3. **Back up the Lenspack config** (`lenspack-superset.yaml`, or its ConfigMap) and, on Kubernetes, the Deployment
   manifests.
4. **Tell users.** Lenspack restarts in about 15 seconds. Superset restarts only if `lenspack_superset.py` changed; with
   several Superset pods, a rolling restart keeps it up.

## Update

### This folder's Docker Compose stack

```sh
cd nl-dashboard/deploy
# in .env:  LENSPACK_IMAGE=ghcr.io/theflywheel/lenspack:<version>
docker compose pull lenspack
docker compose up -d --build      # rebuilds Superset with the matching lenspack_superset.py
```

Superset's image copies `lenspack_superset.py` out of the Lenspack image named by `LENSPACK_IMAGE`, so one setting covers
both pieces.

### Your own Superset (Compose or Helm)

1. Download `lenspack_superset.py` at the new version, over the old copy:
   ```sh
   V=<full commit of the version>
   curl -fsSL -o lenspack/lenspack_superset.py \
     https://raw.githubusercontent.com/theflywheel/lenspack/$V/packages/hosts/superset/plugin/lenspack_superset.py
   ```
   Helm: recreate the ConfigMap from it:
   `kubectl -n superset create configmap superset-lenspack --from-file=lenspack/lenspack_superset.py --dry-run=client -o yaml | kubectl apply -f -`.
2. Change the Lenspack image tag to the new version (Compose file, or the Lenspack Deployment).
3. Restart Superset (all its pods or containers), then Lenspack. Compose: `docker compose up -d`. Helm:
   `kubectl -n superset rollout restart deploy/superset` and the same for the Lenspack Deployment.

If the file didn't change between the two versions (compare it), skip the Superset restart.

### This folder's Kubernetes manifests

Change both tags in [`../deploy/k8s/kustomization.yaml`](../deploy/k8s/kustomization.yaml): the Lenspack image, and the
Superset image built with that Lenspack version (`superset6-<sha>`; [building your own](../deploy/k8s/README.md#before-you-start)). Then:

```sh
kubectl -n lenspack delete job nl-dashboard-superset-init   # a Job can't be changed in place
kubectl apply -k k8s
kubectl -n lenspack rollout status deploy/nl-dashboard-superset
kubectl -n lenspack rollout status deploy/nl-dashboard-lenspack
```

## Moving Superset from 5.0 to 6.1

Lenspack works on both, so the Lenspack update and the Superset upgrade can be done separately. Upgrading Superset
itself is a bigger step than a Lenspack update:

- **It is one-way.** Superset 6.1 changes its metadata database when it starts (`superset db upgrade`, about a minute for
  a small deployment). That change can't be undone, so **back up the metadata database first** and keep the backup until
  6.1 has run for a while:
  - Compose: `docker compose exec db pg_dump -U superset -Fc superset > superset-meta-$(date +%F).dump`
  - Kubernetes: `kubectl -n lenspack exec <postgres pod> -- pg_dump -U superset -Fc superset > superset-meta-$(date +%F).dump`
- **This folder's stack:** the Superset image is `nl-dashboard-superset:6.1.0` in Compose (rebuild with
  `docker compose up -d --build`; the init step migrates the database), and `superset6-<sha>` in
  [`../deploy/k8s/kustomization.yaml`](../deploy/k8s/kustomization.yaml) (delete the init Job and apply, as above).
- **Your own Superset:** `clickhouse-connect` must be 0.13 or later, and `lenspack_superset.py` must come from a Lenspack
  version that supports 6.1 (`e1989eb` or later).
- **What looks different:** Superset 6's new look (fonts, icons, a theme menu with a dark theme, which the chat follows),
  and maps on an OpenStreetMap basemap with no Mapbox key. Superset's cache starts empty once, so the first loads are slower.
- **ClickHouse metrics named like a column.** See
  [the ClickHouse driver](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#the-clickhouse-driver): Lenspack's plugin handles it.

**Rolling back from 6.1** means restoring that backup: stop Superset, drop and recreate the metadata database, restore
the dump with `pg_restore`, and start the previous Superset image. Charts and dashboards made after the upgrade are lost
unless you export them first.

## Check it works

1. The Lenspack log names the pack and counts its datasets and measures (`lenspack-superset: …`).
2. Signed out, `/lenspack/overlay.js` answers 401.
3. Signed in, dashboards show **Ask Lenspack**. Ask a question you know the answer to.
4. Settings → Manage → AI assistant shows the datasets, models, usage and audit log.

## Roll back

Put the previous version back in the same places (image tag, and `lenspack_superset.py` at that version), then restart as
above. Restore `/data` only if the new version wrote something you don't want. Charts Lenspack saved are ordinary Superset
charts and keep working.

## Things that matter for ClickHouse data

- **Read-only user.** Superset's connection to ClickHouse only needs to read. Lenspack runs every query through Superset.
- **Day columns as `Date`.** If the deployment's time zone isn't UTC, Lenspack groups by day only on columns of type
  `Date` (or `Date32`). A `DateTime` column holding midnight of each day is refused for day-by-day questions such as
  daily averages. Make the dataset return `toDate(…)`, then restart Lenspack so it reads the new column type.
- **Changing a dataset** (columns, saved metrics) needs a Lenspack restart: it reads datasets when it starts.
- **Who sees what.** Set `hostPolicy: superset` in `lenspack-superset.yaml` for any real deployment (the sample configs
  set it). Each person's answers then follow their own Superset access:
  - a dataset their roles can't read is left out of their chat;
  - simple row-level security rules (`=`, `IN`, `AND`, and `OR` over one column) narrow every answer;
  - a rule too complex to apply hides its dataset from that person rather than risk showing too much, and if Superset
    can't be asked, nothing is shown.

  Before you switch it on, give everyone who uses the chat dataset access through their Superset roles, or their chat
  loses those datasets. Changes to roles and rules reach Lenspack within a minute, with no restart. Without it, anyone
  signed in to Superset can ask about every dataset Lenspack is given. Lenspack will make `superset` the default; until
  then, set it yourself ([details](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#what-each-person-sees)).

The full [restart table](ADD-TO-EXISTING-SUPERSET-REFERENCE.md#what-needs-a-restart) lists what each kind of change needs.
