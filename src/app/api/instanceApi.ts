import { HermesInstance, CreateInstanceRequest, AgentType, InstanceStatus } from '../types';
import { k8sFetch, listNamespaces as k8sListNamespaces } from './k8sApi';
import { buildSecret, buildServiceAccount, buildSandbox, buildService, buildRoute } from './resources';
import { getInstanceDefaults } from './config';

const LABEL_SELECTOR = 'app.kubernetes.io/managed-by=hermes-agent-deployer';
const SANDBOX_API = 'agents.x-k8s.io/v1beta1';

interface K8sSandbox {
  metadata: {
    name: string;
    namespace: string;
    labels: Record<string, string>;
    annotations?: Record<string, string>;
    creationTimestamp: string;
  };
  spec?: {
    operatingMode?: 'Running' | 'Suspended';
  };
  status?: {
    conditions?: Array<{ type: string; status: string; reason?: string }>;
    serviceFQDN?: string;
    service?: string;
  };
}

interface K8sRoute {
  metadata: { name: string; namespace: string };
  spec: { host?: string };
  status?: { ingress?: Array<{ host: string }> };
}

function sandboxToInstance(sandbox: K8sSandbox, routeUrl: string): HermesInstance {
  const ann = sandbox.metadata.annotations || {};
  const conditions = sandbox.status?.conditions || [];
  const mode = sandbox.spec?.operatingMode;

  const ready = conditions.find((c) => c.type === 'Ready');
  const finished = conditions.find((c) => c.type === 'Finished');

  let status: InstanceStatus = 'Pending';
  if (mode === 'Suspended' || ready?.reason === 'SandboxSuspended') {
    status = 'Suspended';
  } else if (finished?.status === 'True' && finished.reason === 'PodFailed') {
    status = 'Error';
  } else if (ready?.status === 'True') {
    status = 'Running';
  } else if (ready?.status === 'False' && ready.reason === 'DependenciesNotReady') {
    status = 'Starting';
  } else if (conditions.length > 0) {
    status = 'Starting';
  }

  const instanceName = sandbox.metadata.labels['app.kubernetes.io/instance'] || sandbox.metadata.name.replace('hermes-', '');
  return {
    name: instanceName,
    displayName: ann['hermes-agent-deployer/display-name'] || instanceName,
    namespace: sandbox.metadata.namespace,
    agentType: sandbox.metadata.labels['hermes-agent-deployer/agent-type'] || 'hermes',
    status,
    routeUrl,
    createdAt: sandbox.metadata.creationTimestamp,
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
      const sandboxes = await k8sFetch<{ items: K8sSandbox[] }>(
        `/apis/${SANDBOX_API}/namespaces/${ns}/sandboxes?labelSelector=${encodeURIComponent(LABEL_SELECTOR)}`,
      );

      for (const sb of sandboxes.items) {
        let routeUrl = '';
        try {
          const route = await k8sFetch<K8sRoute>(
            `/apis/route.openshift.io/v1/namespaces/${ns}/routes/${sb.metadata.name}`,
          );
          const host = route.status?.ingress?.[0]?.host || route.spec?.host || '';
          if (host) routeUrl = `https://${host}`;
        } catch {
          // route may not exist yet
        }
        instances.push(sandboxToInstance(sb, routeUrl));
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

    const sandbox = buildSandbox(req, defaults);
    await k8sFetch(`/apis/${SANDBOX_API}/namespaces/${req.namespace}/sandboxes`, {
      method: 'POST',
      body: JSON.stringify(sandbox),
    });
    created.push({
      kind: 'Sandbox',
      name: sandbox.metadata.name,
      namespace: req.namespace,
      apiPath: `/apis/${SANDBOX_API}/namespaces/${req.namespace}/sandboxes/${sandbox.metadata.name}`,
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
      displayName: req.displayName,
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
    k8sFetch(`/apis/${SANDBOX_API}/namespaces/${namespace}/sandboxes/${prefix}`, { method: 'DELETE' }).catch(() => {}),
    k8sFetch(`/api/v1/namespaces/${namespace}/serviceaccounts/${prefix}`, { method: 'DELETE' }).catch(() => {}),
    k8sFetch(`/api/v1/namespaces/${namespace}/secrets/${prefix}-credentials`, { method: 'DELETE' }).catch(() => {}),
    k8sFetch(`/api/v1/namespaces/${namespace}/secrets/${prefix}-tls`, { method: 'DELETE' }).catch(() => {}),
    // PVC created by volumeClaimTemplates follows StatefulSet naming: {template-name}-{sandbox-name}-0
    k8sFetch(`/api/v1/namespaces/${namespace}/persistentvolumeclaims/hermes-data-${prefix}-0`, { method: 'DELETE' }).catch(() => {}),
  ];
  await Promise.all(deletions);
}

export async function suspendInstance(name: string, namespace: string): Promise<void> {
  await k8sFetch(`/apis/${SANDBOX_API}/namespaces/${namespace}/sandboxes/hermes-${name}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/merge-patch+json' },
    body: JSON.stringify({ spec: { operatingMode: 'Suspended' } }),
  });
}

export async function resumeInstance(name: string, namespace: string): Promise<void> {
  await k8sFetch(`/apis/${SANDBOX_API}/namespaces/${namespace}/sandboxes/hermes-${name}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/merge-patch+json' },
    body: JSON.stringify({ spec: { operatingMode: 'Running' } }),
  });
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
