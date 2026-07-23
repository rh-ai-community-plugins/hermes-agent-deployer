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

### Deploying on an Existing Dashboard

**Prerequisites:** Helm 3.10+, `oc` CLI logged in, RHOAI 3.4+ installed, Agent Sandbox CRDs, python3.

#### Step 1: Install Agent Sandbox CRDs

```bash
kubectl apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/latest/download/manifest.yaml
```

#### Step 2: Install the Plugin

```bash
helm install hermes-deployer chart/ \
  --namespace hermes-deployer \
  --create-namespace
```

This creates Deployment and Service resources for both the frontend and the BFF. To skip the BFF, add `--set bff.enabled=false`.

Users deploying instances need `admin` or `edit` role in their target namespace.

#### Step 3: Register with the Dashboard

```bash
./scripts/register-plugin.sh register
```

The script is idempotent — running it again is safe. It backs up the current config before making changes. Dashboard pods restart automatically (~2 minutes).

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
4. Click **Deploy**
5. Wait for the pod to start, then click the Route link to open Hermes WebUI

### Configuration

Edit `chart/values.yaml` to customize defaults:

- `instanceDefaults.hermesImage` — Hermes sandbox container image
- `instanceDefaults.oauthProxy.enabled` — OAuth access control (default: true)
- `instanceDefaults.storage.size` — Persistent storage size for agent state
- `instanceDefaults.resources` — CPU/memory requests and limits

## Development

```bash
npm install              # Install plugin dependencies
npm run start:dev        # Plugin dev server on port 9112
```

For BFF development:

```bash
cd bff
npm install
K8S_API_BASE=$(oc whoami --show-server) npm run start:dev
```

### Build & Test

```bash
npm run build           # Production build to dist/
npm test                # Run all tests
npm run typecheck       # TypeScript type check
npm run lint            # ESLint + markdownlint
make validate           # All of the above
```

A `Makefile` provides unified operations across frontend and BFF.

### Container Builds

```bash
podman build -t hermes-agent-deployer:dev .
podman build -t hermes-agent-deployer-bff:dev bff/
```

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
