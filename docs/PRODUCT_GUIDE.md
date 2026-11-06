# Relay Station: a guide for three audiences

**Relay Station by Eternity Flux · Version 0.3.0**

Relay Station helps you turn an incoming list into clear decisions, owners, and next steps. It is available through this repository, local development, and a downloadable offline HTML app. The public hosted site remains paused. The core needs no account, AI, or service setup.

## Level 1 — Casual: start with the job

Imagine a partner sends you a list of twelve people joining a training program. One email looks incomplete. Two people share the same ID. A start date could mean two different days.

You need to work out what can be used, what needs a question, and who will get the answer. Relay Station keeps that work together.

### 1. Open an example

On **Start**, choose the fictional example. It opens directly in **Needs attention**. Its column meanings are already set, so you can learn through the work itself.

The sample contains twelve fictional people. Nothing is sent to them, and there is no signup step.

### 2. Look at one question

**Needs attention** starts with issue cards. Each card identifies a record, explains what needs review, and shows its next action when one has been assigned. Open a record to see the source and available corrections. A table view is also available if you prefer to compare several records together.

For example, Dana Vale and Eli Hart share an ID. Dana also has `11/06/2026` as a start date. The date could mean November 6 or June 11. The app highlights those questions; it does not decide that the people are identical or guess the intended date.

Search and filters help you find a particular person, an owner, unanswered questions, waiting tasks, or records that pass the current checks.

### 3. Choose what to do next

You have two common paths:

- **You have a confirmed answer.** Enter a proposed correction. For example, if the source confirms the intended date, record it in `YYYY-MM-DD` form.
- **You still need an answer.** Assign a person or team to follow up. Keep the original information as it is until the answer is known.

For Dana, you could record:

| Field | Example |
| --- | --- |
| Owner | Intake coordinator |
| Next action | Confirm Dana's source ID and intended start date |
| Action status | Waiting |
| Due date | An optional date you choose |
| Handoff note | Useful context you can support from the source |

Saving the next action records responsibility. It does not email the owner or establish that someone has already contacted Dana.

### 4. Review what changed

**What changed** shows original and proposed values together. Approve the corrections you intend to keep or undo them.

The app can suggest simple formatting improvements, such as removing outer spaces or changing ` Active ` to the allowed `active` status. Those suggestions still need your approval. They do not fill in missing facts or guess dates.

Three words matter:

| Word | Meaning |
| --- | --- |
| **Original** | What arrived in the source file. It remains available unchanged. |
| **Proposed** | A change waiting for your decision. The screen may preview its effect. |
| **Approved** | A correction you accepted for the reviewed output. |

Editing an approved correction makes it a new proposal. The reviewed handoff waits until every proposed correction has been approved or undone.

You can also open **Activity** from **What changed** to see recorded imports, corrections, approvals, assignments, and prepared downloads.

### 5. Prepare the handoff

Open **Handoff**. The readable report explains:

1. What came in and how many records were retained.
2. What corrections were approved.
3. Which records still have unresolved questions.
4. Who owns the next actions and what they need to do.

Download this HTML report and open it in a browser. The recipient does not need Relay Station to read it. Creating it does not require AI.

For someone who also needs the files, choose the complete ZIP. A ZIP is a folder-like bundle. It includes `handoff.html`, the original, reviewed data, unresolved records, changes, assignments, activity, and a session backup. A TSV or Excel import also includes the working CSV separately from its original file.

With the default checks, approving the four supported formatting suggestions in the fictional example leaves **six ready records and six unresolved records**. All twelve remain accounted for. The counts depend on your decisions and active checks.

**Ready means the configured checks pass.** It does not prove a person's identity, an email's delivery, or the truth of a source value. A record can pass the checks and still have an unfinished follow-up task.

### 6. Save before you leave

Work lives in the current tab by default. **Save session backup** downloads a file that preserves your list, decisions, and next actions. Use the restore action to reopen that JSON backup later.

**Remember on this device** saves in the current browser profile. It is optional and is not an online backup. A downloaded session backup is the portable way to move work to another browser or another copy of the app.

### When you bring your own list

On **Start**, choose a CSV, TSV, or Excel `.xlsx` file. CSV and TSV are ordinary rows-and-columns text files, separated by commas or tabs. You can also paste CSV text.

Review the suggested column meanings and confirm the matches for your own file. For example, your “Participant name” column can supply the app's Name field. If an Excel workbook has several worksheets, choose one to review; the full original workbook remains preserved.

The default checks cover ID, name, email, status, and start date. A **recipe** is a saved set of column matches and checks. Change it in **Advanced tools → Import recipes** when your recurring list needs different fields or rules. You do not need to configure a recipe to try the example.

Some Excel features require source preparation. Formulas need saved results, merged cells must be unmerged, and numeric Excel dates are not silently converted. The import explains these limits.

### When the next version arrives

Open **Advanced tools → Compare versions**. Choose a stable identifying column, usually an ID. The report shows new, removed, changed, unchanged, and uncertain matches.

A missing or repeated ID is labeled ambiguous. The comparison does not merge the files, remove current records, or carry assignments into a new file automatically.

### Optional help

Under **Advanced tools**, you can connect a separately started local companion for named saved workspaces and optional AI. The basic workflow works without it.

AI can explain an issue, draft a next action, summarize supplied handoff facts, suggest column matches or rules, or advise on selected possible duplicates. You inspect the data scope and review its response. A remote provider receives the information selected for that request; a properly configured local model can run on your own computer.

AI cannot approve corrections, merge people, or send messages. The ordinary readable handoff report already works without AI.

**A short version to say aloud:** “Relay Station helps you sort out a list someone sent you. You review the corrections, assign the unanswered questions, and hand the next person a clear account of what changed and what still needs doing.”

## Level 2 — Hybrid: the product and workflow

**Relay Station is an open-source operational handoff desk with a file-review engine underneath it.**

A coordinator receives a participant list, an onboarding export, or another small operational file. They need to distinguish usable information from unresolved questions and leave the next person a clear record of decisions and responsibilities.

The main navigation follows that work:

| View | Job |
| --- | --- |
| **Start** | Try a fictional example, open a file, or resume previous work. |
| **Needs attention** | Inspect issues, propose confirmed corrections, and assign follow-up. |
| **What changed** | Compare original/proposed values, approve or undo changes, and inspect activity. |
| **Handoff** | Read and download the summary, reviewed records, unresolved work, and supporting files. |

The review keeps three independent kinds of information:

1. **Source records:** the incoming file, original cells, and positional source references.
2. **Correction decisions:** proposed values and whether each has been approved.
3. **Follow-up work:** owner, next action, due date, note, and action status.

This separation matters. Assigning an action does not change a source value. Completing a task does not automatically resolve a validation issue. Passing a format check does not confirm a real-world fact.

The default participant checks can be replaced or extended through declarative recipes. Search, filters, and a table view remain available; advanced configuration is not required for the first example. All admitted rows remain represented in the ready or unresolved output.

### A complete handoff

The HTML report is designed to be readable by a recipient who does not use Relay Station. The ZIP adds exact source preservation, reviewed CSVs, an exception report, accepted changes, assignments, activity, and a versioned session backup.

Pending corrections block reviewed outputs, including the readable report. Original downloads and backups are available during review. This makes the distinction between “work in progress” and “reviewed output” explicit.

### Optional services

The browser core is complete on its own. The optional Node.js companion saves named workspaces in local SQLite, checks revisions before overwriting saved work, and supports workspace-scoped viewer/editor tokens. Service history and notifications record saved revisions and access changes. A token label identifies a credential rather than verifying a person's identity.

AI operates through explicit tasks and reviewable suggestions. Provider keys remain server-side. A configured webhook can deliver a selected summary after a payload preview and confirmation; ordinary importing, saving, and AI requests never trigger that delivery automatically.

| Area | Current boundary |
| --- | --- |
| Files | CSV, TSV, selected XLSX worksheet; 1,000,000 bytes, 2,000 data rows, 30 columns |
| Continuity | Optional browser persistence, portable backups, optional local SQLite saves |
| Comparison | Read-only version comparison by chosen key; duplicate/missing keys stay ambiguous |
| Access | Optional workspace-scoped local tokens with owner/editor/viewer roles |
| AI | Configured remote provider or local model; explicit scope and human review |
| Coordination | Local assignments, service notifications, optional confirmed webhook |
| Distribution | Repository/local/offline; public deployment paused |

The companion binds to the same computer's loopback interface. The release does not provide public signup, cross-device cloud sync, real-time simultaneous editing, or automatic outreach.

**A short version to say aloud:** “Relay Station turns an incoming operational file into a reviewed handoff. It preserves the source, separates corrections from follow-up work, and makes unresolved questions and their owners visible.”

## Level 3 — Technical: state, invariants, and boundaries

### Ingestion and source preservation

The browser imports strict UTF-8 CSV/TSV or a selected XLSX worksheet. The workbook reader bounds compressed and expanded data, checks ZIP metadata and checksums, and constrains XML parsing. It does not execute formulas, load external worksheet references, or accept unsupported merged-cell structures. Numeric display formatting is not inferred.

Datasets retain working CSV text, original headers, column mapping, recipe, source metadata, and original cells. TSV/XLSX originals use separately validated base64 metadata. Positional row keys do not depend on business IDs. XLSX source references identify the selected worksheet's original row numbers.

### Review model

The React interface uses framework-independent modules for parsing, validation, correction state, comparison, handoff rendering, and AI schemas. The primary workflow lives in `src/pages/RelayStation.jsx`; advanced components remain separate.

Recipes define bounded canonical roles and arbitrary-column rules: required, unique, email, date, number/range, enum, minimum length, and maximum length. They contain declarative data and cannot evaluate expressions or code.

Corrections are an overlay:

```js
changes[rowKey][columnIndex] = {
  value: proposedValue,
  approved: false
};
```

Working previews can include proposals; reviewed outputs use approved corrections. Editing an accepted value invalidates approval. Reverting to the original removes the overlay entry. Structural row mismatches require source repair and reimport.

Assignments and browser activity are independent models. Neither task status nor an event overrides validation. Local labels and timestamps do not prove identity, source verification, or external contact.

### Comparison and export invariants

Comparison requires approved working values and an explicitly chosen key. It reports added, removed, changed, unchanged, and ambiguous groups. It preserves all represented rows and does not merge reviews or transfer assignments automatically.

The ready and exception partitions reconcile to every source row. Reviewed CSV retains input order, headers, and extra fields. The complete handoff adds `handoff.html`, produced by `src/lib/handoff.mjs`, to the existing source/review/assignment/session package. TSV/XLSX imports also include `working-source.csv` and their exact original-format file.

Generated CSV has formula-like-value protection on by default. This changes exported representations, not the original or session source. The readable report uses the reviewed state and requires no inference call.

### Persistence and compatibility

Browser state is in memory with opt-in persistence. JSON restore validates bounded structures and reconstructs the dataset, including recipe and preserved-source metadata. Older version-1 CSV snapshots remain supported.

The product rename does not change the meaning of saved review state. Legacy protocol/storage identifiers and `INTAKE_` environment settings are retained where required for compatibility; they are not visible product names.

Companion saves rebuild the same validated snapshot before SQLite storage. `expectedVersion` rejects stale writes. Token hashes, workspace membership, role checks, loopback binding, Host/Origin validation, and input bounds protect the local service. Service history remains distinct from editable browser activity.

### AI and delivery

Server-configured adapters allow OpenAI, Anthropic, OpenAI-compatible services, and local Ollama. Requests carry a SHA-256 workspace revision, bounded context, explicit scope, and task-specific output schemas. Evidence references are checked; changed workspace state invalidates old suggestions.

Handoff-summary AI selects known fact IDs for application-rendered text. Other model prose remains advisory. AI has no direct edit, approval, merge, messaging, or permission authority. A webhook is a separate previewed and explicitly confirmed action against a reviewed saved revision.

There is no public identity backend or Internet-facing hosted service in this release. The optional local service is not a substitute for the identity, isolation, and operational controls a future cloud product would need.

**A short version to say aloud:** “Relay Station is a local, human-reviewed handoff application with preserved originals, a correction overlay, declarative validation, independent follow-up state, and reconciled exports. A framework-independent engine supports the React interface, and an optional loopback Node/SQLite service adds revision-controlled saves, scoped access, and schema-validated AI tasks.”

## Describe it accurately

- The shipped workflow supports file review and operational handoff. General-purpose form intake, a CRM, and a hosted team platform are not implemented.
- Formatting suggestions are implemented; factual corrections require confirmed information.
- Data validity, correction approval, and follow-up status are separate.
- A readable report or ZIP being prepared does not mean it was delivered to anyone.
- The core remains complete without an account, companion, or AI.
- Remote AI transmits its selected scope. BYOK alone does not make inference local.
- Browser activity and service history are operational records, not tamper-proof evidence.
- Spreadsheet support is bounded; Relay Station is not an Excel renderer or calculation engine.

See [Architecture](ARCHITECTURE.md), [Formats and recipes](FORMATS_AND_RECIPES.md), [CSV checks and exports](CSV_FORMAT.md), and [Local services](LOCAL_SERVICES.md) for the detailed contracts.
