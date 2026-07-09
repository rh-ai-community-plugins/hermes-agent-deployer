# NVIDIA OpenShell Research Findings

Date: 2026-06-29
Status: OpenShell is **alpha** (v0.0.47+), Apache 2.0 licensed. Kubernetes path is **experimental**.

---

## 1. What OpenShell Is

- Open-source, agent-first runtime for sandboxed execution of autonomous AI agents
- Announced at GTC 2026, built primarily in Rust
- Provides out-of-process policy enforcement -- policies live outside the agent's reach
- Supports four compute drivers: Docker, Podman, MicroVM, **Kubernetes**

### Architecture (Kubernetes mode)

```
CLI --> Gateway (StatefulSet/Deployment)
            |
            +--> creates Sandbox CRD (agents.x-k8s.io)
                      |
                      +--> Agent Sandbox Controller (k8s-sigs)
                                |
                                +--> schedules Pod with:
                                       - Agent container (user image)
                                       - Supervisor binary (injected via init-container or ImageVolume)
```

**Key components:**
- **Gateway**: control plane that manages sandbox lifecycle, PKI, auth (OIDC/mTLS), and policy distribution. Runs as StatefulSet (SQLite) or Deployment (external PostgreSQL)
- **Supervisor**: injected into each sandbox pod. Launches the agent process, applies policy, routes egress through proxy, injects credentials. Written in Rust
- **Agent Sandbox Controller**: upstream Kubernetes SIG project (`kubernetes-sigs/agent-sandbox`). Reconciles `Sandbox` CRDs into pods
- **CONNECT proxy**: runs on loopback inside each sandbox, intercepts all outbound traffic for L7 inspection and policy enforcement

### Defense in depth (kernel-level):
- Network namespaces -- traffic isolation
- Landlock LSM -- mandatory filesystem access control
- Seccomp BPF -- syscall filtering
- Privilege separation -- agent runs as non-root `sandbox` user

---

## 2. Helm Chart Structure

**Chart location**: `oci://ghcr.io/nvidia/openshell/helm-chart`
**Source**: `deploy/helm/openshell/` in the NVIDIA/OpenShell repo

### Prerequisite CRD

Must install the Agent Sandbox controller first:
```bash
kubectl apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/latest/download/manifest.yaml
```
This creates:
- `agent-sandbox-system` namespace
- `sandboxes.agents.x-k8s.io` CRD (supports v1alpha1 and v1beta1)
- Controller deployment

### Resources created by the Helm chart

| Resource | Purpose |
|----------|---------|
| StatefulSet or Deployment | Gateway workload |
| Service (ClusterIP) | gRPC/HTTP (8080), health (8081), metrics (9090) |
| ServiceAccount `openshell` | Gateway identity |
| ServiceAccount `openshell-sandbox` | Sandbox pod identity |
| Role + RoleBinding | Namespace-scoped: Sandbox CRUD, event/pod reads |
| ClusterRole + ClusterRoleBinding | `tokenreviews` create, `nodes` read |
| NetworkPolicy | Restricts SSH ingress on sandbox pods to gateway only |
| Secrets (via pre-install hook Job) | mTLS certs + JWT signing key |
| PVC (StatefulSet mode) | SQLite database storage |

### No custom CRDs defined by the chart itself
OpenShell does **not** define its own CRDs. It uses the upstream `sandboxes.agents.x-k8s.io` CRD from kubernetes-sigs/agent-sandbox.

### Sandbox CRD structure (upstream)

```yaml
apiVersion: agents.x-k8s.io/v1beta1
kind: Sandbox
metadata:
  name: my-sandbox
spec:
  podTemplate:
    spec:
      containers:
      - name: my-container
        image: <IMAGE>
  # Also supports: volumeClaimTemplates, runtimeClassName
```

Extension CRDs from the upstream project:
- **SandboxTemplate** -- reusable templates
- **SandboxClaim** -- request environments from templates
- **SandboxWarmPool** -- pre-warmed pod pools for fast startup

---

## 3. Integration Pattern

### How OpenShell works -- NOT a sidecar injection model

**Critical finding**: OpenShell does NOT work as a sidecar you add to an existing pod. The architecture is:

1. You tell the OpenShell gateway to create a sandbox
2. The gateway creates a `Sandbox` CRD
3. The Agent Sandbox controller creates a **new pod** from scratch
4. The supervisor binary is injected into that pod (not your existing pod)
5. Your agent runs inside that new pod, governed by the supervisor

This means **you cannot simply add an OpenShell sidecar to our existing Hermes sandbox pod**. Instead, OpenShell would replace our pod management entirely -- Hermes would run inside an OpenShell-managed sandbox pod.

### Supervisor binary injection methods

Controlled by `supervisor.sideloadMethod`:

| Method | K8s Version | How it works |
|--------|-------------|-------------|
| `image-volume` | 1.33+ (GA in 1.36) | Mounts supervisor OCI image as a volume |
| `init-container` | Any | Init container copies binary via emptyDir |

Auto-detected when left empty.

### What this means for hermes-agent-deployer

Two possible integration approaches:

**Option A: OpenShell as the sandbox runtime (replace our pod management)**
- Configure OpenShell gateway to use our Hermes sandbox image as `server.sandboxImage`
- Let OpenShell create and manage sandbox pods
- Hermes Agent runs inside OpenShell-managed pods with full policy enforcement
- We lose direct control over pod spec but gain all OpenShell security features

**Option B: Adopt OpenShell's security primitives directly (without OpenShell)**
- Apply Landlock, seccomp, and network namespace isolation ourselves
- More control, but we reimplement what OpenShell provides
- No dependency on OpenShell gateway infrastructure

---

## 4. Policy System

### Policy YAML structure

```yaml
version: 1

# STATIC (locked at creation, requires sandbox recreation to change)
filesystem_policy:
  include_workdir: true
  read_only:
    - /usr
    - /lib
    - /etc
  read_write:
    - /sandbox
    - /tmp

landlock:
  compatibility: best_effort  # or hard_requirement

process:
  run_as_user: sandbox   # cannot be root/0
  run_as_group: sandbox   # cannot be root/0

# DYNAMIC (hot-reloadable on running sandboxes)
network_policies:
  <rule_name>:
    name: <display_name>
    endpoints:
      - host: <hostname>
        port: <int>
        protocol: rest|websocket|graphql|mcp|json-rpc  # omit for TCP passthrough
        enforcement: enforce|audit
        access: read-only|read-write|full  # or use rules/deny_rules
        rules:
          - allow:
              method: GET
              path: "/**"
        deny_rules:
          - method: POST
            path: "/admin/**"
    binaries:
      - path: /usr/bin/node
```

### Filesystem policy
- Paths not listed are **inaccessible**
- Baseline auto-adds: `/usr`, `/lib`, `/etc`, `/var/log` (read-only) and `/sandbox`, `/tmp` (read-write)
- Max 256 paths, each max 4096 chars
- Enforced by Landlock LSM at kernel level

### Network policy
- Default-deny: all outbound blocked unless explicitly allowed
- Per-binary: different executables can have different network access
- L7 inspection: proxy terminates TLS, inspects HTTP methods/paths/GraphQL operations
- Protocols: REST, WebSocket, GraphQL, MCP, JSON-RPC, raw TCP passthrough
- Hot-reloadable without sandbox restart

### Process policy
- Sets user/group identity (cannot be root)
- Seccomp BPF blocks dangerous syscalls
- No explicit `capabilities` or `seccomp` fields in the user-facing policy -- these are managed internally by the supervisor

### Example policy for Hermes Agent with web browsing

```yaml
version: 1

filesystem_policy:
  include_workdir: true
  read_only:
    - /usr
    - /lib
    - /lib64
    - /etc
    - /proc
    - /dev/urandom
    - /opt/google/chrome    # Chromium binary
  read_write:
    - /sandbox
    - /tmp
    - /dev/shm              # Required by Chromium
    - /dev/null

landlock:
  compatibility: best_effort

process:
  run_as_user: sandbox
  run_as_group: sandbox

network_policies:
  web_browsing:
    name: web-browsing
    endpoints:
      - host: "*.com"
        port: 443
      - host: "*.org"
        port: 443
      - host: "*.io"
        port: 443
      - host: "*.net"
        port: 443
    binaries:
      - path: /usr/bin/chromium
      - path: /usr/bin/chromium-browser
      - path: /usr/bin/google-chrome
      - path: /usr/bin/node        # Playwright
      - path: /usr/bin/npx

  hermes_api:
    name: hermes-llm-api
    endpoints:
      - host: api.openai.com
        port: 443
        protocol: rest
        access: full
      - host: "*.openai.azure.com"
        port: 443
        protocol: rest
        access: full
    binaries:
      - path: /usr/bin/python3
      - path: /usr/local/bin/python

  # Block everything else by default (implicit)
```

**Note**: This example uses broad wildcard hosts for browsing. In practice, you'd narrow these based on the agent's actual needs. The per-binary restriction ensures only Chromium/Playwright can reach arbitrary web hosts.

---

## 5. OpenShift Compatibility

### Current status: REQUIRES PRIVILEGED SCC

The OpenShift path is explicitly **experimental** and recommended only for "evaluation on a private network."

### What sandbox pods require (and why it conflicts)

| Requirement | Why needed | OpenShift restricted-v2 |
|-------------|-----------|------------------------|
| `CAP_SYS_ADMIN` | Network namespace creation | Dropped |
| `CAP_NET_ADMIN` | veth pair setup, iptables | Dropped |
| `CAP_SYS_PTRACE` | /proc/<pid>/exe resolution | Dropped |
| `CAP_SYSLOG` | dmesg bypass monitoring | Dropped |
| `runAsUser: 0` (root) | Privilege dropping, Landlock, supervisor sideloading | Blocked (`runAsNonRoot: true`) |
| hostPath volumes | Supervisor binary delivery | Blocked |

### Current workaround

```bash
oc create ns openshell
oc adm policy add-scc-to-user privileged -z openshell-sandbox -n openshell

helm install openshell oci://ghcr.io/nvidia/openshell/helm-chart \
  -n openshell \
  --set pkiInitJob.enabled=false \
  --set server.disableTls=true \
  --set podSecurityContext.fsGroup=null \
  --set securityContext.runAsUser=null
```

### Helm value overrides for OpenShift

| Override | Purpose |
|----------|---------|
| `pkiInitJob.enabled=false` | PKI Job incompatible with OpenShift |
| `server.disableTls=true` | No certs without PKI job |
| `podSecurityContext.fsGroup=null` | Let OpenShift SCC assign fsGroup |
| `securityContext.runAsUser=null` | Let OpenShift SCC assign UID |

### Known limitations on OpenShift
- **Privileged SCC required** -- non-negotiable currently
- **No TLS by default** -- plaintext HTTP unless you manually provide certs
- **JWT secret must be pre-created** when `pkiInitJob.enabled=false`
- **Private network only** -- no external exposure without additional TLS

### Future: Platform mode (GitHub Issue #899)

A design proposal (not yet implemented, no timeline) for a `Platform` network mode that would:
- Skip network namespace creation (no `CAP_SYS_ADMIN`/`CAP_NET_ADMIN`)
- Delegate L3/L4 to Kubernetes NetworkPolicy
- Keep L7 proxy on loopback for inspection
- Use `shareProcessNamespace: true` instead of `CAP_SYS_PTRACE`
- Run as non-root with Landlock `best_effort`

**Status**: Open issue, no assignees, no PRs, no timeline. Estimated 12-15 files to change.

---

## 6. Deployment Requirements

### Cluster-wide vs namespace-scoped

**Mixed**: requires both namespace-scoped and cluster-scoped resources.

**Cluster-scoped (requires cluster-admin):**
- Agent Sandbox CRD installation (`sandboxes.agents.x-k8s.io`)
- Agent Sandbox controller in `agent-sandbox-system` namespace
- ClusterRole + ClusterRoleBinding for `tokenreviews` and node reads
- On OpenShift: privileged SCC grant

**Namespace-scoped:**
- Gateway StatefulSet/Deployment
- ServiceAccounts, Roles, RoleBindings
- Sandbox pods (can be in same or different namespace via `server.sandboxNamespace`)

### RBAC summary

**Gateway ServiceAccount needs:**

| Scope | API Group | Resource | Verbs |
|-------|-----------|----------|-------|
| Namespace | `agents.x-k8s.io` | `sandboxes`, `sandboxes/status` | create, delete, get, list, patch, update, watch |
| Namespace | core | `events` | get, list, watch |
| Namespace | core | `pods` | get |
| Cluster | `authentication.k8s.io` | `tokenreviews` | create |
| Cluster | core | `nodes` | get, list, watch |

### Infrastructure requirements
- Kubernetes 1.29+ with RBAC enabled
- Helm 3.x
- Agent Sandbox controller (upstream k8s-sigs project)
- Optional: cert-manager for TLS management
- Optional: external PostgreSQL for multi-replica gateways
- Optional: NVIDIA Container Toolkit for GPU passthrough

---

## 7. Key Takeaways for hermes-agent-deployer Phase 3

### Blockers
1. **OpenShift requires privileged SCC** -- this is a hard blocker for enterprise adoption. Platform mode (Issue #899) is the planned fix but has no timeline
2. **Not a sidecar model** -- cannot simply inject OpenShell into existing pods. Would need to restructure how Hermes pods are created
3. **Agent Sandbox controller needs cluster-admin** -- adds an installation prerequisite beyond our plugin

### Risks
- OpenShell K8s path is experimental with expected breaking changes
- Agent Sandbox CRD is from a Kubernetes SIG project (upstream dependency)
- No concrete timeline for restricted-SCC support

### Opportunities
- Policy system is well-designed and declarative (YAML)
- Per-binary network policies are powerful for Hermes + Chromium isolation
- Hot-reloadable network policies enable runtime adjustment
- Supervisor injection is clean (init-container or ImageVolume)
- If Platform mode lands, it becomes viable for OpenShift without privileged SCC

### Recommendation

Wait for Platform mode (Issue #899) before committing to OpenShell for Phase 3. In the interim:
- Track the issue
- Design our Helm chart so the sandbox image is compatible with OpenShell (standard container, non-root user, workspace at /sandbox)
- Consider implementing basic NetworkPolicy-based isolation ourselves as a stepping stone
- Revisit when OpenShell reaches beta and supports restricted SCCs

---

## Sources

- [NVIDIA/OpenShell GitHub](https://github.com/NVIDIA/OpenShell)
- [OpenShell Helm Chart README](https://github.com/NVIDIA/OpenShell/blob/main/deploy/helm/openshell/README.md)
- [OpenShell Kubernetes Setup](https://docs.nvidia.com/openshell/kubernetes/setup)
- [OpenShell OpenShift Docs](https://docs.nvidia.com/openshell/kubernetes/openshift)
- [Sandbox Compute Drivers](https://docs.nvidia.com/openshell/reference/sandbox-compute-drivers)
- [Policy Schema Reference](https://docs.nvidia.com/openshell/reference/policy-schema)
- [Customize Sandbox Policies](https://docs.nvidia.com/openshell/sandboxes/policies)
- [Manage Sandboxes](https://docs.nvidia.com/openshell/sandboxes/manage-sandboxes)
- [GitHub Issue #899: Restricted SCC Support](https://github.com/NVIDIA/OpenShell/issues/899)
- [kubernetes-sigs/agent-sandbox](https://github.com/kubernetes-sigs/agent-sandbox)
- [Agent Sandbox Overview](https://agent-sandbox.sigs.k8s.io/docs/getting_started/overview/)
- [NVIDIA OpenShell Blog](https://developer.nvidia.com/blog/run-autonomous-self-evolving-agents-more-safely-with-nvidia-openshell/)
