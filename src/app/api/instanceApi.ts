import { HermesInstance, CreateInstanceRequest, AgentType, InstanceStatus } from '../types';
import { k8sFetch, listNamespaces as k8sListNamespaces } from './k8sApi';
import { buildSecret, buildPvc, buildServiceAccount, buildDeployment, buildService, buildRoute } from './resources';
import { getInstanceDefaults } from './config';

const LABEL_SELECTOR = 'app.kubernetes.io/managed-by=hermes-agent-deployer';

interface K8sDeployment {
  metadata: {
    name: string;
    namespace: string;
    labels: Record<string, string>;
    annotations?: Record<string, string>;
    creationTimestamp: string;
  };
  status?: {
    availableReplicas?: number;
    readyReplicas?: number;
    replicas?: number;
    conditions?: Array<{ type: string; status: string }>;
  };
}

interface K8sRoute {
  metadata: { name: string; namespace: string };
  spec: { host?: string };
  status?: { ingress?: Array<{ host: string }> };
}

function deploymentToInstance(dep: K8sDeployment, routeUrl: string): HermesInstance {
  const ann = dep.metadata.annotations || {};
  let status: InstanceStatus = 'Unknown';
  if (dep.status?.availableReplicas && dep.status.availableReplicas > 0) {
    status = 'Running';
  } else if (dep.status?.replicas && dep.status.replicas > 0) {
    status = 'Starting';
  } else {
    status = 'Pending';
  }

  return {
    name: dep.metadata.labels['app.kubernetes.io/instance'] || dep.metadata.name.replace('hermes-', ''),
    namespace: dep.metadata.namespace,
    agentType: dep.metadata.labels['hermes-agent-deployer/agent-type'] || 'hermes',
    status,
    routeUrl,
    createdAt: dep.metadata.creationTimestamp,
    config: {
      modelName: ann['hermes-agent-deployer/model-name'] || '',
      modelUrl: ann['hermes-agent-deployer/model-url'] || '',
      pvcSize: ann['hermes-agent-deployer/pvc-size'] || '1Gi',
      oauthProxyEnabled: ann['hermes-agent-deployer/oauth-proxy'] === 'true',
    },
  };
}

export async function listInstances(): Promise<HermesInstance[]> {
  const namespaces = await k8sListNamespaces();
  const instances: HermesInstance[] = [];

  for (const ns of namespaces) {
    try {
      const deps = await k8sFetch<{ items: K8sDeployment[] }>(
        `/apis/apps/v1/namespaces/${ns}/deployments?labelSelector=${encodeURIComponent(LABEL_SELECTOR)}`,
      );

      for (const dep of deps.items) {
        let routeUrl = '';
        try {
          const route = await k8sFetch<K8sRoute>(
            `/apis/route.openshift.io/v1/namespaces/${ns}/routes/${dep.metadata.name}`,
          );
          const host = route.status?.ingress?.[0]?.host || route.spec?.host || '';
          if (host) routeUrl = `https://${host}`;
        } catch {
          // route may not exist yet
        }
        instances.push(deploymentToInstance(dep, routeUrl));
      }
    } catch {
      // user may not have access to this namespace
    }
  }

  return instances;
}

export async function createInstance(req: CreateInstanceRequest): Promise<HermesInstance> {
  const defaults = await getInstanceDefaults();
  const created: Array<{ kind: string; name: string; namespace: string; apiPath: string }> = [];

  const rollback = async () => {
    for (const res of created.reverse()) {
      try {
        await k8sFetch(res.apiPath, { method: 'DELETE' });
      } catch {
        // best-effort cleanup
      }
    }
  };

  try {
    const secret = buildSecret(req);
    await k8sFetch(`/api/v1/namespaces/${req.namespace}/secrets`, {
      method: 'POST',
      body: JSON.stringify(secret),
    });
    created.push({
      kind: 'Secret',
      name: secret.metadata.name,
      namespace: req.namespace,
      apiPath: `/api/v1/namespaces/${req.namespace}/secrets/${secret.metadata.name}`,
    });

    const pvc = buildPvc(req);
    await k8sFetch(`/api/v1/namespaces/${req.namespace}/persistentvolumeclaims`, {
      method: 'POST',
      body: JSON.stringify(pvc),
    });
    created.push({
      kind: 'PVC',
      name: pvc.metadata.name,
      namespace: req.namespace,
      apiPath: `/api/v1/namespaces/${req.namespace}/persistentvolumeclaims/${pvc.metadata.name}`,
    });

    const sa = buildServiceAccount(req);
    await k8sFetch(`/api/v1/namespaces/${req.namespace}/serviceaccounts`, {
      method: 'POST',
      body: JSON.stringify(sa),
    });
    created.push({
      kind: 'ServiceAccount',
      name: sa.metadata.name,
      namespace: req.namespace,
      apiPath: `/api/v1/namespaces/${req.namespace}/serviceaccounts/${sa.metadata.name}`,
    });

    const deployment = buildDeployment(req, defaults);
    await k8sFetch(`/apis/apps/v1/namespaces/${req.namespace}/deployments`, {
      method: 'POST',
      body: JSON.stringify(deployment),
    });
    created.push({
      kind: 'Deployment',
      name: deployment.metadata.name,
      namespace: req.namespace,
      apiPath: `/apis/apps/v1/namespaces/${req.namespace}/deployments/${deployment.metadata.name}`,
    });

    const service = buildService(req);
    await k8sFetch(`/api/v1/namespaces/${req.namespace}/services`, {
      method: 'POST',
      body: JSON.stringify(service),
    });
    created.push({
      kind: 'Service',
      name: service.metadata.name,
      namespace: req.namespace,
      apiPath: `/api/v1/namespaces/${req.namespace}/services/${service.metadata.name}`,
    });

    const route = buildRoute(req);
    await k8sFetch(`/apis/route.openshift.io/v1/namespaces/${req.namespace}/routes`, {
      method: 'POST',
      body: JSON.stringify(route),
    });

    return {
      name: req.name,
      namespace: req.namespace,
      agentType: req.agentType,
      status: 'Pending',
      routeUrl: '',
      createdAt: new Date().toISOString(),
      config: {
        modelName: req.modelName,
        modelUrl: req.modelUrl,
        pvcSize: req.pvcSize,
        oauthProxyEnabled: req.oauthProxyEnabled,
      },
    };
  } catch (err) {
    await rollback();
    throw err;
  }
}

export async function deleteInstance(name: string, namespace: string): Promise<void> {
  const prefix = `hermes-${name}`;
  const deletions = [
    k8sFetch(`/apis/route.openshift.io/v1/namespaces/${namespace}/routes/${prefix}`, { method: 'DELETE' }).catch(() => {}),
    k8sFetch(`/api/v1/namespaces/${namespace}/services/${prefix}`, { method: 'DELETE' }).catch(() => {}),
    k8sFetch(`/apis/apps/v1/namespaces/${namespace}/deployments/${prefix}`, { method: 'DELETE' }).catch(() => {}),
    k8sFetch(`/api/v1/namespaces/${namespace}/serviceaccounts/${prefix}`, { method: 'DELETE' }).catch(() => {}),
    k8sFetch(`/api/v1/namespaces/${namespace}/secrets/${prefix}-credentials`, { method: 'DELETE' }).catch(() => {}),
    k8sFetch(`/api/v1/namespaces/${namespace}/secrets/${prefix}-tls`, { method: 'DELETE' }).catch(() => {}),
    k8sFetch(`/api/v1/namespaces/${namespace}/persistentvolumeclaims/${prefix}-data`, { method: 'DELETE' }).catch(() => {}),
  ];
  await Promise.all(deletions);
}

export async function listAgentTypes(): Promise<AgentType[]> {
  return [
    {
      name: 'hermes',
      displayName: 'Hermes Agent (Nous Research)',
      description: 'Autonomous AI agent with persistent memory, self-improving skills, and multi-provider LLM support',
      image: 'quay.io/rh-ai-community-plugins/hermes-sandbox:0.1.0',
    },
  ];
}

export { k8sListNamespaces as listNamespaces };
