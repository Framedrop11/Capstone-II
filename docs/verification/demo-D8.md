# D8 AKS live demo readiness

Status: planning/preflight only. User selected Central India, an 8-hour run window, and Azure for Students credits only (no pay-as-you-go charges); Cloudflare domain and Vercel project/domain are not available. User reports the student account is new, unused, and has its full credit balance with expiry far away; exact account balance/date are not independently verified. User-reported Cloud Shell output confirms the `Azure for Students` subscription is `Enabled`. The first filtered quota query returned no rows, so quota is still unknown. `az aks list-vm-skus` failed with `InvalidAuthenticationToken` (missing user identity claim); this is not evidence that the SKU is unavailable. A conservative resource/cost envelope is prepared below. No AKS create/update, billable resource, tunnel, or deployment has been performed. D8 is not complete.

## Target and live demo path

The accepted target is Azure Kubernetes Service with a dedicated `staging` demo namespace. Because no custom domain or Vercel project is available, the presentation access path will be a local `kubectl port-forward` to the frontend Service; its NGINX frontend already proxies `/api` to the Core API. This avoids a public IP, ingress controller, Cloudflare Tunnel, and Vercel for the panel demo. The production overlay remains isolated. This local access route is only a demo path and does not provide public HTTPS or demonstrate the D7 Vercel deployment.

## Workload inventory to include in the final capacity and cost review

| Group | Required pieces | Current state |
| --- | --- | --- |
| CareLens | Core API, worker, ML service, frontend, migration Job | Kustomize overlays exist; image digests are placeholders until D6 publishes them |
| Data | MongoDB 7 single-member replica set, queue Redis (`noeviction`), cache Redis (LRU) | Optional Kustomize add-on prepared in `infra/k8s/addons/demo-data`; not included in normal overlays/workflows and not runtime-verified |
| Observability | metrics-server, Prometheus, Grafana, Alertmanager, exporters | Compose config exists; cluster installation/retention/resources are not prepared |
| Public entry | ingress-nginx ClusterIP, cloudflared tunnel | Optional two-replica cloudflared add-on prepared; ingress controller, tunnel token/domain and live routing are pending |
| Platform | AKS system pool, workload nodes, CNI/NetworkPolicy enforcement, persistent disks, DNS/TLS | Region/SKU/count/storage and Azure prerequisites are unselected |

Prior D5 staging HPA maximum includes only application requests: 2.9 vCPU and 4,064 MiB. It excludes all listed dependencies, Kubernetes/system reservations, and disk/network costs; it cannot be used alone to select node size. Recalculate after the user completes D5 revalidation and before sizing nodes.

The optional Mongo/Redis add-on declares about 750m CPU and 1,408 MiB memory requests at peak while the Mongo replica-init Job runs. This is a planning sum from the new resource declarations, not measured consumption or a node-size recommendation. Its persistent volume claims request 16 GiB for Mongo and 4 GiB for queue Redis; cache Redis is ephemeral. The Mongo key-file init container runs as root to set owner-only key permissions and needs a security/runtime review before AKS use.

Combining the prior staging-at-HPA-max application estimate with steady-state Mongo/Redis requests gives a lower bound of roughly 3.6 vCPU and 5,344 MiB, before monitoring, ingress, tunnel, AKS system pods, init Jobs, and headroom. This is still not sufficient for a node SKU decision.

## Proposed cost and safety envelope

Before creating anything, record and review:

1. Subscription: the `Azure for Students` subscription, reported Enabled. Never upgrade to Pay-As-You-Go.
2. Region: `centralindia`; AKS Free tier; one Linux system pool with three `Standard_D2s_v5` nodes (2 vCPU/8 GiB each), fixed at 3 nodes for this short failure demo; no autoscaler or extra node pools. These are planning choices pending Azure quota and regional SKU availability.
3. Duration: 8 hours of intended live use; budget 10 billable hours to include provisioning and teardown. Immediately delete the isolated resource group after the demo.
4. Avoid external ingress/public IP: use `kubectl port-forward`. Use no Azure Monitor managed metrics/log ingestion, NAT Gateway, Firewall, Bastion, or paid control-plane tier. Deploy self-hosted Prometheus/Grafana with ephemeral storage for the demo; retain the Mongo and queue Redis data PVCs only for the session.
5. Estimated compute basis: current published Central India Linux retail price for one `Standard_D2s_v5` is about $0.101/hour. Three nodes for 10 hours: about $3.03 compute. Add OS/data disks and incidental resources; plan approximately **$5–10 USD total**, with a **$15 USD credit-spend ceiling as the requested envelope**. The $15 is a conservative planning limit, not an Azure-enforced hard cap or a guaranteed invoice amount; Azure pricing, disk billing, taxes, SKU availability, and credits can vary. No-cost overrun is not assumed. If the Azure estimate exceeds $15, do not create the cluster.
6. Teardown command (after confirming the resource-group name and that evidence/data are no longer needed): `az group delete --name rg-carelens-demo-centralindia --yes --no-wait`. Follow with `az group exists --name rg-carelens-demo-centralindia` until it returns `false`; verify no detached disks or other resources remain.
7. The user has already stated credits-only, no Pay-As-You-Go, and an 8-hour run window. The remaining gate is explicit approval of the exact plan and $15 maximum credit spend before any billable create/update operation. The Azure quota/SKU check can be performed read-only in Cloud Shell during preflight; it is not a request to re-check the credit balance.

Microsoft documents that AKS Free waives the control-plane fee but not worker VMs, disks, and networking, and has no financially backed control-plane SLA; see [AKS pricing tiers](https://learn.microsoft.com/azure/aks/free-standard-pricing-tiers). Microsoft states Azure for Students provides $100 credit for 12 months and disables the subscription when credit is exhausted unless upgraded; we will not upgrade it. The VM rate above is an indicative current retail listing sourced from the [Azure Retail Prices API-based Central India price listing](https://www.usage.ai/azure/vm/Standard_D2s_v5); final price should be checked in Azure's [Pricing Calculator](https://azure.microsoft.com/pricing/calculator/) or subscription estimate before approval. A budget alert is informational and does not stop resources.

## Provisioning and demo sequence after the gate is approved

1. Create the isolated resource group and AKS Free tier with the approved three-node x86 system pool.
2. Install/enable metrics-server and a NetworkPolicy-enforcing CNI; verify node readiness and HPA metrics.
3. Install the single-member demo MongoDB replica set and separate queue/cache Redis endpoints with credentials from secret storage. Run the migration Job and verify readiness.
4. Install Prometheus, Grafana, and Alertmanager; import the CareLens dashboard and verify real scraped metrics. Skip ingress-nginx for the port-forward demo path.
5. Create the Kubernetes secrets, configure GHCR pull permissions, deploy the exact staging image digests from D6, and wait for migrations/rollouts.
6. Use `kubectl port-forward service/frontend 18082:8080 -n carelens` from the operator machine and open `http://localhost:18082`. Configure the demo OAuth callback for that exact local URL if Google login is part of the live presentation. The app path is not public and does not prove a production HTTPS ingress.
7. Demonstrate patient → doctor → admin, metrics dashboards, bounded load/HPA scale changes, one worker node failure/recovery, alert delivery, backup/restore, and cleanup.
8. Capture redacted workflow, Kubernetes, Grafana, and browser evidence; run the documented full resource-group teardown and verify deletion.

The cluster and a three-node workload-pool failure demonstration are distinct: the separate D6 Kind workflow proves scheduler recovery in CI, not AKS capacity or the CareLens application. D8 runtime proof must be performed in the actual approved AKS staging cluster.

The optional tunnel workload is in `infra/k8s/addons/cloudflare-tunnel`. Install ingress-nginx first, create the `ingress-nginx` namespace and a `cloudflare-tunnel` Secret from the example template using a secret manager, configure the remotely managed tunnel hostname route to `http://ingress-nginx-controller.ingress-nginx.svc.cluster.local:80`, then apply the add-on. Cloudflare documents the Kubernetes token flow and `TUNNEL_TOKEN` environment variable in its [Kubernetes Tunnel guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/deployment-guides/kubernetes/). The tunnel token must never be committed or included in logs.

The data add-on is deliberately not part of the default staging overlay. After the cluster is approved, create the `carelens` namespace and populate `carelens-runtime` in the cluster secret manager using the keys in `infra/k8s/secret-template.yaml.example`; then apply `infra/k8s/addons/demo-data`. Verify `statefulset/mongodb`, `statefulset/queue-redis`, and `deployment/cache-redis` are ready, and wait for `job/mongodb-replica-init` to complete before applying the app migration. Configure `MONGODB_URI` to `mongodb://carelens_app:<encoded-password>@mongodb-0.mongodb-headless.carelens.svc.cluster.local:27017/carelens?authSource=carelens&replicaSet=rs0`; `MONGODB_MIGRATION_URI` uses the root account with `authSource=admin` and `replicaSet=rs0`. Configure queue/cache URLs as `redis://:<encoded-password>@queue-redis:6379/0` and `redis://:<encoded-password>@cache-redis:6379/0`. Do not use the example template as a live Secret without replacing every placeholder in a secret manager. The Mongo and queue PVCs are persistent and billable; deleting the StatefulSets does not necessarily delete their PVCs, so include PVC cleanup in teardown only after preserving any evidence/data you need.

## Remaining inputs and execution dependencies

- M02/M14: GitHub and cluster deployment credentials, stored in their respective secret managers.
- M07/M09/M12/M16: custom domain and Vercel setup are not available and are not required for this local port-forwarded D8 demo; D7 remains open.
- D6: GitHub/GHCR authentication, published immutable image digests, and hosted workflow evidence remain prerequisites for deployable images.
- Read-only Azure preflight: verify Central India regional and VM-family quota plus `Standard_D2s_v5` availability. The account check already reported `Azure for Students` / `Enabled`.
- M15: explicit approval of the exact plan and $15 maximum student-credit spend shown above before creating billable Azure resources.

Do not run `az aks create`, `az deployment group create`, or any other billable create/update operation until all items above are closed and the user explicitly approves the concrete envelope.

## Read-only Azure preflight before provisioning

Your student-credit and expiry information is accepted as you reported it; no further balance report is needed. The account command succeeded. The filtered quota query printed nothing because the filter may not match the returned usage labels. Microsoft's documented approach is to display the full table. In Azure Portal **Cloud Shell → Bash**, run:

```bash
az account show --query '{name:name,state:state}' --output table
az vm list-usage --location centralindia --output table
```

This is read-only. Find `Total Regional vCPUs` and the D/DS family row. The proposed three `Standard_D2s_v5` nodes need six D-family vCPUs and six regional vCPUs available. Share only those quota rows, with subscription and tenant IDs omitted. If the table is blank, report that; do not infer that quota is sufficient.

The AKS-specific SKU command returned a token claim error. First refresh the Cloud Shell session: open its menu and choose **Restart**, then rerun `az account show --query '{name:name,state:state}' --output table`. Cloud Shell normally signs Azure CLI in automatically. If it still shows `Azure for Students` / `Enabled`, check whether the VM SKU is listed for Central India using the general Compute SKU API:

```bash
az vm list-skus --location centralindia --size Standard_D2s_v5 --output table
```

This command is read-only and is the documented general VM SKU check. It can report whether the selected VM size is restricted for the subscription, but it cannot guarantee live regional capacity. If the token error persists after restarting Cloud Shell, use Azure Portal's **Create a virtual machine → Central India → Size** picker to search `Standard_D2s_v5`, then exit without creating a VM; or stop and contact Azure Support about the Cloud Shell identity token. Do not work around the error by creating a test VM or switching to Pay-As-You-Go. The proposed plan remains specified; exact-envelope approval is still required before any billable provisioning.

### Input ledger

```text
Azure region: Central India
Maximum total budget: $15 USD from Azure for Students credit; no Pay-As-You-Go
Maximum cluster run time: 8 hours
Cloudflare-managed domain: No
Vercel project/domain: No
Azure CLI: Azure Portal Cloud Shell; user-reported output confirms Azure for Students / Enabled
Pay-As-You-Go: Not allowed
```
