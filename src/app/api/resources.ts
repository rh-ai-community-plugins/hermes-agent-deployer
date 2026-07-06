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

export function buildPvc(req: CreateInstanceRequest) {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: `hermes-${req.name}-data`,
      namespace: req.namespace,
      labels: LABELS(req.name, req.agentType),
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: {
        requests: {
          storage: req.pvcSize || '1Gi',
        },
      },
    },
  };
}

export function buildServiceAccount(req: CreateInstanceRequest) {
  const sa: Record<string, unknown> = {
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
  return sa;
}

export function buildDeployment(req: CreateInstanceRequest, defaults: InstanceDefaults) {
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
    {
      name: 'hermes-data',
      persistentVolumeClaim: { claimName: `hermes-${req.name}-data` },
    },
    { name: 'tmp', emptyDir: {} },
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
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: `hermes-${req.name}`,
      namespace: req.namespace,
      labels: LABELS(req.name, req.agentType),
      annotations: {
        'hermes-agent-deployer/model-name': req.modelName,
        'hermes-agent-deployer/model-url': req.modelUrl,
        'hermes-agent-deployer/pvc-size': req.pvcSize,
        'hermes-agent-deployer/oauth-proxy': String(req.oauthProxyEnabled),
      },
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          'app.kubernetes.io/name': 'hermes-instance',
          'app.kubernetes.io/instance': req.name,
        },
      },
      template: {
        metadata: {
          labels: LABELS(req.name, req.agentType),
        },
        spec: {
          serviceAccountName: `hermes-${req.name}`,
          containers,
          volumes,
        },
      },
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
