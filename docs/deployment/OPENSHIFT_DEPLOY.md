# OpenShift Deployment

## Prerequisites

- OpenShift 4.14+ with RHOAI 3.4+ installed
- Helm 3.10+
- `oc` CLI with cluster-admin access

## Install

### From OCI Registry

```bash
helm install hermes-deployer oci://quay.io/rh-ai-community-plugins/hermes-agent-deployer-chart \
  --version 0.1.0 \
  --namespace hermes-deployer \
  --create-namespace
```

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

Register the plugin with the RHOAI dashboard's Module Federation config:

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

Dashboard pods restart automatically. Allow ~2 minutes for the rollout.

## Verify

```bash
# Check plugin pods
oc get pods -n hermes-deployer

# Check dashboard registration
oc set env deployment/rhods-dashboard -n redhat-ods-applications --list \
  | grep MODULE_FEDERATION_CONFIG \
  | python3 -c "import json,sys; d=json.loads(sys.stdin.read().split('=',1)[1]); print([e['name'] for e in d])"
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

## Uninstall

```bash
helm uninstall hermes-deployer -n hermes-deployer
```

Remove the plugin from the dashboard registration by editing the MODULE_FEDERATION_CONFIG env var to remove the `hermesAgentDeployer` entry.
