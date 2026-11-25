# nl-dashboard on Kubernetes

This is the Compose stack from [`../../README.md`](../../README.md) on Kubernetes. It's written for eGov's HCM lab
server, a single AWS virtual machine running minikube, in namespace `lenspack`, and should fit any cluster that has
ingress-nginx and cert-manager.

| File | What it makes |
|---|---|
| [`db.yaml`](db.yaml) | Postgres StatefulSet (5 Gi) for Superset's metadata and the optional sample `hcm` database |
| [`superset.yaml`](superset.yaml) | A one-off Job (`../superset/init.sh`) and the Superset Deployment and Service |
| [`lenspack.yaml`](lenspack.yaml) | The Lenspack Deployment and Service (one replica) |
| [`ingress.yaml`](ingress.yaml) | `https://superset.hcm-lab.digit.org/` → Superset (which serves `/lenspack/` itself) |
| [`kustomization.yaml`](kustomization.yaml) | Namespace, labels, and the image names (change these if you push elsewhere) |
| [`setup-job.yaml`](setup-job.yaml) | A one-off Job that creates the data sources, datasets and starter dashboards (`../../demo-data/setup/setup.mts`) |

The pods request about 1 CPU and 2.3 Gi in total, with limits of 5 CPU and 8 Gi.

## Before you start

- **ingress-nginx and cert-manager.** On the lab server the ClusterIssuer is `letsencrypt-prod`, and
  `*.hcm-lab.digit.org` already resolves to it. Elsewhere, change the host and issuer in `ingress.yaml`.
- **Images.** `kustomization.yaml` uses public images from `ghcr.io/theflywheel/lenspack`. Lenspack runs its
  own image, built from its `main` branch and tagged with the commit (for example `7fb4d6a`). Superset runs this
  folder's image, `superset5-<sha>`, built at commit `<sha>` of this repository; it copies Lenspack's Superset
  side (`lenspack_superset.py`) out of the Lenspack image, so build it with the same Lenspack tag. To build your own
  from `nl-dashboard/deploy/`:
  ```sh
  docker build -t <registry>/nl-dashboard-superset:<tag> \
    --build-arg LENSPACK_IMAGE=ghcr.io/theflywheel/lenspack:<lenspack commit> superset
  docker push <registry>/nl-dashboard-superset:<tag>
  ```
  Then change `images:` in `kustomization.yaml`, and the setup Job's image if you change the Lenspack tag.

## Deploy

All commands run from `nl-dashboard/deploy/`.

1. **Secret.** Use the same variables as Compose's `.env` (see `../.env.example`), plus the data source for
   setup:
   ```sh
   # in .env, also:  DATA_SQLALCHEMY_URI=postgresql+psycopg2://superset:<PG_PASSWORD>@nl-dashboard-db:5432/hcm
   kubectl -n lenspack create secret generic nl-dashboard --from-env-file=.env
   ```
   Lenspack reads `SUPERSET_ADMIN_PASSWORD` from it to create its own Superset account. Its `/data` is an `emptyDir`,
   so it does this on every start; keep the key in the Secret, or give `/data` a PersistentVolume.
2. **ConfigMaps** for the Lenspack config and the setup script. The key is always `lenspack-superset.yaml`; for
   ClickHouse, use `--from-file=lenspack-superset.yaml=lenspack/lenspack-superset.clickhouse.yaml`.
   ```sh
   kubectl -n lenspack create configmap nl-dashboard-lenspack --from-file=lenspack/lenspack-superset.yaml
   kubectl -n lenspack create configmap nl-dashboard-setup --from-file=../demo-data/setup/setup.mts
   ```
3. **Apply the stack**, then wait for Superset:
   ```sh
   kubectl apply -k k8s
   kubectl -n lenspack wait --for=condition=complete job/nl-dashboard-superset-init --timeout=10m
   kubectl -n lenspack rollout status deploy/nl-dashboard-superset
   ```
4. **Data.** Either or both:
   - **ClickHouse in the cluster.** No tunnel is needed: the setup Job connects Superset to the `clickhouse`
     Service directly. Put `CLICKHOUSE_USER` and `CLICKHOUSE_PASSWORD` (a read-only user) in the Secret, and
     optionally `CLICKHOUSE_DATABASE` and `CLICKHOUSE_TENANT`. Change `CLICKHOUSE_HOST` in `setup-job.yaml` if the
     Service has another name.
   - **Sample data**, loaded through a port-forward (with `DATA_SQLALCHEMY_URI` in the Secret):
   ```sh
   kubectl -n lenspack port-forward svc/nl-dashboard-db 15432:5432 &
   export PGPASSWORD=<PG_PASSWORD>
   psql -h 127.0.0.1 -p 15432 -U superset -d hcm -f ../demo-data/sample-data/schema.sql
   for t in task household stock; do
     ES_URL=http://… python3 ../demo-data/sample-data/export.py $t |
       psql -h 127.0.0.1 -p 15432 -U superset -d hcm -c "\copy hcm_$t FROM STDIN WITH (FORMAT csv, HEADER true)"
   done
   ```
5. **Setup**, after which Lenspack becomes ready:
   ```sh
   kubectl -n lenspack apply -f k8s/setup-job.yaml
   kubectl -n lenspack wait --for=condition=complete job/nl-dashboard-setup --timeout=5m
   kubectl -n lenspack rollout status deploy/nl-dashboard-lenspack
   ```

Open https://superset.hcm-lab.digit.org and sign in as `admin`.
- **The chat:** the "Ask Lenspack" button on a dashboard page. Superset serves `/lenspack/` itself, so there is one
  Ingress (Superset's) and none for Lenspack.
- **Settings:** Settings → Manage → AI assistant (https://superset.hcm-lab.digit.org/ai-assistant/).

## Changes later

- **Lenspack config:** recreate the ConfigMap, then restart the deployment:
  ```sh
  kubectl -n lenspack create configmap nl-dashboard-lenspack --from-file=lenspack/lenspack-superset.yaml --dry-run=client -o yaml | kubectl apply -f -
  kubectl -n lenspack rollout restart deploy/nl-dashboard-lenspack
  ```
- **New images:** change the tags in `kustomization.yaml` and `kubectl apply -k k8s`. A Job can't be changed in place, so
  delete it first (`kubectl -n lenspack delete job nl-dashboard-superset-init`) when its image changes.
- **Remove everything:**
  ```sh
  kubectl delete -k k8s
  kubectl -n lenspack delete job nl-dashboard-setup
  kubectl -n lenspack delete secret nl-dashboard
  kubectl -n lenspack delete configmap nl-dashboard-lenspack nl-dashboard-setup
  ```
  The Postgres volume (`data-nl-dashboard-db-0`) stays until you delete it.

## On the lab server

- **Hours:** the server is off from 00:00 to 08:00 IST and at weekends. Pods come back when it starts again.
- **Neighbours:** namespace `lenspack` also runs the Elasticsearch-based Lenspack (`lens.hcm-lab.digit.org`) and
  ClickHouse (`svc/clickhouse`, ports 8123/9000), which the setup Job uses as `clickhouse:8123`. The ClickHouse datasets
  read eGov's analytics summary tables (the `analytics.dm_*` marts and the boundary-name table), so check they exist
  there first.
