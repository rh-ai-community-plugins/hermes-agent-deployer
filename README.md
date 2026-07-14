# Hermes Agent Deployer

Community plugin for **Red Hat OpenShift AI (RHOAI) Dashboard** that deploys and manages [Hermes Agent](https://github.com/nousresearch/hermes-agent) instances on OpenShift. Uses Webpack 5 Module Federation for runtime dashboard integration.

## What It Does

Users deploy autonomous Hermes Agent instances from the RHOAI sidebar. Each instance gets its own pod, PVC, Route, and optional OAuth proxy — all created through the dashboard's K8s API proxy using the logged-in user's token.

| Component | Role |
|-----------|------|
| **Plugin frontend** | Nginx-served `remoteEntry.js` loaded by the dashboard at runtime |
| **BFF service** | Node.js backend that aggregates instance listing across namespaces |
| **Hermes instances** | Per-user pods with Hermes Agent + WebUI + Chromium/Playwright |

Instance listing uses the BFF pattern (server-side aggregation). Create and delete operations go directly through the dashboard's `/api/k8s/` proxy.

## Quick Start

### Deploying on an Existing Dashboard

**Prerequisites:** Helm 3.10+, `oc` CLI access, RHOAI 3.4+ installed.

#### Step 1: Install the Plugin

```bash
helm install hermes-deployer oci://quay.io/rh-ai-community-plugins/hermes-agent-deployer-chart \
  --version 0.1.0 \
  --namespace hermes-deployer \
  --create-namespace
```

Or from a local checkout:

```bash
helm install hermes-deployer chart/ \
  --namespace hermes-deployer \
  --create-namespace
```

This creates Deployment and Service resources for both the frontend and the BFF. To skip the BFF, add `--set bff.enabled=false`.

#### Step 2: Register with the Dashboard

```bash
oc get configmap federation-config \
  -n redhat-ods-applications \
  -o jsonpath='{.data.module-federation-config\.json}' \
| python3 -c "
import json, sys
config = json.load(sys.stdin)
config.append({
  'name': 'hermesAgentDeployer',
  'backend': {
    'remoteEntry': '/remoteEntry.js',
    'authorize': False,
    'tls': False,
    'service': {
      'name': 'hermes-agent-deployer',
      'namespace': 'hermes-deployer',
      'port': 8080
    }
  },
  'proxyService': [{
    'path': '/hermes-agent-deployer/api',
    'pathRewrite': '/api',
    'authorize': True,
    'tls': False,
    'service': {
      'name': 'hermes-agent-deployer-bff',
      'namespace': 'hermes-deployer',
      'port': 3000
    }
  }]
})
print(json.dumps(config))
" > /tmp/mf-config-extended.json

oc set env deployment/rhods-dashboard \
  -n redhat-ods-applications \
  "MODULE_FEDERATION_CONFIG=$(cat /tmp/mf-config-extended.json)"
```

Dashboard pods roll out automatically. After ~2 minutes, reload and find "Hermes Agent" under "Community plugins" in the sidebar.

#### Step 3: Deploy an Instance

1. Open RHOAI dashboard → Community plugins → Hermes Agent → Instances
2. Click **Deploy New Instance**
3. Fill in: name, namespace, model endpoint (name, URL, API key)
4. Click **Deploy**
5. Wait for the pod to start, then click the Route link to open Hermes WebUI

### Configuration

Edit `chart/values.yaml` to customize defaults:

- `instanceDefaults.hermesImage` — Hermes sandbox container image
- `instanceDefaults.oauthProxy.enabled` — OAuth access control (default: true)
- `instanceDefaults.pvc.size` — Persistent volume size for agent state
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

- **[Local Setup](docs/development/LOCAL_SETUP.md)** — Development environment
- **[Project Layout](docs/development/PROJECT_LAYOUT.md)** — Source code structure
- **[OpenShift Deploy](docs/deployment/OPENSHIFT_DEPLOY.md)** — Production deployment

## License

Apache-2.0
