import { instancesHandler } from '../src/routes/instances';
import { Request, Response } from 'express';

jest.mock('../src/utils/k8sClient', () => ({
  k8sRequest: jest.fn(),
  getK8sBaseUrl: () => 'https://api.test:6443',
}));

import { k8sRequest } from '../src/utils/k8sClient';
const mockK8sRequest = k8sRequest as jest.MockedFunction<typeof k8sRequest>;

function mockReq(auth?: string): Partial<Request> {
  return {
    headers: auth ? { authorization: auth } : {},
  };
}

function mockRes() {
  const res: Record<string, unknown> = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res;
}

describe('instancesHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without Authorization header', async () => {
    const req = mockReq();
    const res = mockRes();
    await instancesHandler(req as Request, res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns instances from accessible namespaces', async () => {
    const req = mockReq('Bearer tok123');
    const res = mockRes();

    mockK8sRequest.mockImplementation((_token: string, path: string) => {
      if (path.includes('/projects')) {
        return Promise.resolve({
          items: [
            { metadata: { name: 'my-project' } },
            { metadata: { name: 'openshift-monitoring' } },
          ],
        });
      }
      if (path.includes('/deployments')) {
        return Promise.resolve({
          items: [
            {
              metadata: {
                name: 'hermes-agent1',
                namespace: 'my-project',
                labels: {
                  'app.kubernetes.io/instance': 'agent1',
                  'hermes-agent-deployer/agent-type': 'hermes',
                },
                annotations: { 'hermes-agent-deployer/model-name': 'llama' },
                creationTimestamp: '2026-01-01T00:00:00Z',
              },
              status: { availableReplicas: 1, replicas: 1 },
            },
          ],
        });
      }
      if (path.includes('/routes/')) {
        return Promise.resolve({
          spec: { host: 'agent1.apps.cluster.local' },
          status: { ingress: [{ host: 'agent1.apps.cluster.local' }] },
        });
      }
      return Promise.resolve({ items: [] });
    });

    await instancesHandler(req as Request, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as { instances: unknown[]; errors: unknown[] };
    expect(body.instances).toHaveLength(1);
    expect((body.instances[0] as { name: string }).name).toBe('agent1');
    expect((body.instances[0] as { status: string }).status).toBe('Running');
    expect((body.instances[0] as { routeUrl: string }).routeUrl).toBe('https://agent1.apps.cluster.local');
  });

  it('filters system namespaces', async () => {
    const req = mockReq('Bearer tok');
    const res = mockRes();

    mockK8sRequest.mockImplementation((_token: string, path: string) => {
      if (path.includes('/projects')) {
        return Promise.resolve({
          items: [
            { metadata: { name: 'default' } },
            { metadata: { name: 'kube-system' } },
            { metadata: { name: 'redhat-ods-monitoring' } },
            { metadata: { name: 'user-ns' } },
          ],
        });
      }
      return Promise.resolve({ items: [] });
    });

    await instancesHandler(req as Request, res as unknown as Response);

    const deploymentCalls = mockK8sRequest.mock.calls.filter((c) =>
      (c[1] as string).includes('/deployments'),
    );
    expect(deploymentCalls).toHaveLength(1);
    expect(deploymentCalls[0][1]).toContain('user-ns');
  });
});
