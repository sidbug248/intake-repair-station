# Working on Intake Repair Station

Keep the core workflow understandable: import, inspect, stage corrections, review,
assign unresolved next actions, and export a complete handoff.

- CSV input and the source rows are preserved. Never silently drop or merge a row.
- Corrections require explicit review. Ownership does not imply a data issue is fixed.
- Do not infer ambiguous dates, identities, contact outcomes, or missing values.
- Processing remains in the browser. Do not introduce uploads, tracking, remote fonts,
  authentication, or paid service requirements into the core workflow.
- Keep core CSV logic independent of React and cover consequential behavior with tests.
- Verify `npm test` and `npm run build` for changes to the engine or user workflow.
- Document format changes and limitations. Demo records must remain fictional.
- Preserve the MIT license and notices required by third-party dependencies.
