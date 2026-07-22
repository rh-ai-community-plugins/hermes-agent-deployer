import { Request, Response } from 'express';

export interface PolicyTemplate {
  tier: string;
  displayName: string;
  description: string;
}

const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    tier: 'standard',
    displayName: 'Standard',
    description: 'PyPI, GitHub (read-only), NousResearch, MLflow. Blocks direct AI APIs and arbitrary web access.',
  },
  {
    tier: 'restricted',
    displayName: 'Restricted',
    description: 'No external network access. Agent can only reach the inference endpoint.',
  },
  {
    tier: 'permissive',
    displayName: 'Permissive',
    description: 'All outbound traffic allowed. Use only for trusted workloads in isolated namespaces.',
  },
];

export function policiesHandler(_req: Request, res: Response): void {
  res.json({ templates: POLICY_TEMPLATES });
}
