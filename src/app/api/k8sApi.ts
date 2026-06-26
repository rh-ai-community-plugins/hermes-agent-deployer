const K8S_BASE = '/api/k8s';

export async function k8sFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${K8S_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });
  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Not connected to the RHOAI dashboard. K8s API proxy is unavailable.');
  }
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`K8s API error ${resp.status}: ${body}`);
  }
  return resp.json();
}

export async function listNamespaces(): Promise<string[]> {
  const result = await k8sFetch<{ items: Array<{ metadata: { name: string } }> }>(
    '/api/v1/namespaces',
  );
  return result.items
    .map((ns) => ns.metadata.name)
    .filter((name) => !name.startsWith('openshift-') && !name.startsWith('kube-'));
}
