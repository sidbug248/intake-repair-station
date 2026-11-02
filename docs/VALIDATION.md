# Validation record

This record distinguishes observed checks from supported behavior and untested deployment scenarios. The current release is 0.2.0; distribution is through the repository and local/offline builds, with the public demo paused.

## Version 0.2.0

| Gate | Observed result |
| --- | --- |
| Engine, formats, recipes, comparison, AI, and companion tests | 61 passed in the integrated Node.js run |
| Production and offline build | Passed; portable HTML generated successfully (473,254 bytes) |
| Browser workflows, accessibility, and responsive layout | 16 Chromium scenarios passed in the final integrated run |
| Paid or live-provider inference | Not run; provider HTTP responses are mocked in tests |
| Public hosted service | Paused; public signup/cloud deployment is outside this release |

The companion integration run requires loopback socket permission. A sandbox that blocks local listeners reports `listen EPERM`; that is not evidence that the service workflow passed or failed under its intended runtime. The recorded integrated service tests ran with local socket access.

### Consequential cases covered by automated tests

- UTF-8/BOM preservation, quoted delimiters, multiline cells, blank records, header mapping, parser limits, and explicit errors instead of partial imports.
- Preserved originals, correction approval invalidation, pending-export gates, complete row reconciliation, formula-safe generated CSV, and session restore.
- Custom recipes, optional roles, declarative rules, recipe storage without participant data, and backward-compatible CSV sessions.
- TSV and XLSX source retention; sheet selection; shared/inline/escaped strings; hidden/interior blank rows; cached-formula notices; malformed workbooks and unsupported structures.
- ZIP declared/actual expansion limits, inconsistent local metadata, false-small-size compression bombs, CRC failures, XML-depth bounds, and invalid Unicode rejection.
- Read-only version comparison, missing/duplicate-key ambiguity, structural column changes, and refusal to compare pending corrections.
- AI data scopes, task schemas, evidence references, bounded/grounded handoff facts, stale revisions, adapter request/response shapes, and secret-safe provider errors.
- SQLite persistence, workspace and role isolation, stale-write conflicts, token revocation, notifications, Host/Origin/token checks, and persistent request budgets.
- Explicit webhook preview/confirmation, reviewed-revision requirements, and absence of automatic delivery on save.
- Guided example through a complete handoff; reusable recipes; TSV/XLSX import-to-export paths; version comparison; local workspace conflicts and viewer access; reviewed AI mapping/rules; stale AI-result rejection.
- Offline HTML export with networking disabled, automated WCAG A/AA checks on the tested main views and record dialog, keyboard dialog behavior, and 390px layouts including all new tool screens.

These checks use fictional data. Provider/connector HTTP is mocked, so passing them does not certify every available model, a real external destination, or a provider account's configuration. No paid inference call or outbound user message is part of the recorded test run.

## Reproduce

Use Node.js 24 and run from the project folder:

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The test command covers the engine and local service modules. `npm run build` compiles the frontend and packages the offline HTML. Playwright normally launches its managed Chromium and a local preview server. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select a separately installed browser, and `TEST_BASE_URL` can target an existing local preview.

The GitHub workflow repeats automated tests, build/offline packaging, and browser checks. A local pass does not prove that the checks on a later remote commit passed; inspect that commit's CI result separately.

## Historical 0.1.0 baseline

The initial development release recorded 30 core/coordination tests, a passing production build, and seven browser workflow cases. Its CSV flow preserved a BOM/CRLF input byte for byte through the handoff and restored review/assignment state into another browser context. The offline fictional example exported with browser networking disabled. Automated accessibility checks found no WCAG A/AA violations in the tested views, and the 390px mobile layout and dialog keyboard behavior passed.

Those historical results describe the earlier build. They do not substitute for verification of the new recipe, workbook, comparison, and optional-service interface.

## Practical limits

The offline core and loopback companion are not a production Internet service. No Google/email signup, cross-device cloud sync, real-time simultaneous editing, verified-person identity, email delivery, source-fact verification, or tamper-proof audit guarantee is claimed.

Automated accessibility checks complement human and assistive-technology testing; they are not certification. Workbook support is bounded and does not reproduce every Excel feature. See [Formats and recipes](FORMATS_AND_RECIPES.md), [Local services](LOCAL_SERVICES.md), and [Architecture](ARCHITECTURE.md).
