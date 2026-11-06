# Relay Station architecture

Relay Station by Eternity Flux v0.3.0 has two explicit boundaries: a complete browser application and an optional loopback companion. The public deployment is paused; development and distribution use the repository, local builds, and the portable HTML application.

The primary interface follows four jobs: Start, Needs attention, What changed, and Handoff. Advanced tools contain recipe configuration, version comparison, AI, and optional saved workspaces. The fictional example opens the review directly with its known mapping. Issue cards provide the initial review view, while a table remains available for comparison across records.

## Modules

| Part | Responsibility |
| --- | --- |
| `src/pages/RelayStation.jsx` | Primary workflow, issue cards/table, review dialogs, filters, assignments, persistence, and handoff downloads |
| `src/components/` | Guided walkthrough, recipe editor, comparison, AI review, and local service interface |
| `src/lib/intake.mjs` | Strict delimited parsing, mapping, validation, correction overlay, exports, and session restoration |
| `src/lib/formats.mjs` | CSV/TSV/XLSX ingestion, bounded ZIP/XML reading, explicit worksheet selection |
| `src/lib/source.mjs` | Validated original TSV/XLSX metadata and byte-preserving original downloads |
| `src/lib/recipes.mjs` | Declarative rule validation, recipe serialization, and opt-in browser recipe storage |
| `src/lib/comparison.mjs` | Read-only comparison of reviewed datasets and reconciliation of ambiguous keys |
| `src/lib/coordination.mjs` | Assignments, editable local activity, restoration checks, and CSV reports |
| `src/lib/handoff.mjs` | Readable HTML handoff rendered from reviewed state without an AI request |
| `src/lib/ai.mjs` | Task scopes, schemas, grounded facts, evidence validation, and workspace revision checks |
| `src/lib/companion.mjs` | In-memory authenticated client for the optional loopback service |
| `server/store.mjs` | SQLite workspaces, token identities, membership, revision checks, service events, notifications, and request budgets |
| `server/companion.mjs` | HTTP routing, Host/Origin/token checks, request limits, AI and confirmed webhook operations |
| `server/providers.mjs` | Server-only provider configuration, bounded requests/responses, adapters, and secret-safe errors |
| `server/start.mjs` | Loopback startup, private data-directory setup, token-file creation, and shutdown |
| `scripts/build-offline-demo.mjs` | Bundles frontend assets into a portable HTML application |

React renders the interface; the review engine does not depend on React. `fflate` builds handoff ZIPs and supplies the streaming inflation primitive used by the checked workbook reader. No new dependency is required for the companion's HTTP, SQLite, crypto, or provider HTTP calls.

## Source, recipe, and correction state

A dataset retains its working CSV, original filename and headers, confirmed mapping, recipe, import time, and source cells. TSV/XLSX datasets additionally retain the exact original file bytes as bounded base64 metadata. The working CSV is identified separately from that original.

Source rows receive positional keys independent of business IDs, so duplicate or missing identifiers cannot collapse record identity. For text inputs, source-line references identify the beginning of a record. XLSX references identify the selected worksheet's original row number.

Corrections are an overlay keyed by row and column, each with a proposed value and approval state. Preview values can include proposals; reviewed exports use accepted corrections. Editing an approved proposal resets approval, and reverting to the source removes the correction.

Recipes define required canonical roles, allowed statuses, and bounded custom-column rules. They contain declarative data, not code, expressions, or executable regular expressions. The default recipe preserves the participant intake contract. A custom recipe may review another operational schema. Passing validation means passing the active recipe, not establishing factual truth.

Assignments remain independent of source and correction state. Owner, next action, due date, note, and follow-up status do not override validation. Browser activity remains editable session state and does not prove an external action occurred.

## Ingestion boundaries

Inputs must fit the documented byte, row, and column limits. Unsupported inputs fail before a partial dataset is accepted. TSV quoting follows the same strict parser with a tab delimiter. Workbooks require explicit sheet selection when more than one sheet exists.

The XLSX reader validates ZIP directory and local-header bounds, compression metadata, actual expansion, checksums, XML depth/node counts, and worksheet cell references. Inflation proceeds in bounded chunks. DTDs, external worksheet references, custom entities, and unsupported structures are not loaded. Hidden and blank rows remain represented.

Formula cells use stored results with a warning and never execute. Numeric display formats are not interpreted; the underlying number remains visible for review. See [formats and recipes](FORMATS_AND_RECIPES.md) for the precise contract.

## Review, comparison, and export invariants

1. Original source content remains available, including the full XLSX when only one worksheet is reviewed.
2. Every imported source row belongs to the ready or exception partition. No silent deletion, merge, or automatic deduplication occurs.
3. Pending corrections block reviewed handoffs. Original downloads and session backups remain available.
4. Source headers, order, and extra fields survive reviewed exports. Structural mismatches remain exceptions until repaired at the source.
5. Follow-up completion does not resolve a data defect or prove outreach happened.
6. Comparison uses accepted values and a chosen key. Duplicate/missing keys remain ambiguous, with all affected rows accounted for. It never transfers edits or merges reviews.
7. Generated CSV uses proper escaping and optional formula protection. The original is not sanitized or rewritten by that export option.
8. AI suggestions have no direct mutation, approval, messaging, or access-control authority.
9. The readable HTML handoff is also a reviewed export. It cannot bypass pending-correction gates or claim that assigning a task verifies data or delivers a message.

## Persistence

Core state lives in browser memory. Optional browser session persistence and separately saved recipes require user actions. Portable JSON backups include source, recipe, mapping, corrections, assignments, and events. Restore validates bounded structures and reconstructs the dataset; it replaces the current review rather than combining competing edits.

Version 0.3.0 changes the product identity without invalidating existing review data. Legacy session/protocol identifiers, compatible browser storage, and companion `INTAKE_` settings remain supported. The private companion storage location is documented in [Local services](LOCAL_SERVICES.md); a visible rename is not a reason to discard stored workspaces.

Optional companion saves rebuild the same validated snapshot before storing it in SQLite. Saves carry `expectedVersion`; a stale writer receives a conflict instead of overwriting a newer revision. The interface can reload or save a separate workspace. This is revision-based persistence, not real-time collaborative synchronization.

Browser storage, SQLite, and downloaded backups are not independently encrypted vaults. The companion requests private filesystem permissions where the operating system supports them. See [Security](../SECURITY.md).

## Optional service boundary

The companion binds only to `127.0.0.1`, checks loopback Host headers and allowed origins, and requires a bearer token for service routes except health. Browser tokens remain in memory. The service stores token hashes, scopes collaborator access to a workspace, and enforces owner/editor/viewer permissions. Tokens identify access authority, not verified people.

Service activity is stored separately from editable session activity and records token-attributed saved revisions and access changes. The notification inbox reports those service changes. It does not send email or calendar invitations.

Provider keys and connector secrets stay in the server environment. Public configuration returns permitted models and destination information, not credentials. AI requests are bounded, rate-limited, revision-tagged, and validated against task-specific schemas. Handoff prose is rendered from known facts selected by the model; other AI prose remains advisory and requires review. A stale result cannot be applied to a changed workspace.

The webhook path previews its exact payload, requires current saved revision plus explicit confirmation, and sends only through an editor/owner operation. Saving or importing never sends it automatically. Network errors do not trigger automatic retries.

Full setup, routes, and limitations: [Optional local services and AI](LOCAL_SERVICES.md).

## Network and distribution

The core has no analytics, remote fonts, account requirement, or automatic application-data uploads. Installing dependencies and obtaining the application may require a network connection; using the built offline core does not.

Connecting to the companion does not save the dataset or request inference. Explicit workspace saves send a snapshot to the local service. Explicit remote AI requests send their selected scope to the configured provider. A locally configured Ollama runtime can perform local inference; its cloud features must be disabled for local-only operation. Explicit connector delivery contacts the configured destination.

`npm run build` produces `dist/` and `release/relay-station.html`, carrying the MIT license and dependency notices. The portable HTML is also committed as a repository download. `npm run dev` and `npm run preview` bind to loopback; `npm run local` starts the local frontend and companion together. The portable HTML contains frontend code only; optional services require the separately running companion. The app does not use a service worker or promise PWA installation.

The data handoff is a separate export: `handoff.html` opens as a readable report without the app. The ZIP includes that report alongside source/review/assignment/session files. Downloading it individually uses `<source-stem>-handoff.html`. No AI request is needed to generate either form of the report.

There is no public registration, Google/email authentication, cross-device cloud synchronization, or production hosted service in this release. Do not expose the loopback companion by removing its origin/host/access checks.

## Reuse in a future application family

The review engine, task schemas, snapshots, and service interfaces are separated so a future combined application can reuse them. That future integration would need a shared identity model, explicit workspace authorization, migration/version compatibility, and deployment-specific operational controls. The current repository does not provide those hosted services or reserve features behind a mandatory account.

## Verification

Run `npm test` and `npm run build` after consequential engine or workflow changes. Run `npm run test:e2e` after installing Playwright Chromium. The companion integration tests need permission to bind a local loopback port; they mock upstream AI/connector HTTP.

Tests should preserve import bounds, exact originals, reviewed exports, session compatibility, ambiguous comparison behavior, access isolation, stale-write protection, AI scope/secret boundaries, and explicit connector delivery. Report observed results rather than inferring complete workflow correctness from a successful build. See [Validation](VALIDATION.md).
