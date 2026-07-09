# Refactor: Hermes Agent Deployer → OpenShell Agent Deployer

## Goal

Generalize the plugin so it can deploy **any** agent wrapped in OpenShell — Hermes, Pi Agent, OpenClaw, OpenCode, Claude Code, etc. — from a single codebase. Each agent type is a configuration entry, not a code path.

## Core Concept

The deployer becomes a generic "OpenShell Agent Deployer" that:
1. Reads a **registry of agent types** from config (Helm values → ConfigMap → `/config.json`)
2. Each agent type declares its own image, env vars, mount paths, ports, container name
3. The resource builders and CRUD operations consume that per-type config instead of hardcoding Hermes values

---

## Agent Type Registry

Extend `AgentType` to carry everything the resource builders need:

```typescript
export interface AgentType {
  name: string;                    // 'hermes' | 'pi-agent' | 'openclaw' | ...
  displayName: string;             // 'Hermes Agent (Nous Research)'
  description: string;
  image: string;                   // container image for this agent
  containerName: string;           // k8s container name (default: `${name}-agent`)
  port: number;                    // agent's HTTP port (default: 8080)
  mountPath: string;               // PVC mount inside container (default: '/home/agent')
  env: AgentEnvVar[];              // agent-specific env vars injected into the container
  secretEnv: AgentSecretEnvVar[];  // env vars that go into the K8s Secret
  healthPath: string;              // readiness/liveness probe path (default: '/')
}

interface AgentEnvVar {
  name: string;   // e.g. 'HERMES_WEBUI_PORT'
  value: string;  // e.g. '8080'
}

interface AgentSecretEnvVar {
  name: string;              // e.g. 'HERMES_INFERENCE_MODEL'
  field: 'modelName' | 'modelUrl' | 'apiKey';  // maps to CreateInstanceRequest field
}
```

Example registry entries:

```yaml
# Helm values.yaml
agentTypes:
  - name: hermes
    displayName: "Hermes Agent (Nous Research)"
    description: "Autonomous AI agent with persistent memory and self-improving skills"
    image: quay.io/rh-ai-community-plugins/hermes-sandbox:0.1.0
    containerName: hermes-sandbox
    port: 8080
    mountPath: /home/hermes
    healthPath: /
    env:
      - name: HERMES_WEBUI_PORT
        value: "8080"
      - name: HERMES_WEBUI_HOST
        value: "0.0.0.0"
    secretEnv:
      - name: OPENAI_API_KEY
        field: apiKey
      - name: OPENAI_BASE_URL
        field: modelUrl
      - name: HERMES_INFERENCE_MODEL
        field: modelName

  - name: open-webui
    displayName: "Open WebUI"
    description: "Self-hosted AI interface with built-in RAG"
    image: ghcr.io/open-webui/open-webui:latest
    containerName: open-webui
    port: 8080
    mountPath: /app/backend/data
    healthPath: /health
    env:
      - name: WEBUI_AUTH
        value: "false"
    secretEnv:
      - name: OPENAI_API_KEY
        field: apiKey
      - name: OPENAI_API_BASE_URL
        field: modelUrl
```

---

## Naming Convention

Current: all resources are `hermes-${instanceName}`

New: `${agentType}-${instanceName}` (e.g. `hermes-mybot`, `pi-agent-mybot`)

This preserves the existing naming for Hermes instances (no migration needed) and naturally namespaces different agent types.

The `managed-by` label stays as `openshell-agent-deployer` (renamed from `hermes-agent-deployer`) so the deployer can find all its instances regardless of agent type.

---

## Changes By File

### 1. Rename repo & plugin identity (Low effort)

| What | From | To |
|------|------|----|
| Repo name | `hermes-agent-deployer` | `openshell-agent-deployer` |
| MF name | `hermesAgentDeployer` | `openshellAgentDeployer` |
| Nav title | "Hermes Agent Deployer" | "Agent Deployer" |
| Route path | `/hermes-agent-deployer` | `/agent-deployer` |
| Nav icon | "HA" red square | "AD" or a generic robot icon |
| Annotation prefix | `hermes-agent-deployer/` | `openshell-agent-deployer/` |
| Label managed-by | `hermes-agent-deployer` | `openshell-agent-deployer` |

Files: `extensions.ts`, `utilities.ts`, `App.tsx`, `HermesNavIcon.tsx` → `AgentNavIcon.tsx`, `HermesDeployerPage.tsx` → `AgentDeployerPage.tsx`, `webpack.config.ts`, `package.json`

### 2. `types.ts` (Low effort)

- Rename `HermesInstance` → `AgentInstance`
- Extend `AgentType` with container config fields (see registry section above)
- Add `AgentEnvVar` and `AgentSecretEnvVar` interfaces

### 3. `config.ts` (Low effort)

- Remove `hermesImage` field from `InstanceDefaults` (images now live on agent types)
- Add `agentTypes: AgentType[]` to `InstanceDefaults`
- Fallback defaults include the Hermes entry so it works without Helm config

```typescript
export interface InstanceDefaults {
  agentTypes: AgentType[];    // NEW: the registry
  oauthProxy: { enabled: boolean; image: string };
  pvc: { size: string };
  resources: { requests: {...}; limits: {...} };
}
```

### 4. `resources.ts` (High effort — core of the refactor)

All resource builders gain an `agentType: AgentType` parameter. Replace every hardcoded value:

| Hardcoded | Replaced by |
|-----------|-------------|
| `'hermes-instance'` label | `'agent-instance'` |
| `'hermes-agent-deployer'` managed-by | `'openshell-agent-deployer'` |
| `hermes-${name}` prefix | `${agentType.name}-${name}` |
| `'hermes-sandbox'` container name | `agentType.containerName` |
| `defaults.hermesImage` | `agentType.image` |
| `HERMES_WEBUI_PORT/HOST` env | `agentType.env` array |
| `HERMES_INFERENCE_MODEL` secret | `agentType.secretEnv` mapping |
| `/home/hermes` mount | `agentType.mountPath` |
| port `8080` | `agentType.port` |
| probe path `/` | `agentType.healthPath` |

The `LABELS()` function becomes:

```typescript
const LABELS = (instanceName: string, agentTypeName: string) => ({
  'app.kubernetes.io/name': 'agent-instance',
  'app.kubernetes.io/instance': instanceName,
  'app.kubernetes.io/managed-by': 'openshell-agent-deployer',
  'openshell-agent-deployer/agent-type': agentTypeName,
});
```

`buildSecret` builds `stringData` dynamically from `agentType.secretEnv`:

```typescript
const stringData: Record<string, string> = {};
for (const e of agentType.secretEnv) {
  stringData[e.name] = req[e.field];
}
```

### 5. `instanceApi.ts` (Medium effort)

- `LABEL_SELECTOR` → `'app.kubernetes.io/managed-by=openshell-agent-deployer'`
- `listAgentTypes()` → reads from `getInstanceDefaults().agentTypes` instead of returning hardcoded array
- `deploymentToInstance()` — name extraction uses `app.kubernetes.io/instance` label (already does), fallback strips `${agentType}-` prefix
- `deleteInstance()` — takes `agentType` string to compute correct resource prefix: `${agentType}-${name}`
- `createInstance()` — looks up the `AgentType` from the registry, passes it to resource builders
- Annotation prefix changes to `openshell-agent-deployer/`

### 6. Helm chart (Low-Medium effort)

**`values.yaml`:**

```yaml
instanceDefaults:
  agentTypes:
    - name: hermes
      displayName: "Hermes Agent (Nous Research)"
      description: "Autonomous AI agent with persistent memory and self-improving skills"
      image: quay.io/rh-ai-community-plugins/hermes-sandbox:0.1.0
      containerName: hermes-sandbox
      port: 8080
      mountPath: /home/hermes
      healthPath: /
      env:
        - name: HERMES_WEBUI_PORT
          value: "8080"
        - name: HERMES_WEBUI_HOST
          value: "0.0.0.0"
      secretEnv:
        - name: OPENAI_API_KEY
          field: apiKey
        - name: OPENAI_BASE_URL
          field: modelUrl
        - name: HERMES_INFERENCE_MODEL
          field: modelName
  oauthProxy:
    enabled: true
    image: registry.redhat.io/openshift4/ose-oauth-proxy-rhel9:v4.17
  pvc:
    size: 1Gi
  resources: ...
```

**`configmap.yaml`:** Serialize `agentTypes` array into `config.json` using `toJson`.

**Helm template names:** Rename helpers from `hermes-agent-deployer.*` to `openshell-agent-deployer.*` in `_helpers.tpl`.

### 7. UI Components (Low-Medium effort)

- **`InstanceCreateModal.tsx`:** No default agent type — user must pick from dropdown. Dropdown already exists and is populated by `listAgentTypes()`, so this just works once the registry is data-driven.
- **`InstanceList.tsx`:** Already has "Agent Type" column — no structural change.
- **`InstanceDetail.tsx`:** No Hermes-specific code — just rename `HermesInstance` → `AgentInstance`.
- **Page title:** "Agent Deployer" (or "OpenShell Agent Deployer")
- **Placeholders:** `"my-hermes-instance"` → `"my-agent-instance"`, `"hermes-3-llama-3.1-8b"` → `"llama-3.1-8b"`

### 8. `Containerfile` & image name (Low effort)

- Rename image: `hermes-agent-deployer` → `openshell-agent-deployer`
- Content unchanged (still nginx serving the webpack bundle)

### 9. CLAUDE.md, package.json, README (Low effort)

- Update all references to new names
- Update architecture section to describe multi-agent model

---

## What NOT to change

- **OpenShell wrapping logic** — the OAuth proxy sidecar, TLS, PVC, ServiceAccount pattern stays identical. This is the OpenShell envelope.
- **K8s API proxy pattern** — still goes through `/api/k8s/` dashboard proxy, no backend.
- **Rollback-on-failure** in `createInstance()` — generic, keep as-is.
- **Module Federation setup** — same pattern, just new names.

---

## Migration Path

1. **Existing Hermes instances on clusters won't be visible** after the label rename (`hermes-agent-deployer` → `openshell-agent-deployer`). Two options:
   - Accept it — this is pre-release, no production instances exist
   - Add a one-time migration that relabels existing deployments (overkill for now)

2. The Hermes agent type remains the first (and default) entry in the registry, so existing Helm installs with no `agentTypes` override get the same behavior.

---

## Execution Order

1. Rename types and interfaces (`types.ts`)
2. Restructure config (`config.ts`, `values.yaml`, `configmap.yaml`)
3. Refactor resource builders (`resources.ts`) — the bulk of the work
4. Update CRUD operations (`instanceApi.ts`)
5. Rename UI components and strings
6. Rename plugin identity (MF name, route, extensions)
7. Update Helm chart templates and helpers
8. Update Containerfile, package.json, CLAUDE.md
9. Test: `npm run build`, `helm template`, verify no "hermes" hardcoding remains outside the Hermes agent type entry
