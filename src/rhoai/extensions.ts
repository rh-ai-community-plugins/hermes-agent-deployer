import HermesDeployerPage from '../app/components/HermesDeployerPage';

export const hermesAreaExtension = {
  type: 'app.area' as const,
  properties: {
    id: 'hermes-agent-deployer',
    featureFlags: [],
  },
};

export const hermesNavItemExtension = {
  type: 'app.navigation/href' as const,
  properties: {
    id: 'hermes-agent-deployer-nav',
    title: 'Hermes Agent Deployer',
    href: '/hermes-agent-deployer',
    section: 'community-plugins',
    label: 'Community',
  },
};

export const hermesRouteExtension = {
  type: 'app.route' as const,
  properties: {
    path: '/hermes-agent-deployer/*',
    component: () => Promise.resolve({ default: HermesDeployerPage }),
  },
};

export const extensions = [
  hermesAreaExtension,
  hermesNavItemExtension,
  hermesRouteExtension,
];

export default extensions;
