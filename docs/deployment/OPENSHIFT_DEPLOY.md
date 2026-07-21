# OpenShift Deployment

## Prerequisites

- OpenShift 4.14+ with RHOAI 3.4+ installed
- Helm 3.10+
- `oc` CLI logged in with access to `redhat-ods-applications` namespace (to register the plugin) and a target namespace for the plugin deployment
- python3 (used by the registration script)

## Install

### From Local Checkout

```bash
helm install hermes-deployer chart/ \
  --namespace hermes-deployer \
  --create-namespace
```

### Dry Run

```bash
helm template hermes-deployer chart/ | oc apply --dry-run=client -f -
```

## Dashboard Registration

Register the plugin with the RHOAI dashboard using the included script:

```bash
./scripts/register-plugin.sh register
```

The script is idempotent — running it again is safe. It automatically:
- Checks if the plugin is already registered (skips if so)
- Backs up the current config to `/tmp/` before changes
- Prints a restore command in case you need to rollback

Dashboard pods restart automatically. Allow ~2 minutes for the rollout.

To check registration status or unregister:

```bash
./scripts/register-plugin.sh status
./scripts/register-plugin.sh unregister
```

If the plugin is deployed to a namespace other than `hermes-deployer`:

```bash
PLUGIN_NS=my-namespace ./scripts/register-plugin.sh register
```

## Verify

```bash
# Check plugin pods are running
oc get pods -n hermes-deployer

# Check dashboard registration
./scripts/register-plugin.sh status

# Check remoteEntry.js is reachable from the dashboard
oc exec -n redhat-ods-applications deploy/rhods-dashboard -c rhods-dashboard \
  -- curl -s -o /dev/null -w "%{http_code}" \
  http://hermes-agent-deployer.hermes-deployer.svc:8080/remoteEntry.js
```

## Configuration

### Helm Values

| Key | Default | Description |
|-----|---------|-------------|
| `image.repository` | `quay.io/rh-ai-community-plugins/hermes-agent-deployer` | Frontend image |
| `bff.enabled` | `true` | Deploy BFF service |
| `bff.image.repository` | `quay.io/rh-ai-community-plugins/hermes-agent-deployer-bff` | BFF image |
| `instanceDefaults.hermesImage` | `quay.io/rh-ai-community-plugins/hermes-sandbox:0.1.0` | Agent runtime image |
| `instanceDefaults.oauthProxy.enabled` | `true` | OAuth sidecar on new instances |
| `instanceDefaults.pvc.size` | `1Gi` | PVC size per instance |

### Disabling the BFF

```bash
helm install hermes-deployer chart/ --set bff.enabled=false
```

Without the BFF, instance listing falls back to client-side N+1 namespace scanning.

## User Permissions

The plugin creates K8s resources using the logged-in user's token (via the dashboard proxy). Users who want to deploy Hermes instances need the following permissions in their target namespace:

| Resource | API Group | Verbs |
|----------|-----------|-------|
| Deployments | `apps` | create, delete, get, list, patch |
| Services | `""` (core) | create, delete, get |
| Routes | `route.openshift.io` | create, delete, get |
| Secrets | `""` (core) | create, delete |
| PersistentVolumeClaims | `""` (core) | create, delete |
| ServiceAccounts | `""` (core) | create, delete, get |

The BFF service (instance listing) also uses the user's token — it does not require its own ClusterRole.

A user with namespace `admin` or `edit` roles has these permissions by default.

## Verify Sandbox Image

Before users can deploy instances, the `hermes-sandbox` image must be pullable from the cluster:

```bash
oc run sandbox-pull-test --rm -it --restart=Never \
  --image=quay.io/rh-ai-community-plugins/hermes-sandbox:0.1.0 \
  -- echo "Image pull OK"
```

If this fails with `ImagePullBackOff` or `ErrImagePull`, instance creation will fail silently (pods stuck in pending). Verify the image exists and the cluster can reach the registry.

## Uninstall

```bash
./scripts/register-plugin.sh unregister
helm uninstall hermes-deployer -n hermes-deployer
```

## Troubleshooting

### Plugin doesn't appear in the dashboard sidebar

1. **Check registration**: `./scripts/register-plugin.sh status`
2. **Check dashboard pods restarted**: `oc get pods -n redhat-ods-applications -l app=rhods-dashboard` — all pods should show a recent `AGE`
3. **Check frontend pod is running**: `oc get pods -n hermes-deployer`
4. **Check remoteEntry.js is served**: `oc exec -n redhat-ods-applications deploy/rhods-dashboard -c rhods-dashboard -- curl -s http://hermes-agent-deployer.hermes-deployer.svc:8080/remoteEntry.js | head -c 100`
5. **Hard refresh** the dashboard (Ctrl+Shift+R) — the browser may cache the old Module Federation manifest

### Instance creation fails

1. **Check user permissions**: the logged-in user needs `admin` or `edit` role in the target namespace
2. **Check sandbox image**: run the pull test above
3. **Check resource quota**: `oc describe resourcequota -n <namespace>` — the namespace may not have enough CPU/memory quota
4. **Check events**: `oc get events -n <namespace> --sort-by=.lastTimestamp | tail -20`

### BFF returns empty instance list

1. **Check BFF pod**: `oc logs -n hermes-deployer deploy/hermes-agent-deployer-bff`
2. **Check BFF health**: `oc exec -n redhat-ods-applications deploy/rhods-dashboard -c rhods-dashboard -- curl -s http://hermes-agent-deployer-bff.hermes-deployer.svc:3000/api/health`
3. **Check proxy config**: the `proxyService` entry in MODULE_FEDERATION_CONFIG must have `path: /hermes-agent-deployer/api` and `pathRewrite: /api`

### Dashboard crashes after registration

Restore from the backup printed during registration:

```bash
oc set env deployment/rhods-dashboard -n redhat-ods-applications \
  "MODULE_FEDERATION_CONFIG=$(cat /tmp/mf-config-backup-<timestamp>.json)"
```
