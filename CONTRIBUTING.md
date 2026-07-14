# Contributing

## Getting Started

```bash
npm install
npm run start:dev    # Frontend on port 9112
cd bff && npm install && K8S_API_BASE=$(oc whoami --show-server) npm run start:dev  # BFF on port 3000
```

See [docs/development/LOCAL_SETUP.md](docs/development/LOCAL_SETUP.md) for full setup details.

## Before Submitting

```bash
make validate    # lint + typecheck + tests for frontend and BFF
```

Or individually:

```bash
npm run lint
npm run typecheck
npm test
cd bff && npm run validate
```

## Conventions

- **Tests**: `*.spec.ts` / `*.spec.tsx` (frontend), `*.test.ts` (BFF)
- **Components**: PatternFly 6
- **Hooks**: Custom React hooks in `src/app/hooks/` for all API state
- **[SHARED] components**: `CommunityNavIcon` and `CommunityBanner` are identical across all community plugins — do not modify
- **K8s resource naming**: Instance `foo` → resources prefixed `hermes-foo`
- **Container images**: UBI9 base, non-root UID 1001, port 8080 (frontend) / 3000 (BFF)

## Project Structure

See [docs/development/PROJECT_LAYOUT.md](docs/development/PROJECT_LAYOUT.md).
