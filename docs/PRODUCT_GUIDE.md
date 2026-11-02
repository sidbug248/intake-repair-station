# Product guide: three ways to understand the app

This guide describes the current implementation. It uses one fictional training-program example at three levels of technical detail. Accounts, AI, cloud storage, and shared workspaces are future possibilities, not current features.

## Level 1 — Casual: “Help me understand this from zero”

**It helps you turn a messy list of people into a clear, reviewed list—and makes sure the unfinished work does not get forgotten.**

Imagine you run a training program. Someone sends you a spreadsheet of participants. One person has a missing ID. Two different people share an ID. An email address looks wrong. A date could mean November 6 or June 11. You need to prepare a useful list for the next person without accidentally deleting anyone or making up information.

The app gives you a place to work through that list carefully.

### 1. Bring in the list

The current version opens a **CSV**. That is a simple spreadsheet-like file: it stores rows and columns of text, without Excel's colors, formulas, or multiple tabs. You can export a sheet as CSV from spreadsheet software, choose that file in the app, or paste its CSV text. You can also try the built-in fictional example first.

Right now, each list needs columns for a person's ID, name, email, status, and start date. Extra columns, such as notes, come along too.

### 2. Tell the app what the columns mean

Your spreadsheet might say “Full name,” while another spreadsheet says “Participant name.” You choose which column contains each kind of information. The app can suggest some matches, but you confirm them. This does not rename or rearrange your original file.

### 3. See what needs attention

The app points out things such as missing information, repeated IDs, a badly formatted email address, inconsistent status wording, or a date that needs checking. You can search the list and filter it to find unresolved records, duplicates, waiting follow-ups, and problems without an owner.

For example, the fictional Dana Vale and Eli Hart share an ID. Dana also has the date `11/06/2026`. The app flags those issues. It does not decide that Dana and Eli are the same person, delete one of them, or guess which date Dana meant.

### 4. Review simple tidying and enter information you have confirmed

Some fixes are straightforward: removing extra spaces around a name or turning the status ` Active ` into `active`. The app offers these as proposed corrections.

Other fixes require a person to check the source. If a participant's ID is missing, the app cannot know the real ID. Someone must find it. Once you have confirmed the information, you can enter the correction.

### 5. Give unfinished work a person and a next step

For Dana, you could enter:

- Owner: **Intake coordinator**
- Next action: **Confirm Dana's source ID and intended start date**
- Status: **Waiting**
- Due date: an optional date you choose

That records who should handle the question. It does not email that person or automatically put a task in their calendar. At present, it is a clear note attached to the record and included in the handoff.

Marking the follow-up “Action complete” does not make an incorrect date suddenly valid. The information itself still has to be corrected.

### 6. Approve the changes

The app shows the old and proposed values side by side. You approve the changes you mean to keep or undo the ones you do not want. The original stays available.

You cannot export a reviewed handoff while corrections are still waiting for a decision. You can always save the original file or a backup of your work.

### 7. Take the finished work with you

You can download the rows that pass the checks, the rows that still need attention, or one ZIP—a package containing all the related files.

The package includes the original list, reviewed results, unresolved problems, changes, owners and next actions, activity, and a backup that can reopen the work later. Nobody quietly disappears just because their information is difficult.

In the built-in 12-person example, approving four simple formatting corrections produces **six ready records and six records that still need attention**. All 12 remain accounted for.

### 8. Save before you leave

Your work lives in the current browser tab by default. Save a session backup if you want to continue later. You can also choose **Remember on this device**, which saves in that browser profile. It is not a shared team account or an online backup.

The website runs the work on your device. Your CSV is not uploaded by the app. The downloadable HTML copy can also run without an internet connection after you have downloaded it.

**A short version you can say aloud:** “It helps people clean up messy participant lists without losing anyone. You review the fixes, assign the unanswered questions, and hand over both the usable data and a clear list of what still needs doing.”

## Level 2 — Hybrid: “Give me the product and workflow, with some technical context”

**It is a browser-based CSV review and handoff workspace for small operational datasets.** It combines data checks, human approval, and follow-up ownership in one workflow.

Think of a program coordinator receiving a participant export before enrollment or onboarding. The file may contain duplicate IDs, missing values, status variants, and ambiguous dates. The goal is to prepare a reliable handoff while keeping the source and unresolved work traceable.

The workflow is:

1. **Import and map.** Open or paste a UTF-8 CSV and map its columns to five required fields: ID, name, email, status, and start date. The source can use different column names or a different column order. Other columns remain attached.
2. **Inspect.** Deterministic rules identify missing values, duplicate IDs within that file, email-format problems, unrecognized statuses, invalid or ambiguous dates, formatting variations, and rows whose cell count does not match the header.
3. **Stage.** Formatting suggestions and confirmed manual corrections become proposals. They are separate from the original data. The working preview can show those proposed values before approval.
4. **Coordinate.** Attach an owner, next action, optional due date and note, and Open/Waiting/Action complete status to unresolved records. These follow-ups are independent of data validity.
5. **Review.** Compare before and after, then approve or undo every proposal. Pending proposals block the generated handoff so unfinished decisions cannot slip into an export.
6. **Export and resume.** Download reviewed rows, exceptions, an approved-change report, assignments, activity, and a portable JSON session. A ZIP packages these with the exact original and explanatory notes.

The output is deliberately more useful than a “cleaned spreadsheet.” It tells the recipient which records passed, which still need review, what changed, and who owns each next step.

For the same fictional cohort, four formatting proposals move two records into the ready group. The other six unresolved records still need source confirmation. Dana's assignment does not erase the duplicate-ID or date problem.

“Ready” means the record passes this app's rules. It does not prove the email inbox exists, the person is eligible, or the source information is true.

The current version handles files up to **1,000,000 bytes, 2,000 data rows, and 30 columns**. It is single-user and local to the browser. The hosted URL delivers the application; it does not currently provide cloud storage, shared workspaces, accounts, AI, or team notifications. Optional browser persistence and downloadable session backups provide continuity. The standalone HTML version provides the same core workflow offline.

**A short version you can say aloud:** “It's a local CSV quality-review tool with an approval workflow and operational follow-through. It preserves the source, separates accepted corrections from unresolved exceptions, and exports a complete handoff with ownership and activity.”

## Level 3 — Technical: “Show me the architecture and guarantees”

**It is a static React application with a framework-independent JavaScript validation and review engine, client-side coordination state, and browser-generated CSV/JSON/ZIP outputs.** Vite produces the static distribution. `fflate` creates ZIP packages. No server-side data service is involved in the current workflow.

### Ingestion and source model

Input bytes are decoded using fatal UTF-8 decoding. A strict CSV parser supports quoted commas, doubled quotes, embedded line breaks, LF/CRLF, and an initial UTF-8 BOM. It retains blank records and source line references. Malformed quoting, invalid UTF-8, oversized inputs, invalid headers, and unsupported limits cause explicit failures rather than partial ingestion.

A dataset stores raw source text, filename, original headers, column mapping, import metadata, and original cells. Source rows receive positional keys such as `row-4`. The key is independent of the business ID, so missing or duplicate IDs do not collapse record identity.

The supported mapping contract is `id`, `name`, `email`, `status`, and `start_date`. Five distinct source columns must be selected. Extra columns and source ordering remain intact.

### Validation and proposals

Validation is deterministic. IDs are checked for presence and duplicate values after outer trimming. Email checking is syntactic. Statuses must resolve to the supported vocabulary; recognized formatting variations can be proposed, while semantic aliases still require confirmation. Dates must be real calendar dates in `YYYY-MM-DD` format. Ambiguous dates are flagged without interpretation.

Corrections are held outside the source, keyed by source-row key and column index:

```js
changes[rowKey][columnIndex] = {
  value: proposedValue,
  approved: false
};
```

The working preview applies proposals to copies of original cells. Exported reviewed values apply approved changes. Changing a proposal resets its approval; reverting to the original removes that correction. Original row structure remains authoritative, so cell-count mismatches remain exceptions until the source is repaired and reimported.

### Coordination and history

Assignments hold owner, next action, due date, follow-up status, note, and update time. They are independent of correction state and validation results. There is no inference that a completed follow-up resolves a data defect.

Activity records local import, stage, approve, undo, assignment, export, backup, and restore actions. Entries have timestamps, descriptions, optional change details, and a default `You` actor label. This provides operational traceability within the workspace. It is not authenticated attribution, tamper-resistant audit storage, or evidence that an external call or email actually occurred.

### Export invariants

Generated handoff exports require every proposal to be approved or undone. On export:

- Every source record belongs to either the ready partition or the exception partition.
- `all-reviewed-rows.csv` preserves every source row in source order with approved corrections applied.
- `original.csv` preserves the imported text rather than reserializing the parsed rows.
- Approved corrections appear in `change-log.csv`; assignments and activity remain separate reports.
- Generated CSV fields receive correct CSV escaping. Formula-like leading characters are prefixed with an apostrophe by default; this can intentionally alter exported representation. The original download is not transformed.

The nine ZIP entries are `original.csv`, `clean.csv`, `exceptions.csv`, `all-reviewed-rows.csv`, `change-log.csv`, `assignments.csv`, `activity.csv`, `session.json`, and `README.txt`.

### Persistence and deployment boundary

Active state lives in memory. Explicit opt-in serializes it to browser storage. Versioned JSON snapshots retain source, mapping, changes, assignments, and events. Restore reconstructs the dataset and validates bounded structures; it does not merge concurrent sessions or execute imported instructions.

The app has no authentication, remote data API, AI provider integration, telemetry, database, or collaborative synchronization. A hosted page requests its static assets from the host; CSV operations themselves remain local. The offline build inlines its JavaScript, CSS, and icon into one HTML document. There is no service worker or installed-PWA guarantee.

**A short version you can say aloud:** “It's a local-first, human-reviewed CSV repair application with preserved source data, separate proposed corrections, deterministic validation, independently modeled follow-up ownership, and reconciled export partitions. The frontend is React, the engine is plain JavaScript, and the current deployment is entirely static.”

## Claims to avoid in every explanation

- “It automatically fixes bad data.” It proposes limited formatting corrections and accepts confirmed manual edits.
- “It verifies people's identities or emails.” It checks specified formats and relationships within one file.
- “It is a shared CRM.” It is currently a single-browser review workspace.
- “Assigning someone notifies them.” Current owners are labels in the local workspace and exported handoff.
- “Everything is permanently saved.” Persistence is optional; backups are the portable continuation mechanism.
- “It has a verified audit trail.” The activity is local and editable; there are no authenticated actors.
- “The cloud app stores your files.” The hosted application is currently static and does not upload the CSV.
- “Every CSV schema is supported.” The first version still requires the five-field intake contract.

