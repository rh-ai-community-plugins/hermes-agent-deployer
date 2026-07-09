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
│       └── Containerfile          # UBI9 + Hermes Agent + WebUI + Chromium/Playwright, port 8080
├── package.json
└── tsconfig.json
```

## Container Images

| Image | Base | Contents | Port |
|-------|------|----------|------|
| `quay.io/rh-ai-community-plugins/hermes-agent-deployer:0.1.0` | UBI9 nginx | Manager frontend (React + PatternFly bundle) | 8080 |
| `quay.io/rh-ai-community-plugins/hermes-sandbox:0.1.0` | UBI9 Python 3.11 | Hermes Agent + WebUI + Chromium/Playwright | 8080 |

**hermes-sandbox image build:**
1. Base: `registry.access.redhat.com/ubi9/python-311`
2. Install system deps: `git`, `nodejs`, `npm`, plus Chromium deps (`nss`, `atk`, `cups-libs`, `libdrm`, `libXcomposite`, `libXdamage`, `libXrandr`, `mesa-libgbm`, `pango`, `alsa-lib`, `liberation-fonts`)
3. Install `hermes-agent`, `playwright`, and `hermes-webui` with pinned versions
4. Install Playwright's Chromium browser to `/opt/playwright-browsers` (shared, read-only at runtime)
5. Set `HERMES_WEBUI_PORT=8080`, `HERMES_WEBUI_HOST=0.0.0.0`, `PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers`
6. Create `/home/hermes/.hermes` owned by root group (GID 0) with `g=u` permissions — supports OpenShift arbitrary UID assignment (restricted SCC assigns a random UID from the namespace range, always with GID 0)
7. `USER 1001` as fallback — OpenShift overrides this via restricted SCC, but it provides a sensible default for non-OpenShift environments
8. Entrypoint: start Hermes WebUI (runs agent in-process)

**Browser support:** The image includes Chromium and Playwright so the Hermes agent can browse the web, take screenshots, and run browser automation. Chromium runs headless. On OpenShift, the kernel sandbox is disabled (`--no-sandbox`) because the pod's restricted SCC already provides container-level isolation — standard practice for containerized browsers. OpenShell (Phase 3) adds network egress policy to control which sites the agent can reach.

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

## Implementation Status

### Phase 1 — MVP

| Item | Status |
|------|--------|
| Scaffold repo structure (React + PatternFly + Webpack Module Federation) | Done |
| Frontend: Module Federation setup + RHOAI extensions | Done |
| Deployer page with project selection | Done |
| Create form: model config fields (URL, API key, model name) | Done |
| Greyed-out "Pick a cluster model" option | Not done — never added to UI |
| Secret handling: create inline or reference existing Secret by name | Done |
| Instance list with single-call label-selector discovery | Done |
| Instance delete with partial failure reporting | Done |
| Frontend K8s API client (`k8sApi.ts`, `resources.ts`, `instanceApi.ts`) | Done |
| hermes-sandbox Containerfile (UBI9 + Hermes Agent + WebUI + Chromium/Playwright) | Done |
| Helm chart: manager deployment | Done |
| Helm chart: ConfigMap for instance defaults (admin-tunable via `helm upgrade`) | Done |
| plugin.yaml | Done |
| Switch to `@module-federation/enhanced` (ChunkLoadError fix — see `issue.md`) | Done, verified on cluster |

### Phase 2 — Production Ready

| Item | Status |
|------|--------|
| OAuth proxy sidecar: `buildDeployment()`, `buildService()`, `buildRoute()`, `buildServiceAccount()` (48cb935) | Done, deployed |
| Hermes env vars: OPENAI_API_KEY, OPENAI_BASE_URL, HERMES_INFERENCE_MODEL (48cb935) | Done, deployed |
| TLS secret cleanup on delete (48cb935) | Done |
| Cookie secret generation via Web Crypto API | Done |
| UI toggle for OAuth proxy enable/disable | Done |
| Helm values: instance defaults for hermes image, oauth-proxy image, PVC size, resources | Done |
| ConfigMap for instance defaults (admin-tunable) | Done |
| Cluster test: full create/delete/access flow with real OAuth gateway | Stale — cluster-57jwj likely decommissioned; needs fresh cluster |

## Parallel Lanes

### Completed lanes

- **Lane 2 (hermes-sandbox image)** — Containerfile + entrypoint built, Chromium/Playwright included, pushed to quay.io
- **Lane 3 (OAuth Proxy sidecar)** — implemented in 48cb935, deployed and tested
- **Lane 5 (OpenShell research)** — findings in `research/openshell-findings.md`. Key finding: OpenShell requires privileged SCC (blocker); recommendation is NetworkPolicy as stepping stone

### Active lanes

```
Lane 1: Testing & CI ─────────────────────────────────────────────┐
  Status: Not started — zero test files, no .github/ directory     │
  Jest unit tests for resources.ts, instanceApi.ts, components     │
  GitHub Actions: lint, test, helm validate, image build+push      │
  Playwright E2E against dev server                                │
                                                                   │
Lane 4: NetworkPolicy + instance update ──────────────────────────┘
  Status: Not started
  buildNetworkPolicy() in resources.ts — new resource type
  Add to create/delete lifecycle in instanceApi.ts
  PATCH support in instanceApi.ts for Secret + Deployment
  UI: edit modal or inline update for model config changes
```

### Serial dependencies

```
Fresh cluster test ──→ screenshots ──→ docs + install guide
                                              │
                                              └──→ PR to charter repo's plugins.yaml
```

- **Fresh cluster test** gates screenshots and docs — needs RHOAI 3.4+ cluster access. OAuth and sandbox image are ready; just needs a cluster.
- **Model Serving discovery** (InferenceService endpoints) — independent, needs running RHOAI with served models
- **Charter submission** — gates on verified cluster test + docs

### Recently completed (were in backlog)

| Item | Evidence |
|------|----------|
| Instance status polling | 10s `setInterval` in `HermesDeployerPage.tsx:55` |
| Agent type registry | `AgentType` interface, `listAgentTypes()`, dropdown in create modal |

### Backlog

#### Architecture changes

| Item | Status | Notes |
|------|--------|-------|
| **Replace direct K8s API with operator** | Decision pending — awaiting Guillaume's review | The frontend currently builds 6+ K8s manifests in TypeScript (`resources.ts`) and applies them via the dashboard K8s API proxy. This is brittle. Two options below. Helm chart for instances lives in repo either way. |

**Decision: Instance deploy mechanism** (reviewer: @guimou)

Option A — **Helm-based Operator (recommended)**
- Write a `HermesInstance` CRD. UI creates/updates/deletes one CR. An operator reconciles it into all resources (Deployment, Service, Route, PVC, Secret).
- Operator SDK Helm mode: the Helm chart IS the reconciliation logic. CR values become Helm values. No Go/Python code needed.
- Status reported via CR `.status` — UI reads one object instead of polling multiple resources.
- Cleanup via ownerReferences (cascade delete). Retries and drift reconciliation built in.
- Trade-off: CRD needs cluster-admin to install. Operator is a second container to deploy.
- This is the idiomatic RHOAI/OpenShift pattern (Model Serving, pipelines, etc. all work this way).

Option B — **Backend service + Helm CLI**
- Add a small API server to the manager pod. UI sends params, backend runs `helm install/upgrade/uninstall`.
- User's bearer token forwarded from dashboard session, backend constructs kubeconfig per request.
- Simpler to build initially. No CRD, no cluster-admin for install.
- Trade-off: no drift reconciliation, no automatic retry. Helm binary adds ~50MB to image. Custom auth plumbing needed.
| **Sandboxing: NetworkPolicy + hardening** | Not started | Phase 3 stepping stone. Default-deny egress NetworkPolicy with explicit allowlists for LLM API endpoints. Add seccomp profiles + read-only root filesystem to Hermes pods. No new cluster deps. |
| **Sandboxing: Kata Containers opt-in** | Not started | Add `runtimeClassName` as a Helm value so users with OpenShift Sandboxed Containers operator can opt into VM-level isolation per instance. Low effort, high value. |
| **Sandboxing: OpenShell** | Blocked | Privileged SCC still required (v0.0.79, Jul 2026). Issue #899 (Platform mode) and #981 (split-pod/gVisor) both open, no progress. Red Hat partnership announced at GTC 2026 but pre-product, no timeline. Revisit when either issue gets a PR. |

#### Features

| Item | Status | Blocked by |
|------|--------|------------|
| Display name for instances | Partial — `displayName` exists on `AgentType` but not as user-entered instance name (annotation-backed) | Nothing |
| Project dropdown at top of page | Not started — namespace selection only in create modal, no NamespaceBar | Nothing |
| Greyed-out "Pick a cluster model" UI | Not started — planned in Phase 1 but never implemented | Nothing |
| Fix browser deps in hermes-sandbox | Unknown — needs container runtime test | Nothing |
| RHOAI Model Serving integration | Not started | Cluster with served models |
| Nav: "Community Plugins" section with icon | Blocked | RHOAI 3.5+ (3.4 drops `app.navigation/section` from external MF plugins) |
| docs/README with screenshots | Blocked | Fresh cluster test |
| Cluster test (Phase 2 verification) | Stale | Fresh RHOAI 3.4+ cluster |
| PR to charter repo's plugins.yaml | Blocked | All of the above |

## Verification

1. `helm template chart/ | oc apply --dry-run=client -f -` — validates chart
2. `helm install hermes-deployer chart/` — deploys manager
3. Open RHAIE dashboard → click "Hermes Agent Deployer" in sidebar
4. Create an instance → verify pod Running, Route accessible
5. Access Hermes WebUI via Route → configure model → send a prompt
5b. Verify browser capability: `podman exec <container> python -c "from playwright.sync_api import sync_playwright; b=sync_playwright().start().chromium.launch(headless=True); b.close(); print('OK')"` 
6. Create 2 more instances in different namespaces → verify independence
7. Delete an instance → verify all resources cleaned up, partial failures reported
8. `helm uninstall hermes-deployer` → verify instances survive (by design)
