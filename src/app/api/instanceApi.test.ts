import * as k8sApiModule from './k8sApi';
import * as configModule from './config';
import * as resourcesModule from './resources';
import { listInstances, listAgentTypes, deleteInstance } from './instanceApi';

const mockK8sFetch = jest.fn();
const mockListNamespaces = jest.fn();

jest.mock('./k8sApi', () => ({
  k8sFetch: jest.fn(),
  listNamespaces: jest.fn(),
}));

jest.mock('./config', () => ({
  getInstanceDefaults: jest.fn().mockResolvedValue({
    hermesImage: 'test-image:latest',
    oauthProxy: { enabled: true, image: 'proxy:latest' },
    pvc: { size: '1Gi' },
    resources: {
      requests: { cpu: '200m', memory: '512Mi' },
      limits: { cpu: '1', memory: '1Gi' },
    },
  }),
}));

jest.mock('./resources', () => ({
  buildSecret: jest.fn().mockReturnValue({ metadata: { name: 'hermes-test-credentials' } }),
  buildPvc: jest.fn().mockReturnValue({ metadata: { name: 'hermes-test-data' } }),
  buildServiceAccount: jest.fn().mockReturnValue({ metadata: { name: 'hermes-test' } }),
  buildDeployment: jest.fn().mockReturnValue({ metadata: { name: 'hermes-test' } }),
  buildService: jest.fn().mockReturnValue({ metadata: { name: 'hermes-test' } }),
  buildRoute: jest.fn().mockReturnValue({ metadata: { name: 'hermes-test' } }),
}));

describe('listAgentTypes', () => {
  it('returns the hermes agent type', async () => {
    const agentTypes = await listAgentTypes();
    expect(agentTypes).toHaveLength(1);
    expect(agentTypes[0].name).toBe('hermes');
    expect(agentTypes[0].displayName).toBe('Hermes Agent (Nous Research)');
  });
});

describe('listInstances', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when no deployments found', async () => {
    (k8sApiModule.listNamespaces as jest.Mock).mockResolvedValue(['test-ns']);
    (k8sApiModule.k8sFetch as jest.Mock).mockImplementation(async (path: string) => {
      if (path.includes('deployments')) return { items: [] };
      if (path.includes('namespaces')) return { items: [{ metadata: { name: 'test-ns' } }] };
      throw new Error('Not found');
    });

    const instances = await listInstances();
    expect(instances).toEqual([]);
  });

  it('converts deployment to Running instance with route URL', async () => {
    (k8sApiModule.listNamespaces as jest.Mock).mockResolvedValue(['test-ns']);
    (k8sApiModule.k8sFetch as jest.Mock).mockImplementation(async (path: string) => {
      if (path.includes('deployments')) {
        return {
          items: [
            {
              metadata: {
                name: 'hermes-myservice',
                namespace: 'test-ns',
                labels: { 'app.kubernetes.io/instance': 'myservice' },
                annotations: { 'hermes-agent-deployer/model-name': 'test-model' },
                creationTimestamp: '2024-01-01T00:00:00Z',
              },
              status: { availableReplicas: 1, replicas: 1 },
            },
          ],
        };
      }
      if (path.includes('routes')) {
        return {
          status: { ingress: [{ host: 'my-route.apps.cluster.local' }] },
          spec: { host: 'my-route.apps.cluster.local' },
          metadata: { name: 'hermes-myservice', namespace: 'test-ns' },
        };
      }
      if (path.includes('namespaces')) return { items: [{ metadata: { name: 'test-ns' } }] };
      return {};
    });

    const instances = await listInstances();
    expect(instances).toHaveLength(1);
    expect(instances[0].name).toBe('myservice');
    expect(instances[0].status).toBe('Running');
    expect(instances[0].routeUrl).toBe('https://my-route.apps.cluster.local');
  });

  it('returns Error status when deployment has failure conditions', async () => {
    (k8sApiModule.listNamespaces as jest.Mock).mockResolvedValue(['test-ns']);
    (k8sApiModule.k8sFetch as jest.Mock).mockImplementation(async (path: string) => {
      if (path.includes('deployments')) {
        return {
          items: [
            {
              metadata: {
                name: 'hermes-failed',
                namespace: 'test-ns',
                labels: { 'app.kubernetes.io/instance': 'failed' },
                annotations: {},
                creationTimestamp: '2024-01-01T00:00:00Z',
              },
              status: {
                replicas: 1,
                conditions: [
                  { type: 'Available', status: 'False' },
                  { type: 'Progressing', status: 'False' },
                ],
              },
            },
          ],
        };
      }
      if (path.includes('namespaces')) return { items: [{ metadata: { name: 'test-ns' } }] };
      throw new Error('not found');
    });

    const instances = await listInstances();
    expect(instances[0].status).toBe('Error');
  });

  it('silences namespace access errors gracefully', async () => {
    (k8sApiModule.listNamespaces as jest.Mock).mockResolvedValue(['restricted-ns']);
    (k8sApiModule.k8sFetch as jest.Mock).mockRejectedValue(new Error('Forbidden'));

    const instances = await listInstances();
    expect(instances).toEqual([]);
  });
});

describe('deleteInstance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes all associated resources', async () => {
    (k8sApiModule.k8sFetch as jest.Mock).mockResolvedValue(undefined);
    // listNamespaces should NOT be called during deleteInstance
    jest.spyOn(k8sApiModule, 'k8sFetch').mockResolvedValue(undefined);

    await deleteInstance('myinstance', 'default');

    const calls = (k8sApiModule.k8sFetch as jest.Mock).mock.calls;
    expect(calls).toHaveLength(7);

    const paths = calls.map(([path]: [string]) => path);
    expect(paths).toContain('/apis/route.openshift.io/v1/namespaces/default/routes/hermes-myinstance');
    expect(paths).toContain('/api/v1/namespaces/default/services/hermes-myinstance');
    expect(paths).toContain('/apis/apps/v1/namespaces/default/deployments/hermes-myinstance');
    expect(paths).toContain('/api/v1/namespaces/default/serviceaccounts/hermes-myinstance');
    expect(paths).toContain('/api/v1/namespaces/default/secrets/hermes-myinstance-credentials');
    expect(paths).toContain('/api/v1/namespaces/default/secrets/hermes-myinstance-tls');
    expect(paths).toContain('/api/v1/namespaces/default/persistentvolumeclaims/hermes-myinstance-data');
  });

  it('silences errors during deletion', async () => {
    (k8sApiModule.k8sFetch as jest.Mock).mockRejectedValue(new Error('Forbidden'));

    // Should not throw even though all k8sFetch calls fail
    await expect(deleteInstance('myinstance', 'default')).resolves.not.toThrow();
  });
});
