# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

RHOAI community plugin that adds a "Hermes Agent Deployer" section under "Community plugins" in the Red Hat OpenShift AI dashboard sidebar. Users create/delete Hermes Agent instances from the UI. Instance listing is aggregated server-side by the BFF service. Create/delete operations go through the dashboard's K8s API proxy (`/api/k8s/`) using the logged-in user's token.

## Commands

```bash
npm install              # install dependencies
npm run start:dev        # dev server on localhost:9112
npm run build            # production build → dist/
npm test                 # jest (unit tests, *.spec.ts / *.spec.tsx)
npm run test:watch       # jest watch mode
npm run test:coverage    # jest with coverage
npm run typecheck        # typescript type check
npm run lint             # eslint src/
make validate            # lint + typecheck + test (frontend + BFF)
```

BFF service:
```bash
cd bff && npm install
K8S_API_BASE=$(oc whoami --show-server) npm run start:dev  # BFF on port 3000
cd bff && npm test                                          # BFF tests (*.test.ts)
```

Dev workflow (with Makefile):
```bash
make dev-push IMAGE_TAG=experimental               # Build & push both images (linux/amd64)
make deploy                                         # Helm install + CRD prereq check
make redeploy                                       # Helm upgrade + rollout restart (iterate)
make validate                                       # Lint + typecheck + test only
make register                                       # Register plugin with dashboard
```

Helm chart:
```bash
helm template hermes-deployer chart/ | oc apply --dry-run=client -f -
helm install hermes-deployer chart/
```

Container builds (Podman):
```bash
podman build --platform linux/amd64 -t hermes-agent-deployer:dev .          # plugin frontend (nginx)
podman build --platform linux/amd64 -t hermes-agent-deployer-bff:dev bff/   # BFF service
```

## Architecture

### Three-tier deployment model

1. **Plugin frontend** (this repo's Containerfile) — nginx serving the webpack bundle + Module Federation `remoteEntry.js`. Deployed once per cluster via Helm chart.

2. **BFF service** (`bff/`) — Express.js on port 3000. Aggregates instance listing across all accessible namespaces server-side. Receives user's Bearer token via the dashboard proxy.

3. **Hermes instances** — created dynamically by the plugin UI as Agent Sandbox custom resources (`agents.x-k8s.io/v1beta1`). Each instance provisions:
   - Sandbox CR with containers: `hermes-sandbox` (UBI9 + Hermes Agent + WebUI + Chromium/Playwright), `oauth-proxy` sidecar (optional, enabled by default)
   - Service and Route for WebUI access
   - PVC for persistent storage (via `volumeClaimTemplates`)
   - Secret and ServiceAccount for credentials
   - All resources share label `app.kubernetes.io/managed-by=hermes-agent-deployer`

### Module Federation

Standard webpack 5 `ModuleFederationPlugin` (not `@module-federation/enhanced`). Exposes:
- `./extensions` → `src/rhoai/extensions.ts` — 5 extensions: shared community section, area, section, nav item, route
- `./Icon` → `src/app/components/HermesNavIcon.tsx` — sidebar icon

MF name: `hermesAgentDeployer`. Shared singletons: react, react-dom, react-router-dom, @patternfly/react-core, @openshift/dynamic-plugin-sdk.

### Source layout

- `src/rhoai/extensions.ts` — RHOAI dashboard registration (5 extensions with lazy route import)
- `src/rhoai/CommunityNavIcon.tsx` — [SHARED] community plugins sidebar icon
- `src/app/App.tsx` — Root layout: CommunityBanner + Routes
- `src/app/api/k8sApi.ts` — low-level K8s fetch wrapper (`/api/k8s/` proxy)
- `src/app/api/instanceApi.ts` — create (with rollback), delete, suspend, resume, listAgentTypes, listPolicyTemplates
- `src/app/api/resources.ts` — K8s resource builders (Secret, ServiceAccount, Sandbox, Service, Route)
- `src/app/api/config.ts` — runtime config from `/config.json` (mounted via ConfigMap)
- `src/app/hooks/` — React hooks: useInstances (BFF polling), useNamespaces, useInstanceDefaults, useInstanceMutation (suspend/resume)
- `src/app/components/` — PatternFly 6 UI: CommunityBanner [SHARED], HermesNavIcon, InstanceList, InstanceCreateModal, PolicySelector, StatusBadge
- `src/app/pages/HermesDeployerPage.tsx` — main page consuming hooks
- `src/app/types.ts` — `HermesInstance`, `CreateInstanceRequest`, `AgentType`, `InstanceStatus` (Pending/Running/Suspended/Failed), `NetworkPolicyTier`

### BFF layout

- `bff/src/server.ts` — Express app, GET /api/health + /api/instances + /api/policies/templates
- `bff/src/routes/instances.ts` — Lists projects, filters system namespaces, fetches Sandbox CRs by label, fetches routes
- `bff/src/routes/policies.ts` — Lists available network policy tiers (standard/restricted/permissive)
- `bff/src/utils/k8sClient.ts` — Raw Node.js https to K8s API (in-cluster or K8S_API_BASE env)

### Instance resource model

Instances are Agent Sandbox CRs (`agents.x-k8s.io/v1beta1`). For instance named `foo`:
- Resources prefixed `hermes-foo`: Secret, ServiceAccount, Sandbox, Service, Route
- All share label `app.kubernetes.io/managed-by=hermes-agent-deployer`
- Metadata stored in Sandbox annotations (`hermes-agent-deployer/` prefix)
- PVC named `hermes-data-hermes-foo-0` (via `volumeClaimTemplates`, auto-cleaned on delete)
- Suspend/resume via `spec.operatingMode` PATCH (Running/Suspended)
- Network policy tier via annotation `hermes-agent-deployer/network-policy-tier` (when OpenShell enabled)

### Config flow

Helm `values.yaml` → `instanceDefaults` section → ConfigMap → mounted as `/opt/app-root/src/config.json` → fetched by frontend at runtime via `getInstanceDefaults()`. Fallback defaults are hardcoded in `src/app/api/config.ts`. Config includes `openshell.enabled` and `openshell.networkPolicyTier` when OpenShell is enabled.

## Key Constraints

- **Agent Sandbox CRDs v0.5.2+ required**: `kubectl apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v0.5.2/sandbox.yaml`
- **OpenShift-only**: uses Route API (`route.openshift.io/v1`), OAuth proxy, ServiceAccount OAuth redirect references
- **BFF for listing**: instance listing via `/hermes-agent-deployer/api/instances` (BFF, queries `/apis/agents.x-k8s.io/v1beta1/namespaces/{ns}/sandboxes`). Create/delete/suspend/resume via `/api/k8s/` (dashboard proxy)
- **RHOAI 3.4.2+**: uses `MODULE_FEDERATION_CONFIG` env var on dashboard deployment. Plugin registration via `backend` wrapper format with `proxyService` for BFF proxy
- **Dashboard operator must be scaled down** during plugin registration to prevent config revert (script handles this with warnings)
- **PatternFly 6** component library (not 5)
- **UBI9 base images**, non-root UID 1001, port 8080 (frontend) / 3000 (BFF)
- **Platform**: All podman builds must include `--platform linux/amd64` (Mac ARM → OpenShift x86)
- **Path alias**: `~` → `./src/` (webpack + tsconfig)
- **Test conventions**: `*.spec.ts` (frontend), `*.test.ts` (BFF)
- **[SHARED] components**: CommunityNavIcon and CommunityBanner are identical across all community plugins — do not modify
- **OpenShell integration** (optional, disabled by default): Helm `openshell` section, SCC binding, network policy ConfigMap, per-instance policy tier annotation

## Container Images

| Image | Registry | Role |
|-------|----------|------|
| `hermes-agent-deployer` | `quay.io/rh-ai-community-plugins/` | Plugin frontend (nginx) |
| `hermes-agent-deployer-bff` | `quay.io/rh-ai-community-plugins/` | BFF service (Node.js) |
| `hermes-sandbox` | `quay.io/rh-ai-community-plugins/` | Agent runtime per instance |
| `ose-oauth-proxy-rhel9:v4.17` | `registry.redhat.io/openshift4/` | OAuth sidecar per instance |
