# Security and data handling

Intake Repair Station processes files in the browser. It has no application backend, login service, AI integration, or analytics collection. A hosted copy still loads static assets from its host.

## Understand the local workspace

The source CSV, corrections, assignments, and activity are held in the current tab. **Remember on this device** can save them in browser storage. A **session backup** saves the same kind of information in an ordinary JSON file.

Neither browser storage nor a downloaded backup is an encrypted data vault. People with access to your browser profile or files may be able to read them. Clearing the workspace removes its saved browser session; it does not delete downloads or copies you have already shared.

Owner names are entered labels. Recorded actions use timestamps and a default **You** label. There is no authentication or independent identity verification, and the activity log is not tamper-proof.

## CSV exports

Formula protection is enabled by default for generated CSVs. It prefixes formula-like cell values with an apostrophe. Spreadsheet programs and their import settings differ, so this is a precaution rather than a guarantee about every spreadsheet workflow.

The unchanged original download and session backup retain source values. Only open files from sources you trust, and review how the receiving system interprets them. See [CSV format](docs/CSV_FORMAT.md#spreadsheet-formula-protection).

## Report a vulnerability

If this repository has GitHub private vulnerability reporting enabled, use **Security → Report a vulnerability**. If that option is unavailable, open an issue titled **Request for private security contact**, without exploit details or sensitive data, so the maintainer can arrange a private channel.

A helpful private report includes the affected version or commit, reproduction steps using fictional records, the impact, and any suggested fix. Please do not include real intake files, account credentials, or other people's personal information.

This is an independently maintained project with no guaranteed security-response time. Check the changelog and available updates before deploying a copy for others.
