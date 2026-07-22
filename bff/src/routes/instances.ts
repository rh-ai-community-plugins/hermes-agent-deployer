import { Request, Response } from 'express';
import { k8sRequest } from '../utils/k8sClient';
import { K8sSandbox, K8sRoute, K8sList, HermesInstance, InstanceStatus, InstancesResponse } from '../types';

const LABEL_SELECTOR = 'app.kubernetes.io/managed-by=hermes-agent-deployer';
const SANDBOX_API = 'agents.x-k8s.io/v1beta1';
const SYSTEM_NS_PREFIXES = ['openshift-', 'kube-', 'default', 'redhat-'];

function isSystemNamespace(name: string): boolean {
  return SYSTEM_NS_PREFIXES.some((prefix) =>
    prefix.endsWith('-') ? name.startsWith(prefix) : name === prefix,
  );
}

function sandboxStatus(sandbox: K8sSandbox): InstanceStatus {
  const conditions = sandbox.status?.conditions || [];
  const mode = sandbox.spec?.operatingMode;

  const ready = conditions.find((c) => c.type === 'Ready');
  const finished = conditions.find((c) => c.type === 'Finished');

  if (mode === 'Suspended' || ready?.reason === 'SandboxSuspended') {
    return 'Suspended';
  }
  if (finished?.status === 'True' && finished.reason === 'PodFailed') {
    return 'Error';
  }
  if (ready?.status === 'True') {
    return 'Running';
  }
  if (ready?.status === 'False' && ready.reason === 'DependenciesNotReady') {
    return 'Starting';
  }
  if (conditions.length > 0) {
    return 'Starting';
  }
  return 'Pending';
}

function toInstance(sandbox: K8sSandbox, routeUrl: string): HermesInstance {
  const ann = sandbox.metadata.annotations || {};
  const instanceName = sandbox.metadata.labels?.['app.kubernetes.io/instance'] || sandbox.metadata.name.replace('hermes-', '');
  return {
    name: instanceName,
    displayName: ann['hermes-agent-deployer/display-name'] || instanceName,
    namespace: sandbox.metadata.namespace,
    agentType: sandbox.metadata.labels?.['hermes-agent-deployer/agent-type'] || 'hermes',
    status: sandboxStatus(sandbox),
    routeUrl,
    createdAt: sandbox.metadata.creationTimestamp || '',
    config: {
      modelName: ann['hermes-agent-deployer/model-name'] || '',
      modelUrl: ann['hermes-agent-deployer/model-url'] || '',
      pvcSize: ann['hermes-agent-deployer/pvc-size'] || '1Gi',
      oauthProxyEnabled: ann['hermes-agent-deployer/oauth-proxy'] === 'true',
    },
  };
}

export async function instancesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const projectsData = await k8sRequest<K8sList>(
      token,
      '/apis/project.openshift.io/v1/projects',
    );

    const namespaces = projectsData.items
      .map((p) => p.metadata.name)
      .filter((ns) => !isSystemNamespace(ns));

    const results = await Promise.allSettled(
      namespaces.map(async (ns) => {
        const sandboxData = await k8sRequest<{ items: K8sSandbox[] }>(
          token,
          `/apis/${SANDBOX_API}/namespaces/${ns}/sandboxes?labelSelector=${encodeURIComponent(LABEL_SELECTOR)}`,
        );

        const instances: HermesInstance[] = [];
        for (const sb of sandboxData.items) {
          let routeUrl = '';
          try {
            const route = await k8sRequest<K8sRoute>(
              token,
              `/apis/route.openshift.io/v1/namespaces/${ns}/routes/${sb.metadata.name}`,
            );
            const host = route.status?.ingress?.[0]?.host || route.spec?.host || '';
            if (host) routeUrl = `https://${host}`;
          } catch {
            // route may not exist yet
          }
          instances.push(toInstance(sb, routeUrl));
        }
        return instances;
      }),
    );

    const instances: HermesInstance[] = [];
    const errors: Array<{ namespace: string; error: string }> = [];

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        instances.push(...r.value);
      } else {
        errors.push({
          namespace: namespaces[i],
          error: r.reason?.message ?? 'Unknown error',
        });
      }
    });

    const response: InstancesResponse = { instances, errors };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Instance listing error:', message);
    res.status(502).json({ error: message });
  }
}
