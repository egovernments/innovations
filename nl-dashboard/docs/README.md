# nl-dashboard docs

Documentation for the Superset + Lenspack natural-language dashboard (use case 3.1). Start with
[the folder's README](../README.md) to run the stack.

## For decision makers

- [ONE-PAGER.md](ONE-PAGER.md): the problem, what the assistant does, how it fits eGov's stack, the evidence and
  next steps, in one page.

## For operators

- [ADD-TO-EXISTING-SUPERSET.md](ADD-TO-EXISTING-SUPERSET.md): quickstart for adding Lenspack to a running Superset 5
  on the stock image, with Docker Compose or the official Helm chart.
- [ADD-TO-EXISTING-SUPERSET-REFERENCE.md](ADD-TO-EXISTING-SUPERSET-REFERENCE.md): the detail behind each quickstart
  step, options, permissions, the audit log, capacity, the full Helm setup and troubleshooting.
- [Kubernetes](../k8s/README.md): this folder's stack on Kubernetes.

## For engineers

- [ARCHITECTURE.md](ARCHITECTURE.md): how the assistant is built: the proxy through Superset, signed identity, packs
  and boards, the chat turn, security and capacity.
- [ANALYTICS-PIPELINE.md](ANALYTICS-PIPELINE.md): how HCM campaign data becomes the ClickHouse tables and Superset
  datasets the assistant reads, stage by stage, with what each step drops and the known gaps.
- [PACK-FROM-SUPERSET.md](PACK-FROM-SUPERSET.md): design (not built) for building Lenspack's vocabulary from Superset
  alone, without a hand-written config file.
- [MAPS.md](MAPS.md): how Superset 5.0's map charts work, and how Lenspack's point maps map onto them.

## Evaluations

- [../evals/README.md](../evals/README.md): the accuracy suite: method, questions, definitions register, results and
  failure analyses.
