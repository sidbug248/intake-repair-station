# Architecture

Intake Repair Station is a static React application built with Vite. Its data engine is a separate JavaScript module that can be tested without a browser or React.

## Where the work happens

| Part | Responsibility |
| --- | --- |
| `src/pages/IntakeRepair.jsx` | Import, mapping confirmation, queue, correction review, assignments, activity, browser persistence, and downloads |
| `src/lib/intake.mjs` | UTF-8 decoding, strict CSV parsing, mapping, validation, staged changes, CSV exports, and session serialization |
| `src/lib/coordination.mjs` | Assignments, local activity, validation of saved coordination data, and the related CSV reports |
| `src/lib/intake.test.mjs` | Engine behavior and regression cases, run with the Node.js test runner |
| `tests/coordination.test.mjs` | Assignment, activity, and coordination-restoration behavior |
| `tests/browser/` | Browser workflow checks run with Playwright |
| `src/pages/intake-repair.css` | Responsive workspace styling and interaction states |
| `src/App.jsx` | Application entry component |
| `scripts/build-offline-demo.mjs` | Bundles built assets into a portable HTML application |
| `scripts/third-party-notices.mjs` | Generates notices for production dependencies |
| `scripts/package-static.mjs` | Includes license files in the static distribution |

React renders the workspace. CSV processing does not depend on React. ZIP files are assembled in the browser with `fflate`.

## Data model

The imported dataset retains the original CSV string, source filename, original headers, confirmed column mapping, and each row's original cells and source line. A stable key identifies the source row within that import; it does not depend on the record's business ID, which may be missing or duplicated.

Corrections are stored separately by source-row key and column index. Each correction has a proposed value and an approval state. The current preview is derived by applying proposals to a copy of the original cells. Exported reviewed values use approved corrections.

Assignments are separate from corrections and source records. Each assignment contains an entered owner, next action, optional due date and note, and a follow-up status. Changing an assignment never fixes or suppresses a validation issue.

The activity list records actions performed in the workspace. It is local application state, with timestamps, action descriptions, and a default `You` actor label. The data model supports actor labels, but the interface has no reviewer identity field. This is not an identity system, an independently verified audit log, or a record protected against editing.

## Review and export invariants

Changes should preserve these behaviors:

1. Imported source text and original row values remain available throughout the review.
2. Parsing either succeeds within the documented limits or reports an error. It does not import only the first part of an oversized file.
3. All source records are accounted for as ready rows or exceptions. No automatic deletion, merge, or deduplication occurs.
4. Suggested corrections remain visible proposals until approved. Changing a proposal's value removes its previous approval.
5. A pending proposal blocks generated handoff exports. Users can still save the unchanged original and a session backup.
6. A structural row mismatch remains an exception until the source is corrected and reimported.
7. Source headers, column order, and extra fields survive reviewed exports.
8. An assignment's status and a record's validation status remain independent.

The word “clean” in an export means only that the app's defined checks pass. Validation does not establish source accuracy, contactability, identity, or eligibility.

## Persistence and restoration

An active review lives in memory by default. Optional browser storage serializes the session for that browser profile. A downloaded JSON snapshot provides a portable way to resume it elsewhere.

The session includes the raw source, mapping, corrections, assignments, and events. Restoration rebuilds the dataset and validates the saved structure rather than treating a backup as executable instructions. Restoring replaces the active review; it does not combine independent edits or resolve collaboration conflicts.

Browser storage is local convenience, not durable shared storage. It may be unavailable, cleared by the browser, or accessible to other people using the profile. A downloaded backup is an ordinary unencrypted file.

## Network boundary

The application has no data API, backend, authentication service, AI calls, or analytics. CSV contents are processed in the browser and exported through browser downloads. No application operation uploads the imported data.

A hosted deployment serves JavaScript, CSS, and other static assets. The host may receive ordinary page requests and keep its own access logs. That network traffic is distinct from transmitting the CSV, but it is why the product describes its processing as local rather than claiming that a hosted page never contacts a server.

The production build is the `dist/` directory. Serve it as static files. No environment variable containing an API key or service credential is required. Installing dependencies and obtaining the application initially may require network access.

After a build, `npm run demo:offline` embeds the JavaScript, stylesheet, and icon into `release/intake-repair-station.html`. This portable copy can be opened directly in a browser without a local server. It does not include a user's workspace. Session backups provide the portable data layer; persistence for `file:` pages is browser-dependent. The project does not use a service worker or promise PWA installation.

The build process carries the application license and production dependency notices into the static distribution. The portable HTML retains these notices as well.

## Why the first version is bounded

The app handles a small, explicit intake contract: ID, name, email, status, and start date. Column mapping accommodates existing source headers without turning the first version into an arbitrary rule-builder.

Limits of 1,000,000 bytes, 2,000 data rows, and 30 columns keep the workflow focused on small operational files. Cross-file identity matching, inferred values, spreadsheet formulas, automatic date conversion, shared accounts, and multi-user synchronization are separate product and engineering problems.

## Verification

Run `npm test` for the engine suite and `npm run build` to compile the application. Behavioral checks should cover parsing and limits, mapping, source preservation, staged approvals, reconciliation, export escaping, and session restoration.

The browser suite runs with `npm run test:e2e` after `npm run build`. Install Chromium first with `npx playwright install chromium`. Playwright starts a preview server at `http://127.0.0.1:4173`; set `TEST_BASE_URL` to target a server you already run instead.

UI changes also need a browser pass through import, keyboard navigation, record editing, approval, assignment, restore, and download. Record the checks actually performed in the pull request; a passing build alone does not verify the complete user workflow.
