import {
  buildSecret,
  buildPvc,
  buildServiceAccount,
  buildDeployment,
  buildService,
  buildRoute,
} from './resources';

const baseReq = {
  name: 'test-instance',
  namespace: 'default',
  agentType: 'hermes',
  modelName: 'hermes-3-llama-3.1-8b',
  modelUrl: 'https://vllm-route.apps.cluster.local/v1',
  apiKey: 'secret-key',
  pvcSize: '1Gi',
  oauthProxyEnabled: true,
};

const defaults = {
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
  it('creates a secret with correct metadata', () => {
    const secret = buildSecret(baseReq);
    expect(secret.apiVersion).toBe('v1');
    expect(secret.kind).toBe('Secret');
    expect(secret.metadata.name).toBe('hermes-test-instance-credentials');
    expect(secret.metadata.namespace).toBe('default');
    expect(secret.type).toBe('Opaque');
    expect(secret.metadata.labels).toEqual({
      'app.kubernetes.io/name': 'hermes-instance',
      'app.kubernetes.io/instance': 'test-instance',
      'app.kubernetes.io/managed-by': 'hermes-agent-deployer',
      'hermes-agent-deployer/agent-type': 'hermes',
    });
    expect(secret.stringData).toEqual({
      OPENAI_API_KEY: 'secret-key',
      OPENAI_BASE_URL: 'https://vllm-route.apps.cluster.local/v1',
      HERMES_INFERENCE_MODEL: 'hermes-3-llama-3.1-8b',
    });
  });

  it('uses agentType from request', () => {
    const secret = buildSecret({ ...baseReq, agentType: 'custom' });
    expect(secret.metadata.labels['hermes-agent-deployer/agent-type']).toBe('custom');
  });
});

describe('buildPvc', () => {
  it('creates a PVC with correct metadata', () => {
    const pvc = buildPvc(baseReq);
    expect(pvc.apiVersion).toBe('v1');
    expect(pvc.kind).toBe('PersistentVolumeClaim');
    expect(pvc.metadata.name).toBe('hermes-test-instance-data');
    expect(pvc.metadata.namespace).toBe('default');
    expect(pvc.spec.accessModes).toEqual(['ReadWriteOnce']);
    expect(pvc.spec.resources.requests.storage).toBe('1Gi');
  });

  it('uses custom pvcSize when provided', () => {
    const pvc = buildPvc({ ...baseReq, pvcSize: '5Gi' });
    expect(pvc.spec.resources.requests.storage).toBe('5Gi');
  });

  it('defaults to 1Gi when pvcSize is empty', () => {
    const pvc = buildPvc({ ...baseReq, pvcSize: '' });
    expect(pvc.spec.resources.requests.storage).toBe('1Gi');
  });
});

describe('buildServiceAccount', () => {
  it('creates a service account without oauth annotations when disabled', () => {
    const sa = buildServiceAccount({ ...baseReq, oauthProxyEnabled: false }) as any;
    expect(sa.apiVersion).toBe('v1');
    expect(sa.kind).toBe('ServiceAccount');
    expect(sa.metadata.name).toBe('hermes-test-instance');
    expect(sa.metadata.annotations).toBeUndefined();
  });

  it('includes oauth redirect annotation when enabled', () => {
    const sa = buildServiceAccount(baseReq) as any;
    expect(sa.metadata.annotations).toEqual({
      'serviceaccounts.openshift.io/oauth-redirectreference.primary': JSON.stringify({
        kind: 'OAuthRedirectReference',
        apiVersion: 'v1',
        reference: { kind: 'Route', name: 'hermes-test-instance' },
      }),
    });
  });
});

describe('buildDeployment', () => {
  it('creates deployment with hermes-sandbox container', () => {
    const d = buildDeployment(baseReq, defaults);
    expect(d.apiVersion).toBe('apps/v1');
    expect(d.kind).toBe('Deployment');
    expect(d.metadata.name).toBe('hermes-test-instance');
    expect(d.spec.replicas).toBe(1);
    expect(d.spec.template.spec.containers).toHaveLength(2);
    expect(d.spec.template.spec.containers[0].name).toBe('hermes-sandbox');
    expect(d.spec.template.spec.containers[0].image).toBe(defaults.hermesImage);
  });

  it('hermes-sandbox has security context', () => {
    const d = buildDeployment(baseReq, defaults) as any;
    const sandbox = d.spec.template.spec.containers[0];
    expect(sandbox.securityContext.runAsNonRoot).toBe(true);
    expect(sandbox.securityContext.allowPrivilegeEscalation).toBe(false);
    expect(sandbox.securityContext.capabilities.drop).toContain('ALL');
  });

  it('includes oauth-proxy sidecar container when enabled', () => {
    const d = buildDeployment(baseReq, defaults) as any;
    const proxy = d.spec.template.spec.containers.find((c: any) => c.name === 'oauth-proxy');
    expect(proxy).toBeDefined();
    expect(proxy.image).toBe(defaults.oauthProxy.image);
    expect(proxy.args).toContain('--provider=openshift');
    expect(proxy.args).toContain('--upstream=http://localhost:8080');
  });

  it('has correct labels', () => {
    const d = buildDeployment(baseReq, defaults) as any;
    expect(d.metadata.labels['app.kubernetes.io/name']).toBe('hermes-instance');
    expect(d.metadata.labels['app.kubernetes.io/instance']).toBe('test-instance');
  });

  it('stores instance config in annotations', () => {
    const d = buildDeployment(baseReq, defaults) as any;
    expect(d.metadata.annotations['hermes-agent-deployer/model-name']).toBe('hermes-3-llama-3.1-8b');
    expect(d.metadata.annotations['hermes-agent-deployer/pvc-size']).toBe('1Gi');
    expect(d.metadata.annotations['hermes-agent-deployer/oauth-proxy']).toBe('true');
  });

  it('has readiness and liveness probes', () => {
    const d = buildDeployment(baseReq, defaults) as any;
    const sandbox = d.spec.template.spec.containers[0];
    expect(sandbox.readinessProbe.httpGet.path).toBe('/');
    expect(sandbox.readinessProbe.httpGet.port).toBe(8080);
    expect(sandbox.livenessProbe.httpGet.path).toBe('/');
    expect(sandbox.livenessProbe.httpGet.port).toBe(8080);
  });

  it('excludes oauth-proxy when disabled', () => {
    const d = buildDeployment({ ...baseReq, oauthProxyEnabled: false }, defaults) as any;
    expect(d.spec.template.spec.containers).toHaveLength(1);
    expect(d.spec.template.spec.volumes).toHaveLength(2);
  });

  it('generates unique cookie secrets on each call', () => {
    const d1 = buildDeployment(baseReq, defaults) as any;
    const c1 = d1.spec.template.spec.containers.find((c: any) => c.name === 'oauth-proxy');
    const secret1 = c1.args.find((a: string) => a.startsWith('--cookie-secret='));

    const d2 = buildDeployment(baseReq, defaults) as any;
    const c2 = d2.spec.template.spec.containers.find((c: any) => c.name === 'oauth-proxy');
    const secret2 = c2.args.find((a: string) => a.startsWith('--cookie-secret='));

    expect(secret1).not.toBe(secret2);
  });
});

describe('buildService', () => {
  it('creates ClusterIP service with http port', () => {
    const s = buildService({ ...baseReq, oauthProxyEnabled: false });
    expect(s.apiVersion).toBe('v1');
    expect(s.kind).toBe('Service');
    expect(s.metadata.name).toBe('hermes-test-instance');
    expect(s.spec.type).toBe('ClusterIP');
    expect(s.spec.ports).toHaveLength(1);
    expect(s.spec.ports[0].port).toBe(8080);
  });

  it('includes oauth-proxy port when enabled', () => {
    const s = buildService(baseReq);
    expect(s.spec.ports).toHaveLength(2);
    const oauthPort = s.spec.ports.find((p: any) => p.port === 8443);
    expect(oauthPort).toBeDefined();
    expect(s.metadata.annotations!['service.beta.openshift.io/serving-cert-secret-name']).toBe(
      'hermes-test-instance-tls',
    );
  });
});

describe('buildRoute', () => {
  it('creates route with edge termination when oauth disabled', () => {
    const r = buildRoute({ ...baseReq, oauthProxyEnabled: false });
    expect(r.apiVersion).toBe('route.openshift.io/v1');
    expect(r.kind).toBe('Route');
    expect(r.spec.tls.termination).toBe('edge');
    expect(r.spec.port.targetPort).toBe('http');
  });

  it('creates route with reencrypt termination when oauth enabled', () => {
    const r = buildRoute(baseReq);
    expect(r.spec.tls.termination).toBe('reencrypt');
    expect(r.spec.port.targetPort).toBe('oauth-proxy');
  });
});
