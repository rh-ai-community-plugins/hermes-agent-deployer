# Changelog

## 0.2.0 (Unreleased)

Complete rewrite to align with the [hello-world](https://github.com/rh-ai-community-plugins/hello-world) reference plugin.

### Changed

- Switched Module Federation from `@module-federation/enhanced` to standard webpack 5 `ModuleFederationPlugin`
- Rewrote extensions.ts to match community plugin pattern (shared section + area + section + nav + route)
- Refactored API logic into React hooks (`useInstances`, `useNamespaces`, `useInstanceDefaults`, `useInstanceMutation`)
- Restructured source layout: pages in `src/app/pages/`, hooks in `src/app/hooks/`
- Rewrote Containerfile to use UBI9 nginx-124 runtime
- Renamed Helm chart to `hermes-agent-deployer-chart`
- Updated all tests from `*.test.ts` to `*.spec.ts` convention

### Added

- BFF service for server-side instance listing aggregation
- Shared community plugin components (CommunityBanner, CommunityNavIcon)
- Makefile with unified build targets
- CI workflows (`.github/workflows/ci.yml`, `build-push.yml`)
- Build scripts (`build-push.sh`, `scan-image.sh`, `sync-chart-version.js`)
- Comprehensive test suite (67 tests)
- Documentation in `docs/`

### Removed

- `@module-federation/enhanced` dependency
- Client-side N+1 namespace scanning (moved to BFF)
- Orphaned InstanceDetail component
- Dead code: `utilities.ts`, `CommunityPluginsIcon.tsx`, `stylePaths.js`

## 0.1.0

Initial release. Frontend-only plugin with client-side K8s API calls.
