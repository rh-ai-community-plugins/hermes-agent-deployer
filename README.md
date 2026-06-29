# Hermes Agent Deployer

RHOAI community plugin for deploying and managing [Hermes Agent](https://github.com/nousresearch/hermes-agent) instances on OpenShift via [OpenShell](https://github.com/NVIDIA/OpenShell) sandboxes.

## Features

- Deploy Hermes Agent instances from the RHOAI dashboard sidebar
- Select target namespace and configure model endpoint (name, URL, API key)
- Each instance gets its own pod, PVC, and OpenShift Route with TLS
- Multiple independent instances across namespaces (independent state via PVC)
- OpenShift OAuth Proxy sidecar for access control (enabled by default, configurable)
- Full Hermes WebUI (chat, workspace, skills, memory, cron) exposed via Route
- Browser automation: Hermes instances include Chromium + Playwright for web browsing and screenshots

## Architecture

Single-tier frontend-only deployment. The plugin UI integrates into the RHOAI dashboard via Module Federation and creates Kubernetes resources (Deployment, Service, Route, PVC, Secret) directly through the dashboard's K8s API proxy (`/api/k8s/`) using the user's token.

Each deployed instance runs the `hermes-sandbox` container image (UBI9 + Hermes Agent + WebUI) with persistent storage for agent state. No separate backend container is needed.

## Quick Start

### Prerequisites
- OpenShift cluster with RHOAI 3.4+ installed
- kubectl/oc CLI access to the cluster
- Helm 3.10+

### Install

```bash
# Verify Helm chart
helm template hermes-deployer chart/ | oc apply --dry-run=client -f -

# Install the manager UI (Helm chart deploys only the frontend)
helm install hermes-deployer chart/

# Verify deployment
oc rollout status deployment/hermes-deployer-hermes-agent-deployer
```

### Use

1. Open the RHOAI dashboard
2. Click "Hermes Agent Deployer" in the sidebar
3. Select target project (namespace)
4. Fill in model configuration:
   - **Model Name**: e.g., "my-model"
   - **API Base URL**: endpoint URL (e.g., `http://vllm:8000/v1` or `https://api.openai.com/v1`)
   - **API Key**: (leave empty for local endpoints without auth)
5. Click **Create**
6. Wait for pod to start, then click the Route link to open Hermes WebUI
7. Configure the model in the Hermes UI and start chatting

### Configuration

Edit `chart/values.yaml` before installing to customize:
- `image`: Manager frontend image registry/tag
- `instanceDefaults.hermesImage`: Hermes sandbox container image
- `instanceDefaults.oauthProxy.enabled`: Enable/disable OAuth access control
- `instanceDefaults.pvc.size`: Persistent volume size for agent state
- `instanceDefaults.resources`: CPU/memory requests and limits

## Development

```bash
npm install
npm run start:dev    # dev server on localhost:9112
npm run build        # production build
npm test             # run tests
```

## Container Images

| Image | Role | Built From |
|-------|------|-----------|
| `quay.io/rh-ai-community-plugins/hermes-agent-deployer:0.1.0` | Plugin manager frontend (nginx + React bundle) | Containerfile (root) |
| `quay.io/rh-ai-community-plugins/hermes-sandbox:0.1.0` | Hermes Agent + WebUI + Chromium/Playwright (per instance) | images/hermes-sandbox/Containerfile |
| `quay.io/openshift/oauth-proxy:latest` | OAuth gateway sidecar (per instance, TLS reencrypt) | Red Hat registry |

Each deployed instance includes both hermes-sandbox and oauth-proxy containers in a single pod.

## License

Apache-2.0
