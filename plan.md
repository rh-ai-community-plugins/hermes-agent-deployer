# Hermes Agent Deployer — Implementation Plan

## Context

Deploy Hermes Agent (Nous Research) on OpenShift with OpenShell (NVIDIA) sandboxing, packaged as an RHAIE community plugin. Users provision instances through a management UI in the RHAIE dashboard sidebar — selecting a project, filling in model config (name, URL, API key) — and the plugin creates a pod + PVC running Hermes with its full WebUI exposed via an OpenShift Route. Multiple independent instances are supported. Access is gated by OpenShift OAuth by default.

OpenShell is the end goal — it provides the policy-driven sandboxing (filesystem access control, network egress filtering, process restrictions) that makes it safe to run an autonomous agent in a shared cluster. Phase 1 deploys Hermes in a plain pod; Phase 3 wraps it in OpenShell. A bare Hermes deployment without OpenShell is an intermediate stepping stone, not the product.

## Architecture

**Single-tier design: frontend-only manager calling K8s API directly**

```
┌─ RHAIE Dashboard ─────────────────────────────┐
│  Sidebar: "Hermes Agent Deployer" nav item     │
│  ┌─ Manager UI (Module Federation remote) ──┐  │
│  │  • NamespaceBar (project selector)       │  │
│  │  • Model config form (url, key, name)    │  │
│  │  • "Pick a cluster model" (greyed, soon) │  │
│  │  • Instance list + status                │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
        │ K8s API calls via dashboard proxy (user's token)
        │ All operations use user's identity — no shared SA
        ▼
┌─ Per-Instance Pod (user's namespace) ──────────┐
│  Container 1: hermes-sandbox                   │
│    Hermes Agent + WebUI on port 8080           │
│    PVC mounted at /home/hermes/.hermes         │
│    Env vars from Secret (model config)         │
│  Container 2: oauth-proxy (Phase 2, default)   │
│    Port 8443, proxies to localhost:8080         │
│  Container 3: openshell-supervisor (Phase 3)   │
│    Policy enforcement sidecar                  │
├────────────────────────────────────────────────┤
│  Service → Route (TLS) → browser access        │
└────────────────────────────────────────────────┘
```

**Instance discovery**: Single K8s API call with label selector `app.kubernetes.io/managed-by=hermes-agent-deployer`, scoped by the NamespaceBar selection. K8s RBAC automatically filters to what the user can see.

## Repository Structure

```
hermes-agent-deployer/
├── plugin.yaml                    # RHAIE plugin manifest (charter-required)
├── Containerfile                  # Manager frontend image build (nginx)
├── .gitignore
├── chart/                         # Helm chart — installs the MANAGER only
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── templates/
│   │   ├── _helpers.tpl
│   │   ├── deployment.yaml        # Manager: frontend (nginx) only
│   │   ├── configmap.yaml         # Instance defaults (image, resources, PVC size)
│   │   ├── service.yaml
│   │   ├── route.yaml
│   │   └── rbac.yaml              # ServiceAccount only — no ClusterRole
│   └── README.md
├── config/                        # Webpack configuration
│   ├── webpack.common.js
│   ├── webpack.dev.js
│   └── webpack.prod.js
├── src/                           # Frontend — React + PatternFly + Webpack Module Federation
│   ├── index.ts                   # Entry point
│   ├── index.html
│   ├── bootstrap.tsx              # Async bootstrap for Module Federation
│   ├── app/
│   │   ├── App.tsx
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
│   │       └── StatusBadge.tsx
│   ├── rhoai/
│   │   ├── extensions.ts          # Module Federation setup
│   │   └── HermesNavIcon.tsx
│   └── typings.d.ts
├── images/
│   └── hermes-sandbox/
│       └── Containerfile          # UBI9 + Hermes Agent + WebUI, port 8080
├── package.json
└── tsconfig.json
```

## Container Images

| Image | Base | Contents | Port |
|-------|------|----------|------|
| `quay.io/rh-ai-community-plugins/hermes-agent-deployer:0.1.0` | UBI9 nginx | Manager frontend (React + PatternFly bundle) | 8080 |
| `quay.io/rh-ai-community-plugins/hermes-sandbox:0.1.0` | UBI9 Python 3.11 | Hermes Agent + WebUI pre-installed | 8080 |

**hermes-sandbox image build:**
1. Base: `registry.access.redhat.com/ubi9/python-311`
2. Install `hermes-agent` and `hermes-webui` with pinned versions (pin to current latest at build time)
3. Set `HERMES_WEBUI_PORT=8080`, `HERMES_WEBUI_HOST=0.0.0.0`
4. Create `/home/hermes/.hermes` owned by root group (GID 0) with `g=u` permissions — supports OpenShift arbitrary UID assignment (restricted SCC assigns a random UID from the namespace range, always with GID 0)
5. `USER 1001` as fallback — OpenShift overrides this via restricted SCC, but it provides a sensible default for non-OpenShift environments
6. Entrypoint: start Hermes WebUI (runs agent in-process)

## Helm Chart (chart/)

The chart installs **only the manager frontend** (React bundle served by nginx). Instances are created dynamically via the K8s API directly from the browser.

**Instance defaults via ConfigMap:** The chart renders a ConfigMap from `instanceDefaults` values. The nginx container serves it as a JSON file (e.g., `/opt/app-root/src/config.json`). The frontend fetches it on load. Admins change defaults via `helm upgrade` — no image rebuild needed.

**Key values.yaml sections:**
- `image` — manager frontend image (nginx + React bundle)
- `instanceDefaults.hermesImage` — default hermes-sandbox image for instances
- `instanceDefaults.oauthProxy.enabled: true` — OAuth Proxy default on
- `instanceDefaults.oauthProxy.image` — oauth-proxy image ref
- `instanceDefaults.pvc.size: 1Gi` — default PVC size
- `instanceDefaults.resources` — CPU/memory for hermes containers

**RBAC (chart/templates/rbac.yaml):**
Minimal ServiceAccount for the manager pod only. No ClusterRole — all K8s operations use the user's token via the dashboard proxy.

**Uninstall behavior:** `helm uninstall` removes only the manager UI. Instances keep running independently — they are the user's resources in the user's namespaces. Users should delete instances via the plugin UI before uninstalling. No pre-delete hook.

## Instance Lifecycle

**Create:** User fills form → frontend builds K8s manifests → submits via K8s API proxy using user's bearer token:
1. Secret (API key, model URL) — or reference an existing Secret by name
2. PVC
3. ServiceAccount (with oauth-redirect annotation if OAuth enabled)
4. Deployment (hermes-sandbox + oauth-proxy)
5. Service
6. Route

On partial failure, frontend rolls back already-created resources and reports the error.

**List:** Single K8s API call with label selector, scoped by NamespaceBar selection:
- Specific project selected → namespace-scoped: `/apis/apps/v1/namespaces/{ns}/deployments?labelSelector=...`
- "All Projects" selected → cluster-scoped: `/apis/apps/v1/deployments?labelSelector=...`

K8s RBAC filters results to what the user can see. Enriched with pod status + route URL.

**Update:** Frontend patches the Secret (model config changes) and/or Deployment (image upgrade, resource changes) using user's token.

**Delete:** Frontend deletes all instance resources in parallel, collects results, and reports any partial failures to the user (e.g., "Instance deleted. Failed to remove: Route (403 Forbidden)"). No silent swallowing.

**All instance resources share labels:**
```yaml
app.kubernetes.io/name: hermes-instance
app.kubernetes.io/instance: <instance-name>
app.kubernetes.io/managed-by: hermes-agent-deployer
hermes-agent-deployer/agent-type: hermes
```

## Auth Model

**Single identity — user's token for everything:**
- **User's bearer token** (from RHAIE dashboard session, passed via browser fetch to K8s API proxy): used for all operations — CRUD, discovery, status. The dashboard's API proxy (`/api/k8s/`) forwards the user's token. K8s RBAC ensures the user can only touch their authorized namespaces. No shared ServiceAccount with elevated permissions.

**Secret handling:**
- **Create inline:** User enters API key in the form, frontend creates a K8s Secret
- **Reference existing:** User provides an existing Secret name (supports Vault, External Secrets Operator integration)

**Instance access layers:**
- **Plugin access:** RHAIE dashboard RBAC filters sidebar visibility
- **Instance access (default):** OAuth Proxy sidecar authenticates via OpenShift OAuth. ServiceAccount gets `oauth-redirectreference` annotation. Route uses TLS reencrypt to oauth-proxy on port 8443.
- **Instance access (optional):** Disable OAuth Proxy → Route hits hermes-sandbox directly on 8080. Hermes WebUI password (`HERMES_WEBUI_PASSWORD`) provides basic protection.

## Model Configuration

**MVP:** Free-text fields for model endpoint URL, API key (optional), and model name. Supports both internal cluster endpoints (vLLM/TGI) and external APIs (OpenAI, etc.).

**Future:** "Pick a cluster model" option discovers InferenceService endpoints from RHOAI Model Serving. Shown in the UI as a greyed-out option with "Coming soon" label to signal the roadmap.

## Agent Type Extensibility

Agent types defined in frontend config (e.g., `src/lib/agents.ts`). Each agent type specifies:
- Container image + tag
- Required env vars (name, description, type)
- Volume mounts
- Health check path

Adding a new agent type = new config entry + new container image. No backend needed.

## Implementation Phases

### Phase 1 — MVP (build first)
1. Scaffold repo structure (React + PatternFly + Webpack Module Federation)
2. Frontend: Module Federation setup + RHOAI extensions
3. Nav structure: separator bar below Settings, "Community plugins" parent, plugin nested with "Community" badge
4. Deployer page: NamespaceBar component for project selection
5. Create form: model config fields + greyed-out "Pick a cluster model" option
6. Secret handling: create inline or reference existing Secret by name
7. Instance list with single-call label-selector discovery
8. Instance delete with partial failure reporting
9. Frontend K8s API client (`k8sApi.ts`, `resources.ts`, `instanceApi.ts`)
10. hermes-sandbox Containerfile (UBI9 + pinned Hermes Agent + WebUI versions)
11. Helm chart: manager deployment + ConfigMap for instance defaults
12. plugin.yaml

### Phase 2 — Auth, Security & Updates
1. OAuth Proxy sidecar in instance pods (default on)
2. NetworkPolicy per instance
3. Instance status polling in UI (watch API or polling)
4. Instance update (PATCH) — change model config or upgrade image without recreating

### Phase 3 — OpenShell Integration
1. Research OpenShell policy surface: validate domain-level egress allowlisting, filesystem restrictions
2. OpenShell supervisor sidecar
3. Policy ConfigMap per instance (filesystem, network, process rules)

### Phase 4 — Polish & Submission
1. Agent type registry in frontend config
2. RHOAI Model Serving integration (InferenceService discovery)
3. CI workflows (lint, test, helm validate, image build+push)
4. docs/README.md with screenshots + install guide
5. PR to charter repo's plugins.yaml

## Verification

1. `helm template chart/ | oc apply --dry-run=client -f -` — validates chart
2. `helm install hermes-deployer chart/` — deploys manager
3. Open RHAIE dashboard → click "Hermes Agent Deployer" in sidebar
4. Create an instance → verify pod Running, Route accessible
5. Access Hermes WebUI via Route → configure model → send a prompt
6. Create 2 more instances in different namespaces → verify independence
7. Delete an instance → verify all resources cleaned up, partial failures reported
8. `helm uninstall hermes-deployer` → verify instances survive (by design)
