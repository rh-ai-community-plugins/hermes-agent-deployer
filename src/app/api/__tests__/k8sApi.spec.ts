import { k8sFetch, listNamespaces } from '../k8sApi';

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('k8sFetch', () => {
  it('prepends /api/k8s and returns JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ kind: 'Pod' }),
    });

    const result = await k8sFetch('/api/v1/pods');
    expect(global.fetch).toHaveBeenCalledWith('/api/k8s/api/v1/pods', expect.any(Object));
    expect(result).toEqual({ kind: 'Pod' });
  });

  it('throws when content-type is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
    });

    await expect(k8sFetch('/test')).rejects.toThrow('Not connected to the RHOAI dashboard');
  });

  it('throws on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve('Forbidden'),
    });

    await expect(k8sFetch('/test')).rejects.toThrow('K8s API error 403: Forbidden');
  });
});

describe('listNamespaces', () => {
  it('returns user namespaces, filtering system ones', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          items: [
            { metadata: { name: 'my-project' } },
            { metadata: { name: 'openshift-monitoring' } },
            { metadata: { name: 'kube-system' } },
            { metadata: { name: 'dev-ns' } },
          ],
        }),
    });

    const ns = await listNamespaces();
    expect(ns).toEqual(['my-project', 'dev-ns']);
  });
});
