# Issue: Plugin nav item disappears after webpack shared module changes

## Symptom
"Hermes Agent Deployer" nav item appeared in RHOAI 3.4 dashboard left nav, but disappeared after rebuilding with different webpack Module Federation `shared` config. Dashboard backend logs confirm plugin is registered and proxy is set up, but browser never requests remoteEntry.js.

## What worked (build 1)
```javascript
// config/webpack.common.js — ModuleFederationPlugin shared config
shared: {
  react: { singleton: true, requiredVersion: '^18' },
  'react-dom': { singleton: true, requiredVersion: '^18' },
  'react-router-dom': { singleton: true, requiredVersion: '^7' },
  '@patternfly/react-core': { singleton: true, requiredVersion: '^6' },
  '@openshift/dynamic-plugin-sdk': { singleton: true, requiredVersion: '^5' },
},
```
- Nav item visible in sidebar ✓
- Clicking it → ChunkLoadError on chunk 655 (@patternfly/react-core fallback) ✗
- The gateway/OAuth proxy blocks lazily-loaded script chunks during client-side navigation

## What broke (build 2+)
Various attempts to fix the ChunkLoadError by changing shared config:
1. `shared: {}` — bundled everything → "Cannot read properties of null (reading 'useState')" (two React copies)
2. `import: false` on react/react-dom only → nav item disappeared
3. `import: false` on all shared modules → nav item disappeared
4. `eager: true` + `import: false` on all → nav item disappeared

## Root cause hypothesis
The RHOAI 3.4 dashboard uses `@module-federation/enhanced` (Rspack-compatible runtime), not standard webpack 5 Module Federation. Evidence:
- Other plugins' remoteEntry.js includes the full enhanced runtime (`createInstance`, `loadRemote`, `registerRemotes`, etc.)
- Other plugins expose `__federation_expose_extensions.bundle.js`, not chunk-numbered files
- The dashboard frontend uses `loadRemote()` from `@module-federation/runtime` to discover and load plugin extensions

The first build worked because standard webpack 5 containers ARE compatible with the enhanced runtime's `loadRemote()`. But something about the `import: false` / `eager: true` changes broke the container API shape that the enhanced runtime expects.

## ChunkLoadError root cause
When the user clicks the nav item, React renders the route component. This triggers lazy loading of chunk 655 (the @patternfly/react-core shared module fallback). The dashboard's OAuth gateway intercepts this `<script>` tag request — the script onerror fires, not the onload. The request never reaches the dashboard's Fastify proxy backend.

Chunks loaded during initial page load (remoteEntry.js, extensions chunk, vendors) work fine because they're loaded during the Module Federation init phase.

## Fix approaches to try

### Approach A: Switch to @module-federation/enhanced
Replace webpack 5's built-in `ModuleFederationPlugin` with `@module-federation/enhanced`. This matches the dashboard's runtime exactly.
```bash
npm install @module-federation/enhanced
```
```javascript
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack');
```

### Approach B: Keep webpack 5 MF, eliminate all lazy chunks
Use the original shared config (which worked for nav), but prevent chunk 655 from being a separate file:
- Set `optimization.splitChunks: false` in webpack config
- Make extensions use synchronous imports wrapped in `Promise.resolve()`
- Bundle PF core directly instead of as a shared module fallback

### Approach C: Revert to working build, accept ChunkLoadError for now
Use the exact shared config from build 1. Nav item works. Clicking it crashes — but that's a separate issue to solve.

## Environment
- RHOAI 3.4.1, dashboard in `redhat-ods-applications`
- Plugin service: `hermes-deployer-hermes-agent-deployer` in `hermes-deployer`, port 8080
- Image: `image-registry.openshift-image-registry.svc:5000/hermes-deployer/hermes-agent-deployer:0.1.0`
- federation-config ConfigMap key: `module-federation-config.json`
- Operator must be stopped to prevent ConfigMap reconciliation

## Dashboard integration procedure (known working)
1. Stop the RHOAI operator (it reconciles federation-config)
2. Patch `federation-config` ConfigMap in `redhat-ods-applications`:
   ```bash
   oc get configmap federation-config -n redhat-ods-applications \
     -o jsonpath='{.data.module-federation-config\.json}' > /tmp/fed.json
   # Add plugin entry to the JSON array
   oc create configmap federation-config -n redhat-ods-applications \
     --from-file=module-federation-config.json=/tmp/fed-patched.json \
     --dry-run=client -o yaml | oc replace -f -
   ```
3. Restart dashboard: `oc rollout restart deployment/rhods-dashboard -n redhat-ods-applications`
4. Verify in logs: `Module federation configured for: ... hermesAgentDeployer`

## Plugin entry format
```json
{
  "name": "hermesAgentDeployer",
  "remoteEntry": "/remoteEntry.js",
  "authorize": false,
  "tls": false,
  "service": {
    "name": "hermes-deployer-hermes-agent-deployer",
    "namespace": "hermes-deployer",
    "port": 8080
  }
}
```

## Fix applied: Switch to @module-federation/enhanced

Implemented Approach A. Changes:

1. **`npm install @module-federation/enhanced`** — matches dashboard's runtime
2. **`config/webpack.common.js`** — switched to `require('@module-federation/enhanced/webpack')`, added `eager: true` on all shared modules
3. **`config/webpack.prod.js`** — disabled `splitChunks` (vendor chunks were getting blocked by OAuth gateway)
4. **`src/rhoai/extensions.ts`** — replaced dynamic `import()` of HermesDeployerPage with sync import + `Promise.resolve()` (eliminates lazy chunk for route component)
5. **`Containerfile`** — expanded nginx CORS to cover `__federation_expose_*.bundle.js` files

### Build output after fix
```
remoteEntry.js                           — 3.96 MiB (enhanced runtime + container)
__federation_expose_extensions.*.js      — 523 KiB  (extensions + page component)
__federation_expose_Icon.*.js            — 626 B    (nav icon)
main.*.js                                — 3.96 MiB (standalone mode only)
890.*.js                                 — 1.1 MiB  (bootstrap chunk, standalone only)
```

No numbered shared module fallback chunks (the root cause of ChunkLoadError).

### Status
- [x] Build succeeds
- [x] Container image builds
- [ ] Test in RHOAI 3.4 dashboard — deploy image, patch federation-config, verify nav + click

## Previous working webpack shared config (nav visible, click crashed)
```javascript
shared: {
  react: { singleton: true, requiredVersion: '^18' },
  'react-dom': { singleton: true, requiredVersion: '^18' },
  'react-router-dom': { singleton: true, requiredVersion: '^7' },
  '@patternfly/react-core': { singleton: true, requiredVersion: '^6' },
  '@openshift/dynamic-plugin-sdk': { singleton: true, requiredVersion: '^5' },
},
```
