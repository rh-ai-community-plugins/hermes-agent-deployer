# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

RHOAI community plugin that adds a "Hermes Agent Deployer" page to the Red Hat OpenShift AI dashboard sidebar. Users create/delete Hermes Agent instances from the UI; the plugin creates K8s resources (Deployment, Service, Route, PVC, Secret, ServiceAccount) directly through the dashboard's K8s API proxy (`/api/k8s/`) using the logged-in user's token. No backend service — the React frontend talks to the K8s API directly.

## Commands

```bash
npm install              # install dependencies
npm run start:dev        # dev server on localhost:9112
npm run build            # production build → dist/
npm run build:dev        # development build → dist-dev/
npm test                 # jest (unit tests, *.test.ts / *.test.tsx)
npm run test:watch       # jest watch mode
npm run test:coverage    # jest with coverage
npm run lint             # eslint src/
```

Helm chart validation:
```bash
helm template hermes-deployer chart/ | oc apply --dry-run=client -f -
helm install hermes-deployer chart/
```

Container builds (Podman):
```bash
podman build -t hermes-agent-deployer:dev .                            # plugin frontend (nginx)
podman build -t hermes-sandbox:dev -f images/hermes-sandbox/Containerfile images/hermes-sandbox/  # agent runtime
```

## Architecture

### Two-tier deployment model

1. **Manager frontend** (this repo's Containerfile) — nginx serving the webpack bundle + Module Federation `remoteEntry.js`. Deployed once per cluster via Helm chart. The RHOAI dashboard loads the plugin's `remoteEntry.js` at runtime.

2. **Hermes instances** — created dynamically by the plugin UI. Each instance is a pod with 1-2 containers:
   - `hermes-sandbox` (UBI9 + Hermes Agent + WebUI + Chromium/Playwright)
   - `oauth-proxy` sidecar (optional, enabled by default — TLS reencrypt route)

### Module Federation

The plugin exposes two remotes via `@module-federation/enhanced`:
- `./extensions` → `src/rhoai/extensions.ts` — registers nav item, route, and area with the RHOAI dashboard
- `./Icon` → `src/rhoai/HermesNavIcon.tsx` — sidebar icon component

MF name: `hermesAgentDeployer`. Shared singletons: react, react-dom, react-router-dom, @patternfly/react-core, @openshift/dynamic-plugin-sdk.

### Source layout

- `src/rhoai/extensions.ts` — RHOAI dashboard integration (nav item at `/hermes-agent-deployer`, route, area)
- `src/app/api/k8sApi.ts` — low-level K8s fetch wrapper (`/api/k8s/` proxy)
- `src/app/api/instanceApi.ts` — CRUD operations: list (scans all namespaces), create (with rollback on failure), delete
- `src/app/api/resources.ts` — K8s resource builders (Secret, PVC, ServiceAccount, Deployment, Service, Route)
- `src/app/api/config.ts` — runtime config from `/config.json` (mounted via ConfigMap from Helm values)
- `src/app/components/` — PatternFly 6 UI: page, instance list table, create modal, detail panel, status badge
- `src/app/types.ts` — `HermesInstance`, `CreateInstanceRequest`, `AgentType`, `InstanceStatus`

### Instance resource naming convention

All K8s resources for an instance named `foo` are prefixed `hermes-foo` and share the label `app.kubernetes.io/managed-by=hermes-agent-deployer`. Instance metadata (model name, URL, PVC size, OAuth toggle) is stored in deployment annotations prefixed `hermes-agent-deployer/`.

### Config flow

Helm `values.yaml` → `instanceDefaults` section → ConfigMap → mounted as `/opt/app-root/src/config.json` → fetched by frontend at runtime via `getInstanceDefaults()`. Fallback defaults are hardcoded in `src/app/api/config.ts`.

## Key Constraints

- **OpenShift-only**: uses Route API (`route.openshift.io/v1`), OAuth proxy with serving-cert annotation, ServiceAccount OAuth redirect references
- **No backend**: all K8s operations go through the RHOAI dashboard proxy at `/api/k8s/`; dev server proxies `/api` to `localhost:8081`
- **PatternFly 6** component library (not 5)
- **UBI9 base images**, non-root UID 1001, port 8080
- **Path alias**: `~` → `./src/` (webpack + tsconfig)
- **RHOAI 3.4+ compatibility** — tested with 3.4.0; dashboard nav uses flat `app.navigation/href` (not `app.navigation/section` which is ignored by external MF plugins)

## Container Images

| Image | Registry | Role |
|-------|----------|------|
| `hermes-agent-deployer` | `quay.io/rh-ai-community-plugins/` | Plugin manager frontend |
| `hermes-sandbox` | `quay.io/rh-ai-community-plugins/` | Agent runtime per instance |
| `ose-oauth-proxy-rhel9:v4.17` | `registry.redhat.io/openshift4/` | OAuth sidecar per instance |
