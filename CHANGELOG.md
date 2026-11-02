# Changelog

## Unreleased

### Identity and documentation

- Replaced the placeholder EF mark with an original ouroboros monogram and matching favicon.
- Added editable vector artwork, a Figma source link, brand usage notes, and a three-level product guide.
- Refreshed the repository workspace screenshot without changing the CSV or session formats.

### Added

- Local CSV import with confirmed source-column mapping and preservation of original headers and values.
- Checks for missing fields, duplicate IDs, email format, recognized statuses, calendar dates, and uneven rows.
- Reviewable formatting suggestions and explicit approval or undo for proposed corrections.
- Per-record owners, next actions, due dates, notes, and follow-up statuses.
- A local activity history with timestamps, action descriptions, and a default **You** label.
- Individual CSV reports and a ZIP containing the source, reviewed rows, exceptions, changes, assignments, activity, and session backup.
- Portable JSON session backup and restore, plus optional persistence in the current browser profile.
- A build command for creating a portable HTML copy of the application.
- Fictional examples, input-format documentation, and contribution guidance.

### Scope

- UTF-8 comma-separated CSVs up to 1,000,000 bytes, 2,000 data rows, and 30 columns.
- No automatic deletion, merging, date inference, authenticated collaboration, or application-data uploads.
