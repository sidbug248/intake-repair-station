# Changelog

## 0.2.0

### Added

- Guided walkthrough and workflow help for completing a first fictional handoff.
- TSV and XLSX import, explicit worksheet selection, import notices, and preservation of the original input bytes alongside the working CSV.
- Bounded workbook ZIP/XML parsing with size, checksum, cell-reference, and Unicode checks; unsupported structures fail without partial import.
- Reusable mapping and validation recipes, custom required roles/statuses, and declarative rules for arbitrary source columns.
- Recipe JSON import/export and explicit browser recipe storage without participant records.
- Read-only comparison of successive imports, including added, removed, changed, unchanged, and ambiguous groups, plus CSV reports.
- Optional local Node.js/SQLite companion with explicit workspace saves, revision-conflict protection, token-scoped viewer/editor access, revocation, service history, and notifications.
- Optional AI adapters for OpenAI, Anthropic, OpenAI-compatible services, and local Ollama; model allowlists, request budgets, bounded schemas, evidence checks, and stale-result rejection.
- Reviewed AI tasks for column mapping, grounded handoff summaries, issue explanations, next-action drafts, and advisory duplicate comparisons.
- Optional handoff webhook with payload preview, current-revision confirmation, access checks, optional HMAC signing, and no automatic delivery or retry.
- Expanded documentation, meaningful parser/service/AI regression cases, and updated workflow screenshots.

### Changed

- Distribution now focuses on the public repository, local development, and portable offline builds. The public hosted demo is paused.
- Session backups include the active recipe and original TSV/XLSX metadata while retaining support for older version-1 CSV backups.
- Handoff ZIPs identify the actual original format and include a separate working-source CSV for TSV/XLSX inputs.
- Privacy descriptions distinguish browser-only work, explicit local service saves, remote inference, and connector delivery.

### Boundaries

- The no-account core remains complete without the companion or AI.
- No public signup, Google/email authentication, cross-device cloud sync, or real-time shared editing is enabled.
- Local access labels identify credentials, not verified people; activity is not tamper-proof.
- Workbook formulas are not recalculated, numeric display formats are not guessed, and no automatic identity merge or date inference occurs.
- Provider integration tests use mocked HTTP responses; no live paid inference is claimed by this release's test record.

## 0.1.0

### Initial workflow

- CSV import with confirmed column mapping and preservation of headers, source values, and extra columns.
- Missing-value, duplicate-ID, email-format, status, calendar-date, formatting, and uneven-row checks.
- Staged corrections with explicit approval/undo, separate owners/next actions, local activity, and complete handoff exports.
- Portable JSON backup/restore, optional browser persistence, and a standalone HTML build.
- Fictional examples, MIT licensing, dependency notices, editable EF identity assets, and a three-audience product guide.
