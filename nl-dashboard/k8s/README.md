# nl-dashboard on Kubernetes

This is the Compose stack from [`../README.md`](../README.md) on Kubernetes. It's written for the HCM lab VM, which runs
minikube on AWS, in namespace `lenspack`, and should fit any cluster that has ingress-nginx and cert-manager.

| File | What it makes |
|---|---|
| [`db.yaml`](db.yaml) | Postgres StatefulSet (5 Gi) for Superset's metadata and the optional sample `hcm` database |
| [`superset.yaml`](superset.yaml) | A one-off Job (`superset/init.sh`) and the Superset Deployment and Service |
| [`lenspack.yaml`](lenspack.yaml) | The Lenspack Deployment and Service (one replica) |
| [`ingress.yaml`](ingress.yaml) | `https://superset.hcm-lab.digit.org/` → Superset, and `/lenspack/` → Lenspack, which is gated by the Superset sign-in check |
| [`kustomization.yaml`](kustomization.yaml) | Namespace, labels, and the image names (change these if you push elsewhere) |
| [`setup-job.yaml`](setup-job.yaml) | A one-off Job that creates the data source, datasets and starter dashboard (`setup/setup.mts`) |

The pods request about 1 CPU and 2.3 Gi in total, with limits of 5 CPU and 8 Gi.

## Before you start

- **ingress-nginx and cert-manager.** On the lab VM the ClusterIssuer is `letsencrypt-prod`, and
  `*.hcm-lab.digit.org` already resolves to the VM. Elsewhere, change the host and issuer in `ingress.yaml`.
- **Images in a registry the cluster can pull from.** Build them from `nl-dashboard/`:
  ```sh
  docker build -t ghcr.io/theflywheel/nl-dashboard-superset:5.0.0-1 superset
  docker build -t ghcr.io/theflywheel/nl-dashboard-lenspack:88cd2a1 lenspack   # tag = LENSPACK_REF, short
  docker push ghcr.io/theflywheel/nl-dashboard-superset:5.0.0-1
  docker push ghcr.io/theflywheel/nl-dashboard-lenspack:88cd2a1
  ```
  If you use another registry or tag, change `images:` in `kustomization.yaml`, and the setup Job's image.

## Deploy

All commands run from `nl-dashboard/`.

1. **Secret.** Use the same variables as Compose's `.env` (see `../.env.example`), plus the data source for
   setup:
   ```sh
   # in .env, also:  DATA_SQLALCHEMY_URI=postgresql+psycopg2://superset:<PG_PASSWORD>@nl-dashboard-db:5432/hcm
   kubectl -n lenspack create secret generic nl-dashboard --from-env-file=.env
   ```
2. **ConfigMaps** for the Lenspack config and the setup script:
   ```sh
   kubectl -n lenspack create configmap nl-dashboard-lenspack --from-file=lenspack/lenspack-superset.yaml
   kubectl -n lenspack create configmap nl-dashboard-setup --from-file=setup/setup.mts
   ```
3. **Apply the stack**, then wait for Superset:
   ```sh
   kubectl apply -k k8s
   kubectl -n lenspack wait --for=condition=complete job/nl-dashboard-superset-init --timeout=10m
   kubectl -n lenspack rollout status deploy/nl-dashboard-superset
   ```
4. **Data.** For now this is the sample data, loaded through a port-forward. ClickHouse datasets and metrics will come
   with the HCM ClickHouse pack, and `setup.mts` refuses a non-Postgres source until then.
   ```sh
   kubectl -n lenspack port-forward svc/nl-dashboard-db 15432:5432 &
   export PGPASSWORD=<PG_PASSWORD>
   psql -h 127.0.0.1 -p 15432 -U superset -d hcm -f sample-data/schema.sql
   for t in task household stock; do
     ES_URL=http://… python3 sample-data/export.py $t |
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
- **Inside:** the "Ask Lenspack" button on a dashboard page.
- **Beside:** https://superset.hcm-lab.digit.org/lenspack/superset/1.

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

## On the lab VM

- **Hours:** the VM is off from 00:00 to 08:00 IST and at weekends. Pods come back when it starts again.
- **Neighbours:** namespace `lenspack` also runs the Elasticsearch-based Lenspack (`lens.hcm-lab.digit.org`) and
  ClickHouse (`svc/clickhouse`, ports 8123/9000). Superset can reach ClickHouse as `clickhouse:8123` once a user
  exists for it.
