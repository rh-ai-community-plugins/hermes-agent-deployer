import { CreateInstanceRequest } from '../types';
import { InstanceDefaults } from './config';

function generateCookieSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

const LABELS = (name: string, agentType: string) => ({
  'app.kubernetes.io/name': 'hermes-instance',
  'app.kubernetes.io/instance': name,
  'app.kubernetes.io/managed-by': 'hermes-agent-deployer',
  'hermes-agent-deployer/agent-type': agentType,
});

const ANNOTATIONS = (req: CreateInstanceRequest, defaults: InstanceDefaults) => ({
  'hermes-agent-deployer/display-name': req.displayName,
  'hermes-agent-deployer/model-name': req.modelName,
  'hermes-agent-deployer/model-url': req.modelUrl,
  'hermes-agent-deployer/pvc-size': req.pvcSize,
  'hermes-agent-deployer/oauth-proxy': String(req.oauthProxyEnabled),
  ...(defaults.openshell?.enabled && {
    'hermes-agent-deployer/openshell': 'true',
    'hermes-agent-deployer/openshell-policy': defaults.openshell.networkPolicyTier,
  }),
});

export function buildSecret(req: CreateInstanceRequest) {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: `hermes-${req.name}-credentials`,
      namespace: req.namespace,
      labels: LABELS(req.name, req.agentType),
    },
    type: 'Opaque',
    stringData: {
      OPENAI_API_KEY: req.apiKey,
      OPENAI_BASE_URL: req.modelUrl,
      HERMES_INFERENCE_MODEL: req.modelName,
    },
  };
}

export function buildServiceAccount(req: CreateInstanceRequest) {
  return {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: `hermes-${req.name}`,
      namespace: req.namespace,
      labels: LABELS(req.name, req.agentType),
      ...(req.oauthProxyEnabled && {
        annotations: {
          'serviceaccounts.openshift.io/oauth-redirectreference.primary': JSON.stringify({
            kind: 'OAuthRedirectReference',
            apiVersion: 'v1',
            reference: { kind: 'Route', name: `hermes-${req.name}` },
          }),
        },
      }),
    },
  };
}

export function buildSandbox(req: CreateInstanceRequest, defaults: InstanceDefaults) {
  const containers: Record<string, unknown>[] = [
    {
      name: 'hermes-sandbox',
      image: defaults.hermesImage,
      ports: [{ containerPort: 8080, name: 'http' }],
      env: [
        { name: 'HERMES_WEBUI_PORT', value: '8080' },
        { name: 'HERMES_WEBUI_HOST', value: '0.0.0.0' },
      ],
      envFrom: [
        { secretRef: { name: `hermes-${req.name}-credentials` } },
      ],
      volumeMounts: [
        { name: 'hermes-data', mountPath: '/home/hermes' },
        { name: 'tmp', mountPath: '/tmp' },
        { name: 'dshm', mountPath: '/dev/shm' },
      ],
      resources: defaults.resources,
      securityContext: {
        runAsNonRoot: true,
        allowPrivilegeEscalation: false,
        capabilities: { drop: ['ALL'] },
      },
      readinessProbe: {
        httpGet: { path: '/', port: 8080 },
        initialDelaySeconds: 10,
        periodSeconds: 5,
      },
      livenessProbe: {
        httpGet: { path: '/', port: 8080 },
        initialDelaySeconds: 15,
        periodSeconds: 10,
      },
    },
  ];

  const volumes: Record<string, unknown>[] = [
    { name: 'tmp', emptyDir: {} },
    { name: 'dshm', emptyDir: { medium: 'Memory', sizeLimit: '256Mi' } },
  ];

  if (req.oauthProxyEnabled) {
    containers.push({
      name: 'oauth-proxy',
      image: defaults.oauthProxy.image,
      args: [
        '--https-address=:8443',
        '--provider=openshift',
        `--openshift-service-account=hermes-${req.name}`,
        '--upstream=http://localhost:8080',
        '--tls-cert=/etc/tls/private/tls.crt',
        '--tls-key=/etc/tls/private/tls.key',
        `--cookie-secret=${generateCookieSecret()}`,
      ],
      ports: [{ containerPort: 8443, name: 'oauth-proxy' }],
      volumeMounts: [
        { mountPath: '/etc/tls/private', name: 'proxy-tls', readOnly: true },
      ],
    });
    volumes.push({
      name: 'proxy-tls',
      secret: { secretName: `hermes-${req.name}-tls` },
    });
  }

  return {
    apiVersion: 'agents.x-k8s.io/v1beta1',
    kind: 'Sandbox',
    metadata: {
      name: `hermes-${req.name}`,
      namespace: req.namespace,
      labels: LABELS(req.name, req.agentType),
      annotations: ANNOTATIONS(req, defaults),
    },
    spec: {
      operatingMode: 'Running',
      podTemplate: {
        metadata: {
          labels: LABELS(req.name, req.agentType),
        },
        spec: {
          serviceAccountName: `hermes-${req.name}`,
          containers,
          volumes,
        },
      },
      volumeClaimTemplates: [
        {
          metadata: { name: 'hermes-data' },
          spec: {
            accessModes: ['ReadWriteOnce'],
            resources: {
              requests: { storage: req.pvcSize || '1Gi' },
            },
          },
        },
      ],
    },
  };
}

export function buildService(req: CreateInstanceRequest) {
  const ports = [
    { port: 8080, targetPort: 8080, protocol: 'TCP', name: 'http' },
  ];
  if (req.oauthProxyEnabled) {
    ports.push({ port: 8443, targetPort: 8443, protocol: 'TCP', name: 'oauth-proxy' });
  }

  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: `hermes-${req.name}`,
      namespace: req.namespace,
      labels: LABELS(req.name, req.agentType),
      ...(req.oauthProxyEnabled && {
        annotations: {
          'service.beta.openshift.io/serving-cert-secret-name': `hermes-${req.name}-tls`,
        },
      }),
    },
    spec: {
      type: 'ClusterIP',
      ports,
      selector: {
        'app.kubernetes.io/name': 'hermes-instance',
        'app.kubernetes.io/instance': req.name,
      },
    },
  };
}

export function buildRoute(req: CreateInstanceRequest) {
  return {
    apiVersion: 'route.openshift.io/v1',
    kind: 'Route',
    metadata: {
      name: `hermes-${req.name}`,
      namespace: req.namespace,
      labels: LABELS(req.name, req.agentType),
    },
    spec: {
      to: {
        kind: 'Service',
        name: `hermes-${req.name}`,
        weight: 100,
      },
      port: {
        targetPort: req.oauthProxyEnabled ? 'oauth-proxy' : 'http',
      },
      tls: {
        termination: req.oauthProxyEnabled ? 'reencrypt' : 'edge',
        insecureEdgeTerminationPolicy: 'Redirect',
      },
    },
  };
}
