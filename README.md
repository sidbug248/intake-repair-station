# Intake Repair Station

**Review a messy intake CSV. Make deliberate corrections. Give every unresolved record a clear next step.**

Intake Repair Station is a free, open-source workspace for people who inherit participant lists, enrollment exports, or other small intake files. It finds common data problems, keeps the original intact, and helps you prepare a handoff that includes both ready records and the work still to do.

Everything runs in your browser. There is no account, backend, AI service, or subscription to configure.

![The repair queue with fictional cohort records, visible data issues, and a waiting follow-up for Dana Vale assigned to Intake coordinator.](docs/images/workspace.png)

## A useful first run

Choose **Try fictional example** to explore a small training cohort with duplicate IDs, missing information, inconsistent formatting, and dates that need confirmation. The names and email addresses are fictional.

1. Confirm which source columns represent **ID, name, email, status, and start date**. Your source headers stay as they are.
2. Open the **Repair queue** and review a record. Use a confirmed source value or stage a suggested formatting correction.
3. Give an unresolved record an **owner and next action**. Add a due date and mark the follow-up Open, Waiting, or Action complete.
4. In **Review changes**, compare the original and proposed values. Approve or undo the corrections.
5. In **Export handoff**, download the ready rows, exceptions, or a ZIP containing the complete handoff.

An unresolved record remains in the exception file. Marking its follow-up Action complete does not make its data pass validation.

## Run it locally

Use **Node.js 22.12.0 or newer** and npm. The `.nvmrc` file selects Node.js 24 if you use nvm. Run these commands from the project folder:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. To check the data engine and create a production build:

```sh
npm test
npm run build
```

The built application is in `dist/`. Use `npm run preview` to inspect that build locally. It can be served by a static web host; it does not need a server-side application or database. See [Architecture](docs/ARCHITECTURE.md) for the implementation and deployment boundaries.

### Run the browser checks

Install the Chromium browser used by Playwright, build the app, then run:

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

The test configuration starts a local preview server automatically. On a Linux machine missing browser system libraries, use `npx playwright install --with-deps chromium` to install those dependencies as well. See the [release-candidate validation record](docs/VALIDATION.md) for the checks actually performed.

### Make a portable copy

The production build also creates a portable copy. To regenerate it from the current build, run:

```sh
npm run demo:offline
```

This bundles the application into `release/intake-repair-station.html` and includes a copy at `dist/intake-repair-station.html` for hosted downloads. Open the file in a modern browser to use it without a local server. It contains the application, not your current review; use **Save session backup** to carry your records and progress between copies. Browser persistence for directly opened files can vary, so a JSON backup is the portable way to continue your work.

## What it checks

| Check | What happens |
| --- | --- |
| Missing required values | The record stays in the queue until you supply a confirmed value. |
| Duplicate IDs | Every affected record is flagged. No record is deleted or merged. |
| Email format | The app checks a simple address pattern. It cannot confirm that a mailbox exists. |
| Status values | The expected values are `pending`, `active`, `completed`, `on_hold`, and `withdrawn`. |
| Dates | A start date must be a real calendar date in `YYYY-MM-DD` format. Ambiguous dates need your judgment. |
| Formatting | Outer whitespace, email-domain casing, and the casing or separators of recognized statuses can be proposed for review. |
| Uneven rows | Rows with too few or too many cells stay visible as exceptions. Repair their structure in the source CSV and reimport it. |

Suggestions are proposals. They do not change the imported source or bypass approval. Status synonyms such as `complete` need individual confirmation, and the app never chooses an interpretation of an ambiguous date.

## Keep the source and the handoff together

The handoff ZIP contains:

| File | Purpose |
| --- | --- |
| `original.csv` | The unchanged imported CSV text. |
| `clean.csv` | Rows that pass the app's current checks after approved corrections. |
| `exceptions.csv` | Unresolved records, their issues, and their original and reviewed values. |
| `all-reviewed-rows.csv` | Every source record in original order, with approved corrections applied. |
| `change-log.csv` | The original and reviewed value for each approved correction. |
| `assignments.csv` | Record references, owners, next actions, due dates, and follow-up statuses. |
| `activity.csv` | Actions recorded in this local workspace. |
| `session.json` | A portable backup for continuing the review. |
| `README.txt` | A short explanation of the handoff files. |

You can also download the CSV reports individually. Pending corrections block the reviewed exports until you approve or undo them. The original and a session backup remain available while a review is in progress.

The clean file and the exception file account for every imported record. “Clean” means that the record passes these checks; it does not certify that the underlying information is true.

## Your data, on your device

- The application reads and processes your CSV locally. It does not upload file contents, send them to an AI model, or collect analytics.
- A hosted copy still downloads its application assets from the host. Local processing does not mean that loading a website creates no network traffic.
- Work is held in the current tab by default. Download a **session backup** before closing or refreshing if you want to continue later.
- **Remember on this device** stores a session in this browser profile. Other people with access to that profile may be able to read it. Browser storage is not an encrypted vault or a backup service.
- A JSON backup includes the original data, corrections, assignments, and recorded activity. Treat it with the same care as the source file.
- Owner names are labels you enter. Activity records local actions and timestamps using a default **You** label. There are no authenticated user accounts, shared live workspaces, or tamper-proof audit records.

Spreadsheet formula protection is enabled by default for generated CSVs. It prefixes formula-like values with an apostrophe. This changes the exported representation of those cells; the unchanged original download is not transformed. See [CSV format and exports](docs/CSV_FORMAT.md) for details.

## Supported files and limits

The first version accepts **UTF-8, comma-separated CSVs up to 1,000,000 bytes, 2,000 data rows, and 30 columns**. It supports quoted commas, escaped quotes, multiline fields, LF/CRLF line endings, and a UTF-8 byte-order mark. Extra source columns are retained.

Malformed quotes and invalid UTF-8 are rejected rather than silently repaired. Excel workbooks, tab-separated files, cross-file matching, automatic deduplication, and automatic date conversion are outside this version's scope.

See [CSV format and exports](docs/CSV_FORMAT.md) for field definitions, edge cases, and example inputs. The [examples](examples/) directory contains fictional CSVs you can use without sharing real records.

## Contribute

Small, well-explained fixes are welcome. A useful contribution might improve a confusing validation message, add a parser regression case, or make a keyboard interaction easier to use.

Read [Contributing](CONTRIBUTING.md) for the development workflow and [Security](SECURITY.md) for reporting a sensitive issue.

## License and author

Intake Repair Station is available under the [MIT License](LICENSE). You can use, modify, and redistribute it under those terms. Dependencies retain their own licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md). Production and portable builds include the applicable notices.

Created by [Mohsin Siddiqi](https://mohsinsiddiqi.nyc).
