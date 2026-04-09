# Dependency Upgrade Plan (Staged)

## Goal
Upgrade dependencies with low regression risk by splitting updates into controlled stages.

## Stage 1 - Backend security baseline (completed)
- Update Python dependencies in `requirements.txt` to current stable versions.
- Add Redis client dependency for shared quota/rate state.
- Verify all backend tests pass.

Applied versions:
- fastapi 0.135.3
- uvicorn 0.44.0
- httpx 0.28.1
- pydantic 2.12.5
- python-dotenv 1.2.2
- openai 2.31.0
- redis 5.2.1

## Stage 2 - Frontend patch/minor refresh (low risk)
Scope:
- Keep major versions unchanged.
- Refresh lockfile and patch/minor dependencies only.

Suggested process:
1. `npm install` in `synsoc-ai-frontend` to refresh lockfile under existing semver ranges.
2. Run checks:
   - `npm run type-check`
   - `npm run test`
   - `npm run build`
3. Smoke test:
   - `/simulate` flow
   - `/results` rendering
   - SSE stream path from pipeline endpoint

Rollback criteria:
- Build/runtime regressions in simulation or results pages.

## Stage 3 - Major upgrade wave (medium/high risk)
Target majors:
- `vite` 6 -> 8
- `zod` 3 -> 4

Pre-work:
1. Branch specifically for major upgrades.
2. Capture baseline test/build timings and bundle size.
3. Verify Node version compatibility with Vite 8 runtime requirement.

Execution:
1. Upgrade one major at a time.
2. Run full frontend checks after each major.
3. Validate dev server, build output, and route behavior.

Risk hotspots:
- Vite plugin behavior and build output assumptions.
- Zod API changes for schema parsing and error formatting.

## Stage 4 - Follow-up hardening
- Add automated dependency scanning in CI.
- Add scheduled monthly patch update window.
- Track dependency upgrades in changelog.
