# Relay Station security and data handling

Relay Station by Eternity Flux v0.3.0 provides a complete browser core and optional local services. The public hosted deployment is paused. Importing and reviewing a file does not automatically start a service, upload data, or call an AI model.

## Core workspace

Source files, corrections, assignments, and local activity live in the current tab. **Remember on this device** can store a session in that browser profile. Saved recipes contain configuration rather than record rows. A session backup includes the actual source data, review state, and activity; for XLSX it includes the entire original workbook, including unselected or hidden sheets.

Browser storage and downloaded backups are not encrypted vaults. Clearing the browser workspace does not retrieve downloads or copies already shared. Local owner names are entered labels, and browser activity is editable session data rather than independently verified history.

The readable `handoff.html` report is an ordinary data file. It can include record names, unresolved issues, approved values, and owner/action text. The recipient does not need Relay Station to read it; choose a recipient with the same care as for the data bundle. Preparing the report does not send it anywhere.

## Optional companion

The companion binds to loopback, checks Host and allowed Origin values, and requires bearer-token access. It does not provide Internet signup, Google OAuth, email/password recovery, or a production multi-tenant service. Do not remove these controls to expose it publicly.

The owner can create workspace-scoped viewer/editor credentials. Copying a token transfers its authority; a collaborator's label is not verified identity. Revoke credentials no longer needed. Tokens remain in browser memory, and the server stores their hashes. Saved workspace snapshots are reconstructed through the same validation used for backups. Revision checks reject stale overwrites.

SQLite data is not independently encrypted. The startup script requests owner-only permissions for its private directory and files where supported; machine-account and disk protections still matter. Keep that directory and `.env` out of Git. Provider credentials belong only in the companion environment, never in frontend `VITE_` variables, source code, browser persistence, session backups, or exports.

## AI and connectors

AI is optional. Remote provider requests transmit the explicitly selected scope to that provider; supplying your own key does not make the request offline. Use a local inference runtime with its cloud features disabled when local-only inference is required.

Requests and responses are bounded. Provider selection comes from server configuration, evidence references are checked, and stale results are rejected before use. AI cannot approve data changes, merge records, execute code, send messages, or manage access. Model-generated explanations and next actions still require human judgment.

The handoff webhook is also optional and explicit. Its preview shows the payload and destination. It requires a reviewed saved revision and editor/owner confirmation. Import, save, and AI responses do not trigger delivery. A failed delivery response may still mean the destination received the request; there is no automatic retry.

The service does not log raw prompts or provider responses, and upstream errors are sanitized. Request/output allowances are not a dollar-denominated billing cap; use provider billing controls as well. See [Local services](docs/LOCAL_SERVICES.md).

## File handling and exports

Imports have byte, row, column, and parser limits. Workbook extraction checks ZIP sizes/checksums and bounded inflation; XML entities, external worksheet references, and executable formulas are not loaded. Saved formula results can be stale. Original source files remain unchanged and can contain content the app does not execute, including workbook content outside the selected worksheet.

Generated CSV formula protection prefixes formula-like values with an apostrophe by default. Receiving spreadsheet applications differ, so this is a precaution rather than a universal guarantee. The unchanged original and JSON backup retain source values. See [CSV exports](docs/CSV_FORMAT.md#spreadsheet-formula-protection).

## Report a vulnerability

If GitHub private vulnerability reporting is enabled, use **Security → Report a vulnerability**. If unavailable, open an issue titled **Request for private security contact**, without exploit details or sensitive data, so the maintainer can arrange a private channel.

A useful private report includes the affected version/commit, steps using fictional records, impact, and a suggested fix if available. Do not include real intake files, credentials, or other people's personal information.

This is an independently maintained project with no guaranteed response time. Consult the changelog and test results when updating a copy.
