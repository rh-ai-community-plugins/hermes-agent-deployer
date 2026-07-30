import { buildSecret, buildServiceAccount, buildSandbox, buildService, buildRoute } from '../resources';
import { CreateInstanceRequest } from '../../types';
import { InstanceDefaults } from '../config';

Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = i % 256;
      return arr;
    },
  },
});

const req: CreateInstanceRequest = {
  name: 'test-agent',
  displayName: 'Test Agent',
  namespace: 'my-ns',
  agentType: 'hermes',
  modelName: 'llama-3',
  modelUrl: 'https://vllm.example.com/v1',
  apiKey: 'sk-test-key',
  pvcSize: '2Gi',
  oauthProxyEnabled: false,
};

const defaults: InstanceDefaults = {
  hermesImage: 'quay.io/rh-ai-community-plugins/hermes-sandbox:0.1.0',
  oauthProxy: {
    enabled: true,
    image: 'registry.redhat.io/openshift4/ose-oauth-proxy-rhel9:v4.17',
  },
  pvc: { size: '1Gi' },
  resources: {
    requests: { cpu: '200m', memory: '512Mi' },
    limits: { cpu: '1', memory: '1Gi' },
  },
};

describe('buildSecret', () => {
  it('creates an Opaque secret with credentials', () => {
    const secret = buildSecret(req);
    expect(secret.metadata.name).toBe('hermes-test-agent-credentials');
    expect(secret.metadata.namespace).toBe('my-ns');
    expect(secret.type).toBe('Opaque');
    expect(secret.stringData.OPENAI_API_KEY).toBe('sk-test-key');
    expect(secret.stringData.OPENAI_BASE_URL).toBe('https://vllm.example.com/v1');
    expect(secret.stringData.HERMES_INFERENCE_MODEL).toBe('llama-3');
  });

  it('includes managed-by label', () => {
    const secret = buildSecret(req);
    expect(secret.metadata.labels['app.kubernetes.io/managed-by']).toBe('hermes-agent-deployer');
  });
});

describe('buildServiceAccount', () => {
  it('creates a basic SA without OAuth annotations', () => {
    const sa = buildServiceAccount(req);
    expect(sa.metadata.name).toBe('hermes-test-agent');
    expect(sa.metadata.annotations).toBeUndefined();
  });

  it('adds OAuth redirect annotation when enabled', () => {
    const sa = buildServiceAccount({ ...req, oauthProxyEnabled: true });
    expect(sa.metadata.annotations).toBeDefined();
    const key = 'serviceaccounts.openshift.io/oauth-redirectreference.primary';
    expect(sa.metadata.annotations![key]).toBeDefined();
  });
});

describe('buildSandbox', () => {
  it('creates a Sandbox CR with correct apiVersion and kind', () => {
    const sandbox = buildSandbox(req, defaults);
    expect(sandbox.apiVersion).toBe('agents.x-k8s.io/v1beta1');
    expect(sandbox.kind).toBe('Sandbox');
    expect(sandbox.metadata.name).toBe('hermes-test-agent');
  });

  it('sets operatingMode to Running', () => {
    const sandbox = buildSandbox(req, defaults);
    expect(sandbox.spec.operatingMode).toBe('Running');
  });

  it('includes hermes-sandbox container in podTemplate', () => {
    const sandbox = buildSandbox(req, defaults);
    const containers = sandbox.spec.podTemplate.spec.containers;
    expect(containers[0].name).toBe('hermes-sandbox');
    expect(containers[0].image).toBe(defaults.hermesImage);
  });

  it('stores instance metadata in annotations', () => {
    const sandbox = buildSandbox(req, defaults);
    expect(sandbox.metadata.annotations['hermes-agent-deployer/model-name']).toBe('llama-3');
  });

  it('includes volumeClaimTemplates for PVC', () => {
    const sandbox = buildSandbox(req, defaults);
    expect(sandbox.spec.volumeClaimTemplates).toHaveLength(1);
    expect(sandbox.spec.volumeClaimTemplates[0].metadata.name).toBe('hermes-data');
    expect(sandbox.spec.volumeClaimTemplates[0].spec.resources.requests.storage).toBe('2Gi');
    expect(sandbox.spec.volumeClaimTemplates[0].spec.accessModes).toEqual(['ReadWriteOnce']);
  });

  it('propagates labels to podTemplate metadata', () => {
    const sandbox = buildSandbox(req, defaults);
    expect(sandbox.spec.podTemplate.metadata.labels['app.kubernetes.io/managed-by']).toBe('hermes-agent-deployer');
    expect(sandbox.spec.podTemplate.metadata.labels['app.kubernetes.io/instance']).toBe('test-agent');
  });

  it('adds oauth-proxy sidecar when enabled', () => {
    const sandbox = buildSandbox({ ...req, oauthProxyEnabled: true }, defaults);
    const containers = sandbox.spec.podTemplate.spec.containers;
    expect(containers).toHaveLength(2);
    expect(containers[1].name).toBe('oauth-proxy');
  });

  it('has only hermes-sandbox container when oauth disabled', () => {
    const sandbox = buildSandbox(req, defaults);
    expect(sandbox.spec.podTemplate.spec.containers).toHaveLength(1);
  });
});

describe('buildService', () => {
  it('creates a ClusterIP service on port 8080', () => {
    const svc = buildService(req);
    expect(svc.spec.type).toBe('ClusterIP');
    expect(svc.spec.ports[0].port).toBe(8080);
  });

  it('adds oauth-proxy port when enabled', () => {
    const svc = buildService({ ...req, oauthProxyEnabled: true });
    expect(svc.spec.ports).toHaveLength(2);
    expect(svc.spec.ports[1].port).toBe(8443);
  });
});

describe('buildRoute', () => {
  it('creates an edge-terminated route when oauth disabled', () => {
    const route = buildRoute(req);
    expect(route.spec.tls.termination).toBe('edge');
    expect(route.spec.port.targetPort).toBe('http');
  });

  it('creates a reencrypt route when oauth enabled', () => {
    const route = buildRoute({ ...req, oauthProxyEnabled: true });
    expect(route.spec.tls.termination).toBe('reencrypt');
    expect(route.spec.port.targetPort).toBe('oauth-proxy');
  });
});
