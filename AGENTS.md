# Working on Intake Repair Station

Keep the workflow understandable: import, inspect, stage corrections, review,
assign unresolved next actions, and export a complete handoff.

- Preserve the original source and every source row. Never silently truncate,
  drop, merge, or deduplicate records. TSV/XLSX originals remain separate from
  their working CSV representation.
- Corrections require explicit review. Ownership or follow-up completion does
  not imply that a data issue is fixed or an external action occurred.
- Do not infer ambiguous dates, identities, contact outcomes, or missing values.
- Keep the core complete in the browser without accounts, uploads, tracking,
  remote fonts, AI, or paid services. Recipes are declarative data, not code.
- Optional opt-in companion features are authorized: local SQLite saves,
  revision checks, token-scoped access, service notifications, reviewed AI
  suggestions, and explicitly confirmed webhook delivery. Connecting alone
  must not save records or send requests to an AI provider or connector.
- Bind the companion to loopback. Preserve Host/Origin/token checks, role and
  workspace isolation, bounded inputs, and stale-version rejection. Do not
  describe local tokens as verified identity or real-time cloud collaboration.
- Keep provider keys and connector secrets server-side and out of bundles,
  browser storage, logs, session backups, exports, and Git. Remote AI must show
  its selected data scope and destination before an explicit request.
- AI has no approval, direct-edit, merge, messaging, or permission authority.
  Validate task schemas and evidence; reject stale results before applying them.
- Keep the engine independent of React. Cover consequential parser, review,
  access, persistence, AI, and delivery behavior with meaningful tests.
- Verify `npm test` and `npm run build` for consequential changes. Browser-check
  changed workflows; report only checks actually run. Mock provider calls in CI.
- Distribution is repository/local/offline only while the public deployment is
  paused. Do not re-enable public hosting without an explicit user request.
- Document format changes and limits. Demo records must remain fictional.
- Preserve the MIT license and notices required by third-party dependencies.
