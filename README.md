# Intake Repair Station

**Turn a messy operational list into a reviewed handoff—with the original intact and the unfinished work assigned.**

Intake Repair Station is a free, MIT-licensed workspace for people who inherit participant lists, enrollment exports, support requests, and other small operational files. It connects three questions: **Who needs attention? What changed? Who owns the next action?**

Import a CSV, TSV, or Excel worksheet. Apply a reusable review recipe, inspect the problems, approve corrections, and export both usable records and unresolved work. The core runs in your browser without an account, API key, or server. Optional local services add saved workspaces, scoped access, notifications, and AI using your own provider or local model.

**v0.2.0 distribution: source and local/offline builds. The public hosted demo is paused.**

**[Download the portable HTML app](https://github.com/sidbug248/intake-repair-station/raw/refs/heads/main/release/intake-repair-station.html)** · [Read the guide](docs/PRODUCT_GUIDE.md) · [Explore the architecture](docs/ARCHITECTURE.md)

![The local repair queue with fictional cohort records, data issues, and an assigned next action.](docs/images/workspace.png)

Read the [three-level product guide](docs/PRODUCT_GUIDE.md) for casual, operational, and technical explanations.

See the [version comparison preview](docs/images/version-comparison.png) for the new file-to-file review workflow.

## What you can do

| Capability | Useful behavior |
| --- | --- |
| **Review CSV, TSV, and XLSX** | Confirm column meanings; choose a worksheet explicitly; retain the original file. |
| **Save import recipes** | Reuse mappings, required fields, custom statuses, and declarative rules for other columns. |
| **Keep corrections deliberate** | Compare before and after; approve or undo proposals before the reviewed handoff. |
| **Assign unfinished work** | Record an owner, next action, due date, note, and follow-up status independently of data validity. |
| **Compare successive files** | See additions, removals, changes, and ambiguous identities without merging records. |
| **Prepare a complete handoff** | Export reviewed rows, exceptions, changes, assignments, activity, and a portable session. |
| **Use optional AI** | Ask for column matches, validation-rule drafts, grounded handoff summaries, issue explanations, next-action drafts, and advisory duplicate comparisons. |
| **Save through a local companion** | Use SQLite workspaces, revision checks, scoped viewer/editor tokens, service history, and a notification inbox. |

The app never silently drops a difficult row, merges identities, guesses an ambiguous date, or treats a completed follow-up as proof that the data is fixed.

## Run it locally

Install **Node.js 24**, then run these commands from the project folder:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. No environment file or service account is needed for the core workflow.

### A useful first run

Choose **Guided walkthrough** or **Try fictional example**. The example uses fictional people and email addresses.

1. Confirm the column mapping and open the repair queue.
2. Inspect a problem and stage a supported formatting correction or a value you have confirmed.
3. Give an unresolved record an owner and next action.
4. Compare proposed changes and approve or undo them.
5. Prepare the complete handoff ZIP and keep its session backup.

The default recipe checks ID, name, email, status, and start date. **Import recipes** lets you change required roles and statuses or add rules for other source columns. See [formats and recipes](docs/FORMATS_AND_RECIPES.md).

### Download or build an offline copy

The [portable HTML file](release/intake-repair-station.html) is included in this repository. Download it to your computer and open the saved `.html` file in a modern browser. If GitHub displays the source, use **Download raw file**. Opening the repository file view does not run the application.

To build that file from source:

```sh
npm run build
```

Open `release/intake-repair-station.html` in a modern browser. The single file contains the core application, its styles, and its icon. It works without a local server or network connection after the build. It does not include your current records; use **Save session backup** to carry those between copies.

The same build also produces `dist/` for local preview with `npm run preview`. Browser persistence for directly opened HTML files varies; a downloaded JSON backup is the portable way to resume a review.

### Optional local services and AI

To start the local app and companion together:

```sh
npm run local
```

Or keep `npm run dev` running and start only the companion in a second terminal:

```sh
npm run companion
```

The companion listens on `http://127.0.0.1:4317`. Its startup message identifies the private local access-token file. Enter the address and token in **Local services**. Connecting alone does not save a workspace or call an AI provider.

For AI, copy `.env.example` to `.env` and configure a supported provider/model. Adapters are included for OpenAI, Anthropic, an OpenAI-compatible endpoint, and local Ollama. Keep credentials in the companion environment; never use frontend `VITE_` variables for them.

**Remote BYOK still sends the selected scope to that provider.** Local Ollama can provide local inference when its cloud features are disabled. All AI suggestions remain reviewable; none can approve changes, merge records, send messages, or change access.

The companion also provides explicit SQLite saves, stale-version protection, workspace-scoped access tokens, a service notification inbox, and an optional handoff webhook. It is a loopback service, not public signup or cloud synchronization. Full setup and boundaries: [Optional local services and AI](docs/LOCAL_SERVICES.md).

## What a handoff contains

| File | Purpose |
| --- | --- |
| `original.csv`, `original.tsv`, or `original.xlsx` | The original input, preserved in its original format. |
| `working-source.csv` | The tabular representation of a TSV or selected XLSX worksheet; included for those formats. |
| `clean.csv` | Records passing the active recipe after approved corrections. |
| `exceptions.csv` | Unresolved records, issues, and original/reviewed values. |
| `all-reviewed-rows.csv` | Every source row, in order, with approved corrections. |
| `change-log.csv` | Approved differences from the source. |
| `assignments.csv` | Owners, next actions, due dates, notes, and follow-up statuses. |
| `activity.csv` | Recorded browser-workspace actions. |
| `session.json` | A portable review backup, including recipe and source. |
| `README.txt` | How to interpret the package. |

Pending corrections block reviewed exports. The original and session backup remain available while work is unfinished. Ready rows plus exception rows account for every imported record.

“Ready” means the active checks pass. It does not establish identity, eligibility, source accuracy, or email deliverability. [CSV checks and exports](docs/CSV_FORMAT.md)

## Data boundaries and limits

- **Core mode:** files stay in the browser; no telemetry, automatic uploads, accounts, or AI calls.
- **Browser saving:** optional and specific to that browser profile. Backups are ordinary unencrypted files.
- **Companion mode:** only an explicit save sends a workspace to the local SQLite service. Tokens are held in browser memory; provider keys remain server-side.
- **AI or connector use:** inspect the data scope and destination before explicitly sending it. These optional actions may contact a remote service.
- **Input limits:** 1,000,000 bytes, 2,000 data rows, and 30 columns. Limits fail clearly rather than truncate data.

XLSX imports do not execute formulas or interpret numeric display formats. Cached formula results can be stale, Excel serial dates need confirmation, and merged cells must be unmerged before import. The full workbook remains in the original download. See the complete [format contract](docs/FORMATS_AND_RECIPES.md).

Entered owners and local activity are coordination aids. Companion access tokens identify an authorized credential, not a verified person. Neither history is a tamper-proof audit system. Google/email signup, cross-device cloud sync, and real-time shared editing are not part of this release.

## Engineering and verification

The frontend is React/Vite. Parsing, validation, review state, recipes, comparison, and AI schemas are independent JavaScript modules. The optional companion uses Node.js built-in HTTP, SQLite, and crypto modules; it is not bundled into the offline app.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The unit/integration suite covers source preservation, review gates, parser limits, hostile workbook inputs, comparison ambiguity, AI schemas, secret-safe provider failures, workspace isolation, stale saves, revocation, and connector confirmation. Provider responses are mocked; passing these tests is not a live-provider certification. Browser tests exercise the actual import-to-export workflow. See [validation](docs/VALIDATION.md) and [architecture](docs/ARCHITECTURE.md).

## Contribute

Useful contributions include clearer validation messages, supported format edge cases, accessibility improvements, and carefully bounded workflow features. Read [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md). The [examples](examples/) directory contains fictional data for development.

## License and author

Available under the [MIT License](LICENSE). Dependencies retain their own licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md). Production and portable builds include the applicable notices.

Created by [Mohsin Siddiqi](https://mohsinsiddiqi.nyc). The Eternity Flux identity assets and editable Figma source are documented in [Branding](docs/BRANDING.md).
