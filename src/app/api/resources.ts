import { CreateInstanceRequest } from '../types';

const LABELS = (name: string, agentType: string) => ({
  'app.kubernetes.io/name': 'hermes-instance',
  'app.kubernetes.io/instance': name,
  'app.kubernetes.io/managed-by': 'hermes-agent-deployer',
  'hermes-agent-deployer/agent-type': agentType,
});

const DEFAULT_HERMES_IMAGE = 'quay.io/rh-ai-community-plugins/hermes-sandbox:0.1.0';

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
      MODEL_API_KEY: req.apiKey,
      MODEL_URL: req.modelUrl,
      MODEL_NAME: req.modelName,
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
  return {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: `hermes-${req.name}`,
      namespace: req.namespace,
      labels: LABELS(req.name, req.agentType),
    },
  };
}

export function buildDeployment(req: CreateInstanceRequest) {
  const containers = [
    {
      name: 'hermes-sandbox',
      image: DEFAULT_HERMES_IMAGE,
      ports: [{ containerPort: 8080, name: 'http' }],
      env: [
        { name: 'HERMES_WEBUI_PORT', value: '8080' },
        { name: 'HERMES_WEBUI_HOST', value: '0.0.0.0' },
      ],
      envFrom: [
        { secretRef: { name: `hermes-${req.name}-credentials` } },
      ],
      volumeMounts: [
        { name: 'hermes-data', mountPath: '/home/hermes/.hermes' },
        { name: 'tmp', mountPath: '/tmp' },
      ],
      resources: {
        requests: { cpu: '200m', memory: '512Mi' },
        limits: { cpu: '1', memory: '1Gi' },
      },
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
          volumes: [
            {
              name: 'hermes-data',
              persistentVolumeClaim: { claimName: `hermes-${req.name}-data` },
            },
            {
              name: 'tmp',
              emptyDir: {},
            },
          ],
        },
      },
    },
  };
}

export function buildService(req: CreateInstanceRequest) {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: `hermes-${req.name}`,
      namespace: req.namespace,
      labels: LABELS(req.name, req.agentType),
    },
    spec: {
      type: 'ClusterIP',
      ports: [
        { port: 8080, targetPort: 8080, protocol: 'TCP', name: 'http' },
      ],
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
        targetPort: 'http',
      },
      tls: {
        termination: 'edge',
        insecureEdgeTerminationPolicy: 'Redirect',
      },
    },
  };
}
