# Local Development Setup

## Prerequisites

- Node.js 20+
- `oc` CLI with cluster access (cluster-admin for dashboard registration)
- OpenShift cluster with RHOAI 3.4+ installed

## Frontend

```bash
npm install
npm run start:dev    # Starts webpack dev server on port 9112
```

The dev server proxies:
- `/hermes-agent-deployer/api/*` → `localhost:3000` (BFF)
- `/api/*` → `localhost:8443` (RHOAI dashboard)

Connect to a running dashboard by port-forwarding:

```bash
oc port-forward -n redhat-ods-applications svc/rhods-dashboard 8443:8443
```

## BFF

```bash
cd bff
npm install
K8S_API_BASE=$(oc whoami --show-server) npm run start:dev
```

The BFF needs a K8s API endpoint. In development, `K8S_API_BASE` points to your cluster. In-cluster, it auto-discovers via `KUBERNETES_SERVICE_HOST`.

## Running Tests

```bash
# Frontend
npm test
npm run test:watch
npm run test:coverage

# BFF
cd bff && npm test

# Full validation
make validate
```

## Building Container Images

```bash
podman build -t hermes-agent-deployer:dev .
podman build -t hermes-agent-deployer-bff:dev bff/
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MANDATORY_NAMESPACE` | _(unset)_ | Lock instance creation to a single namespace |

See `.env.development` for the full list.
