export interface K8sMetadata {
  name: string;
  namespace: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  creationTimestamp?: string;
}

export interface K8sResource {
  metadata: K8sMetadata;
  status?: Record<string, unknown>;
  spec?: Record<string, unknown>;
}

export interface K8sList {
  items: K8sResource[];
}

export interface K8sDeployment {
  metadata: K8sMetadata;
  status?: {
    availableReplicas?: number;
    readyReplicas?: number;
    replicas?: number;
    conditions?: Array<{ type: string; status: string }>;
  };
}

export interface K8sSandbox {
  metadata: K8sMetadata;
  spec?: {
    operatingMode?: 'Running' | 'Suspended';
    service?: boolean;
  };
  status?: {
    conditions?: Array<{ type: string; status: string; reason?: string; message?: string }>;
    serviceFQDN?: string;
    service?: string;
    podIPs?: string[];
    nodeName?: string;
  };
}

export interface K8sRoute {
  metadata: K8sMetadata;
  spec: { host?: string };
  status?: { ingress?: Array<{ host: string }> };
}

export type InstanceStatus = 'Pending' | 'Starting' | 'Running' | 'Stopped' | 'Suspended' | 'Error' | 'Terminating' | 'Unknown';

export interface InstanceConfig {
  modelName: string;
  modelUrl: string;
  pvcSize: string;
  oauthProxyEnabled: boolean;
}

export interface HermesInstance {
  name: string;
  displayName: string;
  namespace: string;
  agentType: string;
  status: InstanceStatus;
  routeUrl: string;
  createdAt: string;
  config: InstanceConfig;
}

export interface InstancesResponse {
  instances: HermesInstance[];
  errors: Array<{ namespace: string; error: string }>;
}
