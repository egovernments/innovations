# HCM setup

HCM v2.1 runs on the AWS VM `hcm-app-vm`. We set it up on 7 Nov 2026 from eGov's branch `azure-install-hcm-demo-v2.1`.
We followed two guides: our own standalone-VM guide and eGov's official
[Deploy HCM](https://docs.digit.org/health/deploy/installation/production-setup/deploy-hcm) documentation.

On 10 Nov 2026 we compared notes with Kanav, who installed HCM separately. After that, we updated our install:
- We gave HCM a public web address.
- We loaded the screen labels.
- We fixed several bugs.

## What is running

- **Web address:** https://hcm-lab.digit.org/console. The site is open to the internet.
  It uses a certificate from Let's Encrypt, and the certificate renews automatically.
  The tenant (the "state" that HCM serves) is `demo`.
- **Software:** the VM runs all HCM v2.1 services and web apps. It also runs all the software that they need:
  - Postgres (database)
  - MinIO (file storage)
  - Elasticsearch (search and dashboards)
  - Kafka (message queue)
  - Redis (cache)
  - Kibana

  All of this runs inside the one VM: 74 containers on a single-node Kubernetes cluster (minikube).
  Nothing depends on eGov's cloud accounts.
- **Configuration:** we use our own settings file `hcm-standalone-vm.yaml` and our own passwords file
  `hcm-standalone-vm-secrets.yaml`. Both files start from eGov's v2.1 demo configuration. We did not change eGov's own files.
- **Starting data:** eGov's official v2.1 data dump. It contains 8,243 configuration records, 61,520 administrative
  boundaries and 135 products. eGov wrote the dump for Mozambique (tenant `mz`), so we converted it to our tenant `demo`.
  We also created the workflows for complaints and payments.
- **Screen labels (localization):** about 170,000 labels, copied from eGov's public demo site.
  There are 82,009 labels in English, 41,184 in Portuguese and 45,359 in French.
- **Web app versions:** since 10 Nov, workbench, dashboard and payments run the same newer builds as eGov's public demo site.
  The console stays on the v2.1 build (see #33).
- **Restarts:** after the VM stops and starts again, all services start by themselves in about 8 minutes.
  This is important because we stop the VM every night from 12 AM to 8 AM IST, and over weekends, to save cost.
  The site is not available during those hours.

**Not installed on purpose:**
- The old file-based configuration service (`egov-mdms-service`). v2.1 replaces it with the database-based `mdms-v2`.
- Push notifications to phones. They need a Firebase key (from Google), and we do not have one.
- Malware scans of uploaded files, Airflow, and a service that only Mozambique uses.

## Open items

- **Some labels are still missing.** If eGov's demo site has no label for a screen element, the screen shows the internal key.
  For example, it shows `CAMPAIGN_HOME` instead of "Home". This problem occurs mostly in Portuguese and French.
- **Browsers keep old labels.** The web apps store labels in the browser. If the labels on the server change,
  clear the browser's site data for hcm-lab.digit.org, or use a private window. If you do not, the browser continues to show the old labels.
- **The console is older than the console on eGov's demo site.** The newer console needs a newer backend than v2.1 (see #33).
  A move to the newer console also needs an upgrade of the backend services. We did not do this upgrade.
- **The campaign boundary hierarchy is missing.** The starting data tells the console to use a boundary hierarchy
  called `NIGERIA` for campaigns. But the same data has no hierarchy with that name.
  It has only other hierarchies, such as `ADMIN` and `HANDOVER`.
  Screens that select boundaries for a campaign get an error. The error continues until one of these occurs:
  - Someone uploads a `NIGERIA` hierarchy.
  - Someone points the setting at a hierarchy that exists.
- **New services need a gateway restart.** The API gateway reads the list of services only when it starts.
  If you install a new service later, restart the gateway. If you do not, calls to the new service fail with "not found".
- **One file comes from the internet.** eGov's web apps load a spreadsheet library (`xlsx`) from unpkg.com
  in the user's browser. Our VM supplies all other files.

## Problems found and how we handled them

This table lists only real differences:
- places where we could not follow our guide or eGov's documentation as written
- bugs in eGov's code or configuration that we had to fix or avoid

Each row names the source of the problem:
- **our guide**
- **eGov's docs** (docs.digit.org)
- **eGov's repo** (a bug in eGov's code or configuration on the v2.1 branch)

The rows are in the order in which we found the problems:
- #1–#2: preparing the VM and the configuration. Sections 1 and 2 of our guide create the VM and the Kubernetes cluster. These sections worked exactly as written.
- #3–#28: installing the services and loading data (7 Nov).
- #29–#33: found on 10 Nov, after comparing with Kanav's install.
- #34–#38: problems on Kanav's list that are not in rows #1–#33.

**Comparison with Kanav's install.** Kanav installed HCM 2.1 separately on a single machine and listed 15 problems.
The last column gives the number on Kanav's list. A dash means that the problem is not on Kanav's list.
Some of these differences may come from how each of us set up the install.
Two of Kanav's problems were real problems on our install that our own checks did not find:
- the `project-factory` database connection (#29)
- the missing labels (#28, #31)

We fixed both problems.

| # | Problem | What we did | Kanav's list |
|---|---|---|---|
| 1 | **eGov's repo:** by default, eGov's setup creates some passwords and keys in Kubernetes namespaces of other eGov customers (`chad`, `congob`, `chaduat`). These namespaces do not exist on our cluster, so the install stops with an error. | Our secrets file gives the right namespaces for each of these items: `git-sync`, `project-factory` and `elasticsearch-master-creds`. | Kanav #11: only the `project-factory` password file. Kanav copied the file manually. |
| 2 | **Our guide:** our own database and file storage run inside the cluster. They need the database password and the storage keys in their namespace. Without these, they cannot start. At first, our guide did not include this step. | The secrets file also puts the database password in the `backbone` namespace, where our database runs. The file storage uses the same keys as the file service. Our guide's secrets template now includes this step. | — |
| 3 | **eGov's docs:** the docs tell you to run the installer `digit_installer.go`, but eGov built this installer for **v2.0**. It would install v2.0 versions of the services on top of v2.1. It would skip the services that exist only in v2.1. Some module names in it are wrong, so it would never install the gateway, Redis, the web entry point (ingress) or the certificate manager. | We did not use it. We ran eGov's deployment tool directly for each service. Each service then gets the version that the v2.1 configuration specifies. | — |
| 4 | **eGov's docs:** the docs do not list the services that make up v2.1. | We installed every service that has a version in the v2.1 configuration. We also installed four services that v2.1 needs but that only the v2.0 list contains: `census-service`, `plan-service`, `resource-generator` and `auth-proxy`. We did not install the services under "Not installed on purpose" above, or an old Elasticsearch 6 setup. | — |
| 5 | **eGov's docs:** the order is important. You can install a service with a web address only after the web entry point (ingress) runs. Otherwise, the cluster rejects the service. | We install in two rounds. First, we install the shared base (database, queue, cache, search, ingress). When the ingress is up, we install the HCM services. | — |
| 6 | **eGov's repo:** five services fail to install: `individual`, `household`, `transformer`, `service-request` and `boundary-service`. Their configuration has no section for automatic scaling, but the shared template expects one. | Our configuration disables automatic scaling for those five services. One VM does not need it. | Kanav #9: Kanav found this problem on `transformer`. |
| 7 | **eGov's repo:** the install settings for `project-factory` have an indentation error, so the installer cannot read them. | We fixed the indentation. | — |
| 8 | **eGov's repo:** the description file of the `individual-referral` service has the wrong content: a template, not the service description. Thus the service cannot install. | We made the file again from the `household-referral` service, which is very similar. | — |
| 9 | **eGov's repo:** `transformer` and `resource-generator` need the address of `project-factory`. The configuration never sets this address, so Kubernetes does not start them. | We set the address in our configuration. | Kanav #8: Kanav found this problem on `transformer`. |
| 10 | **eGov's repo:** the Elasticsearch install expects disks that already exist in AWS, Azure or a similar cloud. Our single VM has no such disks, so Elasticsearch cannot get storage. | We changed the install. If the configuration names no cloud disk, Elasticsearch uses the normal disk storage of the VM. We also run one main node and one data node, not eGov's larger cluster. | Kanav #1: eGov's setup expects Azure (a managed database, Azure file storage, disks that already exist, and Azure's Kubernetes). Kanav wrote a new setup for Postgres, Kafka, Redis, Elasticsearch and MinIO. |
| 11 | **eGov's repo:** Elasticsearch makes its own random admin password. But the HCM services get the password from our secrets file. The two passwords are different, so Elasticsearch refuses the services. | We set the Elasticsearch password to the password in our secrets file. After each reinstall of Elasticsearch, you must do this again. The script `align-es-password.sh` does it. | — |
| 12 | **eGov's repo:** the Kafka setup has three copies, and it *requires* each copy to run on a different machine. We have one machine, so only one copy starts, and Kafka does not work. | We changed "required" to "preferred", so all three copies run on our one machine. After each reinstall of Kafka, you must do this again. The script `kafka-single-node.sh` does it. | Not on the list. Kanav wrote a new Kafka setup, so Kanav would not have found this problem. |
| 13 | **eGov's deployment tool:** if you reinstall Kibana with eGov's tool, the tool breaks the Kibana settings. Also, the tool cannot replace one of the Kibana setup jobs after that job exists. | Before we reinstall Kibana, we remove the old copy and its setup job. | — |
| 14 | **eGov's repo:** the database setup in eGov's repo uses Postgres 9.6, which is very old. Its file storage setup uses images from 2020. | We wrote our own setups: Postgres 14 and a current MinIO. Both keep their data on the VM's disk. | Kanav #1 (see #10). |
| 15 | **Images:** the official MinIO images (`minio/minio`, `quay.io/minio/*`) are no longer free to download. | We use eGov's own copy of MinIO (`egovio/minio`). | — |
| 16 | **eGov's repo:** the code of the file upload service connects only to Azure's file storage. | We changed the service to S3 mode and connected it to our own MinIO. | Kanav #1 (see #10). |
| 17 | **eGov's repo:** the web apps load their settings files from eGov's cloud storage. They also load tracking and analytics scripts from third parties. An install that should not depend on eGov's cloud cannot use these files. | We download eGov's public settings files one time. We remove eGov's Google Maps and Google sign-in keys from them. Then our VM serves the files (`deploy-assets.sh`). We removed the tracking and analytics scripts. | Kanav #7: the same fix (see #36). |
| 18 | **eGov's repo:** the setup expects a cloud load balancer for the web entry point (ingress). A single VM has no load balancer, so the entry point never gets an address. | We fixed the entry point to ports 30080 and 30443 on the cluster. The VM sends public traffic on the normal web ports 80 and 443 to these ports (see #32). | — |
| 19 | **eGov's repo:** `auth-proxy` (in front of Kibana) runs in a different namespace. It needs the database password and address in that namespace too. The configuration does not supply them. | We added both items for that namespace. | — |
| 20 | **eGov's repo:** the configuration gives the PDF service settings for a newer version of its file-sync helper than the version that it runs. Thus the service cannot get its templates. | We removed those settings. The service now uses the default settings for its version. | — |
| 21 | **eGov's repo:** for each of the 7 web apps, the setup creates a settings file in the wrong namespace (`default`). The web apps wait for this file forever and never start. | We set the right namespace (`egov`) for all 7 web apps. | Kanav #10. |
| 22 | **eGov's repo:** the label service (`egov-localization`) needs the Redis address. eGov's configuration leaves this address empty, so the service crashes. | We set the address to our Redis. | — |
| 23 | **eGov's repo:** if you do not give `inbox` and `individual-referral` a tenant, they use other tenants (`pg`, `default`). Their database lookups then fail. | We set both services to tenant `demo`. | — |
| 24 | **eGov's repo:** the `inbox` configuration contains the ID of an internal system user from eGov's own database. This user does not exist in our database. | The services create the same internal user when they first start. We found this user in our database and put its ID in our configuration. | — |
| 25 | **eGov's repo:** `referralmanagement` needs a storage key (`egov-s3`). The indexer and muster-roll services need the Elasticsearch password (`elastic`). eGov's setup creates neither of these, so those services cannot start. | The script `extra-secrets.sh` creates both. | — |
| 26 | **eGov's repo:** the Elasticsearch main node gets too little memory. It runs out of memory and stops again and again. | We gave it 1 GB of working memory and a 2 GB limit. | — |
| 27 | **eGov's docs:** the official data dump is for tenant `mz`. It loads everything into the default database area (schema `public`). Our setup uses tenant `demo`, as eGov's v2.1 demo does. Some services read from a separate area called `demo`. | The script `retarget-seed.py` changes `mz` to `demo` in all of the dump. It also moves the configuration and product tables into the `demo` area. We then loaded the dump as the docs describe. We also did the workflow and admin-user steps for `demo`. | Kanav #4 and #5. For the tenant, Kanav used the opposite solution and changed the full install to `mz`. For the database area, Kanav used the same type of fix and divided the dump by table. |
| 28 | **eGov's docs:** the data-loading step in the docs has no label data (localization) for v2.1. Thus every screen shows internal keys (for example `CAMPAIGN_HOME`), not text. | eGov's public demo site gives its labels to anyone who asks for them, one module at a time. Our script `load-localization.py` copied about 170,000 labels in English, Portuguese and French. For each module, we use eGov's own demo labels where they exist. We use the Mozambique labels only for modules that the demo does not have. When we mixed both sets, the result was too large for the browser's storage. The browser then did not save some labels. Item #31 tells why the labels still did not show at first. | Kanav #6: Kanav copied about 83,000 labels from eGov's demo site. At first we did not know that we could copy the labels. |
| 29 | **eGov's repo:** `project-factory` creates campaigns. It always uses encryption (SSL) to connect to the database, and it ignores its setting to disable SSL. Our database did not offer SSL, so all database requests from `project-factory` failed. The service still looked healthy. But each attempt to create a campaign would have failed. Our checks on 7 Nov did not find this problem. Kanav's notes did. | Our database now offers SSL. It makes a new certificate for itself each time it starts. Services that connect without SSL continue to work as before. | Kanav #12: Kanav enabled encryption in the database, as we did. |
| 30 | **eGov's repo:** the setup gave the Elasticsearch data node almost all of its memory limit as working memory. This left too little memory for all other needs. In three days, the node stopped and restarted 117 times. | We gave it 2 GB of working memory and a 4 GB limit. The node has been stable since this change. | — |
| 31 | **eGov's repo and data dump:** after we loaded the labels, the screens still showed keys. The web apps add their region code to the language code. Our language codes came from the Mozambique data (`en_MZ`), and the console added `DEMO`. Thus the console asked for labels in `en_MZDEMO`, which does not exist. Also, three web apps (core-ui, microplan, digit-ui) still used the Mozambique tenant `mz`. This tenant does not exist on our install. | We set every web app to tenant `demo` and region `DEMO`. We changed the language list to `en_DEMO`, `pt_DEMO` and `fr_DEMO`, and we loaded the labels under those names. We also increased the label column in the database from 500 to 1,000 characters. 16 Portuguese and French help texts had more than 500 characters, and the database could not save them. | Kanav #6 (see #28). |
| 32 | **eGov's docs:** the docs expect a cloud load balancer in front of HCM to make it public. | We gave the VM a fixed public IP and pointed `hcm-lab.digit.org` at it. We opened the web ports 80 and 443 to everyone. On the VM, traffic on those ports goes directly to HCM's web entry point. Thus the gateway sees the real IP address of each visitor. The gateway needs this address for its request limits per user. We changed HCM's configuration to the new domain and to Let's Encrypt. Then we reinstalled all services. | — |
| 33 | **Version update (10 Nov):** eGov's demo site runs newer builds of four web apps than the v2.1 configuration specifies: console, workbench, dashboard and payments. We found the exact builds when we compared their file fingerprints. | Workbench, dashboard and payments now run the builds from the demo site, and they work with our v2.1 backend. The newer console does not work. Its "My campaigns" page sends its search in a format that the v2.1 `project-factory` rejects ("CampaignDetails is required"). Thus the list never loads. For this reason, the console stays on the v2.1 build, where that page works. The newer builds also use some new label modules (`hcm-workbench`, `hcm-appconfiguration`). We added these modules to the label copy. | Kanav #15: Kanav also updated the console. Kanav's install may have a newer backend, or Kanav may not have used the "My campaigns" page. |
| 34 | **eGov's repo:** the configuration points the old configuration service at a branch (`HCM-v2.1-DEMO`) that does not exist. | We did not get this problem. We never installed the old configuration service, because v2.1 uses the database-based service. We loaded the data dump (#4, #27). | Kanav #2: Kanav used the data dump. |
| 35 | **eGov's docs:** the docs tell you to download `seed_data_dump_2_1.sql`. But the commands after that step load `seed_data_dump_1.7.sql`. | We did not record this problem. We loaded the 2.1 file. | Kanav #3. |
| 36 | **eGov's repo:** the setup needs private access. It needs an SSH key for eGov's GitHub repos, passwords in eGov's Azure Key Vault, and settings files in HCM's cloud storage. | We used public downloads for the repos and kept the passwords in a local file. Our VM serves the settings files (#17). | Kanav #7: the same fixes. |
| 37 | **eGov's docs:** the gateway reads the list of services only when it starts. Calls to a service that you install later give "not found" until the gateway restarts. The docs do not tell you this. | This problem is real, but we never saw it. The nightly restarts hid it (see Open items). | Kanav #13. |
| 38 | **eGov's repo:** the default processor limit (0.3 of a core) makes Java services start very slowly. Kubernetes then decides that they are stuck and restarts them. | We did not see this problem. About 60 Java services run with the 0.3-core limit. After a full restart on 10 Nov, Kubernetes restarted none of them. We do not know why the result is different. | Kanav #14: Kanav increased the limit to 2 cores. |
