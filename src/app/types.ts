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

export type InstanceStatus = 'Pending' | 'Starting' | 'Running' | 'Error' | 'Terminating' | 'Unknown';

export interface InstanceConfig {
  modelName: string;
  modelUrl: string;
  pvcSize: string;
  oauthProxyEnabled: boolean;
}

export interface CreateInstanceRequest {
  name: string;
  displayName: string;
  namespace: string;
  agentType: string;
  modelName: string;
  modelUrl: string;
  apiKey: string;
  pvcSize: string;
  oauthProxyEnabled: boolean;
}

export interface AgentType {
  name: string;
  displayName: string;
  description: string;
  image: string;
}
