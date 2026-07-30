# Hermes Agent Deployer

Community plugin for **Red Hat OpenShift AI (RHOAI) Dashboard** that deploys and manages [Hermes Agent](https://github.com/nousresearch/hermes-agent) instances on OpenShift. Uses Webpack 5 Module Federation for runtime dashboard integration.

## What It Does

Users deploy autonomous Hermes Agent instances from the RHOAI sidebar. Each instance is an **Agent Sandbox CR** that provisions:
- Pod with Hermes Agent + WebUI + Chromium/Playwright + optional OAuth proxy
- Persistent storage (PVC via `volumeClaimTemplates`)
- Service and Route for WebUI access
- Secret and ServiceAccount for credentials

| Component | Role |
|-----------|------|
| **Plugin frontend** | Nginx-served `remoteEntry.js` loaded by the dashboard at runtime |
| **BFF service** | Node.js backend that aggregates instance listing across namespaces + serves network policy templates |
| **Hermes instances** | Per-user Agent Sandbox CRs with Hermes Agent + WebUI + Chromium/Playwright |

Instance listing uses the BFF pattern (server-side aggregation). Create, delete, suspend, and resume operations go through the dashboard's `/api/k8s/` proxy. Network policy selection (optional, OpenShell integration) is managed via instance annotations.

## Quick Start

### Prerequisites

- Helm 3.10+
- `oc` CLI logged in to an OpenShift cluster
- RHOAI 3.4.2+ installed
- Agent Sandbox CRDs v0.5.2+ installed on the cluster
- python3 (for plugin registration script)

### Deploying on an Existing Dashboard

#### Step 1: Install Agent Sandbox CRDs

```bash
oc apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v0.5.2/sandbox.yaml
```

#### Step 2: Install the Plugin

```bash
helm install hermes-deployer chart/ \
  --namespace hermes-deployer \
  --create-namespace
```

This creates Deployments and Services for the frontend (nginx) and BFF (Node.js). To skip the BFF, add `--set bff.enabled=false`.

Users deploying instances need `admin` or `edit` role in their target namespace.

#### Step 3: Register with the Dashboard

```bash
./scripts/register-plugin.sh register
```

The script:
- Scales down the RHOAI operator (to prevent config revert)
- Patches the dashboard deployment's `MODULE_FEDERATION_CONFIG` env var
- Is idempotent — running it again is safe
- Backs up the current config before making changes
- Dashboard pods restart automatically (~2 minutes)

To check registration status or unregister:

```bash
./scripts/register-plugin.sh status
./scripts/register-plugin.sh unregister
```

If installing to a custom namespace, set `PLUGIN_NS`:

```bash
PLUGIN_NS=my-namespace ./scripts/register-plugin.sh register
```

#### Step 4: Deploy an Instance

1. Open RHOAI dashboard → Community plugins → Hermes Agent → Instances
2. Click **Deploy New Instance**
3. Fill in: name, namespace, model endpoint (name, URL, API key)
4. Optionally select a **network policy tier** if OpenShell is enabled on the cluster
5. Click **Deploy**
6. Wait for the pod to start, then click the Route link to open Hermes WebUI

### Configuration

Edit `chart/values.yaml` to customize defaults:

**Instance defaults:**
- `instanceDefaults.hermesImage` — Hermes sandbox container image
- `instanceDefaults.oauthProxy.enabled` — OAuth access control (default: true)
- `instanceDefaults.storage.size` — Persistent storage size for agent state
- `instanceDefaults.resources` — CPU/memory requests and limits

**OpenShell integration (optional):**
- `openshell.enabled` — Enable network policy tier selection in create UI (default: false)
- `openshell.sccBinding.enabled` — Create ServiceAccount + SCC binding for sandboxes (default: false)
- `openshell.networkPolicy.enabled` — Create network policy ConfigMap (default: false)
- `openshell.networkPolicy.tiers` — Tier definitions (standard/restricted/permissive)

## Development

### Local dev (connected to cluster)

```bash
oc login ...             # Log in to your OpenShift cluster
make install             # Install dependencies (frontend + BFF)
make dev-all             # Start frontend (9112) + BFF (3000), Ctrl-C stops both
```

Open `http://localhost:9112/hermes-agent-deployer`. The dev server auto-injects your `oc` token into both the BFF and K8s API proxies.

To run frontend or BFF individually:

```bash
make dev                 # Frontend only (port 9112)
make dev-bff             # BFF only (port 3000, needs K8S_API_BASE)
```

### Build & Test

```bash
npm run build           # Production build to dist/
npm test                # Run all tests
npm run typecheck       # TypeScript type check
npm run lint            # ESLint + markdownlint
make validate           # All of the above
```

### Dev Workflow (with Makefile)

Build and push images with tag, deploy to cluster, iterate:

```bash
# First deploy on a new cluster
oc apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v0.5.2/sandbox.yaml
make dev-push deploy register IMAGE_TAG=experimental

# After code changes
make dev-push redeploy IMAGE_TAG=experimental

# Validate code only (no build/push)
make validate
```

The Makefile targets:
- `dev-push IMAGE_TAG=<tag>` — Build and push both images (`--platform linux/amd64`, no version prompt)
- `deploy` — Helm install with CRD prereq check, creates namespace
- `redeploy` — Helm upgrade + rollout restart for same-tag iteration
- `register` — Register plugin with dashboard (idempotent)

### Container Builds

```bash
podman build --platform linux/amd64 -t hermes-agent-deployer:dev .
podman build --platform linux/amd64 -t hermes-agent-deployer-bff:dev bff/
```

**Note:** Always include `--platform linux/amd64` when building on Mac ARM (M1/M2/M3).

## Container Images

| Image | Registry | Role |
|-------|----------|------|
| `hermes-agent-deployer` | `quay.io/rh-ai-community-plugins/` | Plugin frontend (nginx) |
| `hermes-agent-deployer-bff` | `quay.io/rh-ai-community-plugins/` | BFF service (Node.js) |
| `hermes-sandbox` | `quay.io/rh-ai-community-plugins/` | Agent runtime per instance |
| `ose-oauth-proxy-rhel9:v4.17` | `registry.redhat.io/openshift4/` | OAuth sidecar per instance |

## Documentation

See [`docs/`](docs/) for detailed guides:

- **[OpenShift Deploy](docs/deployment/OPENSHIFT_DEPLOY.md)** — Production deployment, user permissions, troubleshooting
- **[Local Setup](docs/development/LOCAL_SETUP.md)** — Development environment
- **[Project Layout](docs/development/PROJECT_LAYOUT.md)** — Source code structure

## License

Apache-2.0
