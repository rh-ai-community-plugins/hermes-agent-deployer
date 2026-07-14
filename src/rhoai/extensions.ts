// [SHARED] Common section for all community plugins — never changes across plugins.
// Do not change the id or name: all community plugins share this section
// so they appear grouped together in the dashboard sidebar.
export const communityPluginsSectionExtension = {
  type: 'app.navigation/section' as const,
  properties: {
    id: 'community-plugins', // [SHARED] common section for all community plugins
    title: 'Community plugins', // [SHARED]
    group: '9_plugins', // [SHARED]
    iconRef: () => import('./CommunityNavIcon'),
  },
};

// [PLUGIN-SPECIFIC] Everything below is specific to this plugin

export const hermesAreaExtension = {
  type: 'app.area' as const,
  properties: {
    id: 'hermes-agent-deployer', // [PLUGIN-SPECIFIC] unique area ID
    featureFlags: [] as string[],
  },
};

export const hermesSectionExtension = {
  type: 'app.navigation/section' as const,
  properties: {
    id: 'hermes-agent-deployer', // [PLUGIN-SPECIFIC] unique nav section ID
    title: 'Hermes Agent', // [PLUGIN-SPECIFIC] display name in sidebar
    group: '1_hermes_agent', // [PLUGIN-SPECIFIC] sort key within community-plugins
    section: 'community-plugins', // [SHARED] must match communityPluginsSectionExtension.id — do not change
    iconRef: () => import('~/app/components/HermesNavIcon'),
  },
};

export const hermesInstancesNavExtension = {
  type: 'app.navigation/href' as const,
  properties: {
    id: 'hermes-agent-deployer-instances', // [PLUGIN-SPECIFIC] unique nav item ID
    title: 'Instances',
    href: '/hermes-agent-deployer', // [PLUGIN-SPECIFIC] must match route prefix
    section: 'hermes-agent-deployer', // [PLUGIN-SPECIFIC] references this plugin's section ID
    path: '/hermes-agent-deployer/*', // [PLUGIN-SPECIFIC] route-matching pattern
  },
};

export const hermesRouteExtension = {
  type: 'app.route' as const,
  properties: {
    path: '/hermes-agent-deployer/*', // [PLUGIN-SPECIFIC] top-level route prefix
    component: () => import('~/app/App'),
  },
};

export const extensions = [
  communityPluginsSectionExtension,
  hermesAreaExtension,
  hermesSectionExtension,
  hermesInstancesNavExtension,
  hermesRouteExtension,
];

export default extensions;
