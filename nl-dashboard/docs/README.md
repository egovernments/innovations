# nl-dashboard docs

Documentation for the Superset + Lenspack natural-language dashboard (use case 3.1). Start with
[the folder's README](../README.md) to run the stack.

## For decision makers

- [ONE-PAGER.md](ONE-PAGER.md): the problem, what the assistant does, how it fits eGov's stack, the evidence and
  next steps, in one page.

## For operators

- [ADD-TO-EXISTING-SUPERSET.md](ADD-TO-EXISTING-SUPERSET.md): quickstart for adding Lenspack to a running Superset 6.1 (5.0 also works; 6.0 untested)
- [UPDATING.md](UPDATING.md): moving a running deployment to a newer Lenspack, checking it, and rolling back
  on the stock image, with Docker Compose or the official Helm chart.
- [ADD-TO-EXISTING-SUPERSET-REFERENCE.md](ADD-TO-EXISTING-SUPERSET-REFERENCE.md): the detail behind each quickstart
  step, options, permissions, the audit log, capacity, the full Helm setup and troubleshooting.
- [Kubernetes](../deploy/k8s/README.md): this folder's stack on Kubernetes.
- [gabon-pilot-config-notes.md](gabon-pilot-config-notes.md): how the assistant is set up for the Gabon bednet pilot:
  who can use and run it, where its settings live, the rest of its configuration and the steps before go-live.

## For engineers

- [ARCHITECTURE.md](ARCHITECTURE.md): how the assistant is built: the proxy through Superset, signed identity,
  Lenspack's vocabulary (the *pack*) and how it reads and edits dashboards, one chat turn, security and capacity.
- [ANALYTICS-PIPELINE.md](ANALYTICS-PIPELINE.md): how HCM campaign data becomes the ClickHouse tables and Superset
  datasets the assistant reads, stage by stage, with what each step drops and the known gaps.
- [PACK-FROM-SUPERSET.md](PACK-FROM-SUPERSET.md): design (not built) for building Lenspack's vocabulary from Superset
  alone, without a hand-written config file.
- [MAPS.md](MAPS.md): how Superset's map charts work (studied on 5.0, with what 6.x changes), and how Lenspack's point maps map onto them.

## Evaluations

- [../evals/README.md](../evals/README.md): what we test and the results, on one page: the chat agent (questions,
  scoring, results by model and language) and the speech-to-text behind the chat's microphone.
  - [../evals/agent/](../evals/agent/README.md): the chat agent's questions, scoring, definitions, every run and the
    failure write-ups.
  - [../evals/speech/](../evals/speech/README.md): the speech-to-text comparison behind the mic's default model.
