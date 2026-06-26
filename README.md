# Hermes Agent Deployer

RHOAI community plugin for deploying and managing [Hermes Agent](https://github.com/nousresearch/hermes-agent) instances on OpenShift via [OpenShell](https://github.com/NVIDIA/OpenShell) sandboxes.

## Features

- Deploy Hermes Agent instances from the RHOAI dashboard sidebar
- Select target namespace and configure model endpoint (name, URL, API key)
- Each instance gets its own pod, PVC, and OpenShift Route
- Multiple independent instances across namespaces
- OpenShift OAuth Proxy for access control (default on, configurable)
- Full Hermes WebUI (chat, workspace, skills, memory, cron) exposed via Route

## Architecture

Single-tier frontend-only deployment. The plugin UI integrates into the RHOAI dashboard via Module Federation and creates Kubernetes resources (Deployment, Service, Route, PVC, Secret) directly through the dashboard's K8s API proxy (`/api/k8s/`) using the user's token.

Each deployed instance runs the `hermes-sandbox` container image (UBI9 + Hermes Agent + WebUI) with persistent storage for agent state. No separate backend container is needed.

## Quick Start

```bash
helm install hermes-deployer chart/
```

## Development

```bash
npm install
npm run start:dev    # dev server on localhost:9112
npm run build        # production build
npm test             # run tests
```

## Container Images

| Image | Description |
|-------|-------------|
| `quay.io/rh-ai-community-plugins/hermes-agent-deployer` | Plugin frontend (nginx serving webpack bundle) |
| `quay.io/rh-ai-community-plugins/hermes-sandbox` | Hermes Agent + WebUI runtime (deployed per instance) |

## License

Apache-2.0
