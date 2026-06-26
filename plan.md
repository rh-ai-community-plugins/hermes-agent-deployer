# Hermes Agent Deployer — Implementation Plan

## Context

Deploy Hermes Agent (Nous Research) inside OpenShell (NVIDIA) sandboxes on OpenShift, packaged as an RHAIE community plugin. Users provision instances through a management UI in the RHAIE dashboard sidebar — selecting a namespace, filling in model config (name, URL, API key) — and the plugin creates a pod + PVC running Hermes with its full WebUI exposed via an OpenShift Route. Multiple independent instances are supported. Access is gated by OpenShift OAuth by default.

## Architecture

**Single-tier design: frontend-only manager calling K8s API directly**

```
┌─ RHAIE Dashboard ─────────────────────────────┐
│  Sidebar: "Hermes Agent Deployer" nav item     │
│  ┌─ Manager UI (Module Federation remote) ──┐  │
│  │  • Namespace selector                    │  │
│  │  • Agent type selector (Hermes, future…) │  │
│  │  • Config form (model, url, key)         │  │
│  │  • Instance list + status                │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
        │ K8s API calls via dashboard proxy (user's token)
        │ (no separate backend container or REST API)
        ▼
┌─ Per-Instance Pod (user's namespace) ──────────┐
│  Container 1: hermes-sandbox                   │
│    Hermes Agent + WebUI on port 8080           │
│    PVC mounted at /home/hermes/.hermes         │
│    Env vars from Secret (model config)         │
│  Container 2: oauth-proxy (optional, default)  │
│    Port 8443, proxies to localhost:8080         │
│  Container 3: openshell-supervisor (Phase 3)   │
│    Policy enforcement sidecar                  │
├────────────────────────────────────────────────┤
│  Service → Route (TLS) → browser access        │
└────────────────────────────────────────────────┘
```

**Instance discovery**: Label selector `app.kubernetes.io/managed-by: hermes-agent-deployer` — no external database needed.

## Repository Structure

```
hermes-agent-deployer/
├── plugin.yaml                    # RHAIE plugin manifest (charter-required)
├── Containerfile                  # Manager frontend image build (nginx)
├── .gitignore
├── chart/                         # Helm chart — installs the MANAGER only
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── README.md
│   └── templates/
│       ├── _helpers.tpl
│       ├── deployment.yaml        # Manager: frontend (nginx) only
│       ├── service.yaml
│       ├── route.yaml
│       └── rbac.yaml              # ClusterRole for cross-namespace instance mgmt
├── src/                           # Frontend — Next.js/React/TS
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   ├── api/
│   │   │   ├── resources.ts       # Build K8s resource manifests
│   │   │   ├── k8sApi.ts          # K8s API client via dashboard proxy
│   │   │   └── instanceApi.ts     # Instance CRUD using K8s API
│   │   ├── types.ts               # HermesInstance, AgentConfig interfaces
│   │   └── components/
│   │       ├── HermesDeployerPage.tsx
│   │       ├── InstanceList.tsx
│   │       ├── InstanceCreateModal.tsx
│   │       ├── InstanceDetail.tsx
│   │       ├── AgentTypeSelector.tsx
│   │       └── StatusBadge.tsx
│   ├── rhoai/
│   │   ├── extensions.ts          # Module Federation setup
│   │   └── HermesNavIcon.tsx
│   └── lib/
│       └── k8sTypes.ts            # K8s manifest types (TypeScript)
├── public/
│   └── (static assets)
├── images/
│   └── hermes-sandbox/
│       └── Containerfile          # UBI9 + Hermes Agent + WebUI, port 8080
├── docs/
│   ├── README.md
│   └── screenshots/
├── next.config.ts
├── package.json
├── tsconfig.json
└── .env.local
```

## Container Images

| Image | Base | Contents | Port |
|-------|------|----------|------|
| `quay.io/rh-ai-community-plugins/hermes-agent-deployer:0.1.0` | UBI9 nginx | Manager frontend (Next.js bundle) | 8080 |
| `quay.io/rh-ai-community-plugins/hermes-sandbox:0.1.0` | UBI9 Python 3.11 | Hermes Agent + WebUI pre-installed | 8080 |

**hermes-sandbox image build:**
1. Base: `registry.access.redhat.com/ubi9/python-311`
2. Install hermes-agent + hermes-webui via pip/git
3. Set `HERMES_WEBUI_PORT=8080`, `HERMES_WEBUI_HOST=0.0.0.0`
4. Create `/home/hermes/.hermes` owned by root group (GID 0) with `g=u` permissions — supports OpenShift arbitrary UID assignment (restricted SCC assigns a random UID from the namespace range, always with GID 0)
5. Do NOT hardcode `USER` — let OpenShift assign the UID
6. Entrypoint: start Hermes WebUI (runs agent in-process)

## Helm Chart (chart/)

The chart installs **only the manager frontend** (Next.js built and served by nginx). Instances are created dynamically via the K8s API directly from the browser.

**Key values.yaml sections:**
- `frontend.image` — manager frontend image (nginx + Next.js bundle)
- `instanceDefaults.hermesImage` — default hermes-sandbox image for instances
- `instanceDefaults.oauthProxy.enabled: true` — OAuth Proxy default on
- `instanceDefaults.oauthProxy.image` — oauth-proxy image ref
- `instanceDefaults.pvc.size: 1Gi` — default PVC size
- `instanceDefaults.resources` — CPU/memory for hermes + supervisor containers

**RBAC (chart/templates/rbac.yaml):**
Manager ServiceAccount gets a ClusterRole with permissions to list Deployments, Pods, Routes, etc. across namespaces (for discovering instances via label selector). Instance creation uses the user's token directly.

**Clean removal:** A pre-delete Helm hook Job sweeps all resources labeled `app.kubernetes.io/managed-by: hermes-agent-deployer` before the manager is removed.

## Instance Lifecycle

**Create:** User fills form → frontend builds K8s manifests (Secret, PVC, SA, Deployment, Service, Route) → submits via K8s API proxy using user's bearer token:
1. Secret (API key, model URL)
2. PVC
3. ServiceAccount (with oauth-redirect annotation if OAuth enabled)
4. Deployment (hermes-sandbox + oauth-proxy)
5. Service
6. Route

**Error handling:** If K8s API rejects any resource (e.g., user lacks Route permission in the namespace), frontend catches the error and may attempt cleanup via DELETE calls.

**List:** Frontend queries K8s API for Deployments by label selector across namespaces (user's token scope), enriches with pod status + route URL. Manager SA only needed for dashboard access to monitor instances.

**Update:** Frontend patches the Secret (model config changes) and/or Deployment (image upgrade, resource changes) using user's token via K8s API.

**Delete:** Frontend deletes via K8s API (user's token): Route → Service → Deployment → ServiceAccount → Secret → PVC

**All instance resources share labels:**
```yaml
app.kubernetes.io/name: hermes-instance
app.kubernetes.io/instance: <instance-name>
app.kubernetes.io/managed-by: hermes-agent-deployer
hermes-agent-deployer/agent-type: hermes
```

## Auth Model

**Single identity — user's token via RHAIE dashboard:**
- **User's bearer token** (from RHAIE dashboard session, passed via browser fetch to K8s API proxy): used for all instance CRUD operations. The dashboard's API proxy (`/api/k8s/`) enforces that the user's token only touches their authorized resources. K8s RBAC ensures the user can only create/delete resources in namespaces they have access to.
- **Manager SA** (its own ServiceAccount with minimal ClusterRole): used only for discovery operations — listing Deployments across namespaces to populate the instance list, reading Pods for status. Instance mutations always use the user's token.

**Instance access layers:**
- **Plugin access:** RHAIE dashboard RBAC filters sidebar visibility
- **Instance access (default):** OAuth Proxy sidecar authenticates via OpenShift OAuth. ServiceAccount gets `oauth-redirectreference` annotation. Route uses TLS reencrypt to oauth-proxy on port 8443.
- **Instance access (optional):** Disable OAuth Proxy → Route hits hermes-sandbox directly on 8080. Hermes WebUI password (`HERMES_WEBUI_PASSWORD`) provides basic protection.

## Agent Type Extensibility

Agent types defined in frontend config (e.g., `src/lib/agents.ts`). Each agent type specifies:
- Container image + tag
- Required env vars (name, description, type)
- Volume mounts
- Health check path

Frontend `AgentTypeSelector` reads available types from config and renders a schema-driven form (e.g., `react-jsonschema-form`) to collect values. Form schema is embedded in the agent config. When user submits, frontend builds K8s manifests using the agent type template. Adding a new agent type = new config entry + new container image + JSON Schema in the agent definition. No backend needed.

## Implementation Phases

### Phase 1 — MVP (build first)
1. Scaffold repo structure (Next.js + Webpack Module Federation)
2. Frontend: Module Federation setup + RHOAI extensions
3. Frontend: HermesDeployerPage, InstanceList, InstanceCreateModal
4. Frontend K8s API client (`k8sApi.ts`, `resources.ts`, `instanceApi.ts`)
5. hermes-sandbox Containerfile (UBI9 + Hermes Agent + WebUI)
6. Helm chart for the manager (nginx only)
7. plugin.yaml

### Phase 2 — Auth, Security & Updates
1. OAuth Proxy sidecar in instance pods (default on)
2. NetworkPolicy per instance
3. Secret management for API keys (stored as Secret in K8s)
4. Instance status polling in UI (watch API or polling)
5. Instance update (PATCH) — change model config or upgrade image without recreating

### Phase 3 — OpenShell Integration
1. OpenShell supervisor sidecar (optional, configurable)
2. Policy ConfigMap per instance (filesystem, network, process rules)

### Phase 4 — Polish & Submission
1. Agent type registry in frontend config + dynamic form builder
2. CI workflows (lint, test, helm validate, image build+push)
3. docs/README.md with screenshots + install guide
4. PR to charter repo's plugins.yaml

## Verification

1. `helm template chart/ | oc apply --dry-run=client -f -` — validates chart
2. `helm install hermes-deployer chart/` — deploys manager
3. Open RHAIE dashboard → click "Hermes Agent Deployer" in sidebar
4. Create an instance → verify pod Running, Route accessible
5. Access Hermes WebUI via Route → configure model → send a prompt
6. Create 2 more instances in different namespaces → verify independence
7. Delete an instance → verify all resources cleaned up
8. `helm uninstall hermes-deployer` → verify pre-delete hook cleans instances
