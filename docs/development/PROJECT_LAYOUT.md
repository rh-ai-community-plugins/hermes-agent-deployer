# Project Layout

```
hermes-agent-deployer/
├── bff/                        # Backend-For-Frontend service
│   ├── Containerfile           # UBI9 node-22 container
│   ├── src/
│   │   ├── server.ts           # Express on port 3000
│   │   ├── types.ts            # K8s + instance types
│   │   ├── routes/instances.ts # GET /api/instances (aggregated)
│   │   └── utils/k8sClient.ts  # Raw Node.js https to K8s API
│   └── __tests__/              # BFF tests
├── chart/                      # Helm chart (hermes-agent-deployer-chart)
│   ├── templates/
│   │   ├── deployment.yaml     # Frontend nginx pod
│   │   ├── bff-deployment.yaml # BFF pod (conditional)
│   │   ├── bff-service.yaml    # BFF ClusterIP
│   │   ├── service.yaml        # Frontend ClusterIP
│   │   ├── configmap.yaml      # Runtime config.json
│   │   ├── serviceaccount.yaml # RBAC
│   │   └── route.yaml          # OpenShift Route
│   └── values.yaml
├── config/                     # Webpack configs
│   ├── webpack.common.js       # Module Federation + shared deps
│   ├── webpack.dev.js          # Dev server + proxy
│   └── webpack.prod.js         # Production + vendor splitChunks
├── images/hermes-sandbox/      # Agent runtime image (out of scope)
├── scripts/                    # Build automation
├── src/
│   ├── index.ts                # Webpack entry
│   ├── bootstrap.tsx           # React mount with BrowserRouter
│   ├── rhoai/
│   │   ├── extensions.ts       # Dashboard registration (5 extensions)
│   │   └── CommunityNavIcon.tsx # [SHARED] Community plugins icon
│   └── app/
│       ├── App.tsx             # Root layout with CommunityBanner + Routes
│       ├── types.ts            # HermesInstance, CreateInstanceRequest
│       ├── api/                # Stateless API functions
│       │   ├── k8sApi.ts       # k8sFetch wrapper for /api/k8s/
│       │   ├── instanceApi.ts  # CRUD: create, delete, listAgentTypes
│       │   ├── resources.ts    # K8s manifest builders (6 functions)
│       │   └── config.ts       # Runtime config from /config.json
│       ├── hooks/              # React state management
│       │   ├── useInstances.ts # Instance list via BFF + polling
│       │   ├── useNamespaces.ts
│       │   ├── useInstanceDefaults.ts
│       │   └── useInstanceMutation.ts
│       ├── components/         # PatternFly 6 UI
│       │   ├── CommunityBanner.tsx # [SHARED] Orange banner
│       │   ├── HermesNavIcon.tsx
│       │   ├── InstanceList.tsx
│       │   ├── InstanceCreateModal.tsx
│       │   └── StatusBadge.tsx
│       └── pages/
│           └── HermesDeployerPage.tsx
├── Containerfile               # Frontend: UBI9 nginx-124
├── Makefile
├── plugin.yaml                 # Plugin registry metadata
└── package.json
```

## Key Patterns

**Module Federation**: Standard webpack 5 `ModuleFederationPlugin`. Exposes `./extensions` and `./Icon`. Shared singletons: react, react-dom, react-router-dom, @patternfly/react-core, @openshift/dynamic-plugin-sdk.

**Extensions**: 5 extensions register with the dashboard — shared community-plugins section, area, section, nav item, and route. Route uses lazy import.

**BFF vs Client-side**: Instance listing goes through the BFF (server-side aggregation across namespaces). Create/delete go directly through the dashboard's `/api/k8s/` proxy.

**Resource naming**: All K8s resources for instance `foo` are prefixed `hermes-foo` and labeled `app.kubernetes.io/managed-by=hermes-agent-deployer`.

**[SHARED] components**: `CommunityNavIcon` and `CommunityBanner` are identical across all community plugins. Do not modify.
