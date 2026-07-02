export interface InstanceDefaults {
  hermesImage: string;
  oauthProxy: {
    enabled: boolean;
    image: string;
  };
  pvc: {
    size: string;
  };
  resources: {
    requests: { cpu: string; memory: string };
    limits: { cpu: string; memory: string };
  };
}

const FALLBACK: InstanceDefaults = {
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

let cached: InstanceDefaults | null = null;

export async function getInstanceDefaults(): Promise<InstanceDefaults> {
  if (cached) return cached;
  try {
    const resp = await fetch('/config.json');
    if (!resp.ok) throw new Error(resp.statusText);
    cached = await resp.json();
    return cached!;
  } catch {
    cached = FALLBACK;
    return FALLBACK;
  }
}
