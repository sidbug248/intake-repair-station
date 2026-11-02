# Product guide: three ways to understand the app

This guide describes v0.2.0. The public hosted demo is paused; the application is available as source, a local development build, and a portable offline HTML build. The browser core needs no account or AI. A separately started local companion adds saved workspaces, scoped access, notifications, and optional AI/connector services.

## Level 1 — Casual: “Explain it from zero”

**It helps you turn a messy list into a reviewed list—and keeps the unfinished work from getting forgotten.**

Imagine you run a training program. Someone sends you a participant spreadsheet. Two people share an ID. An email address looks wrong. A date could mean November 6 or June 11. You need to prepare the list for the next person without deleting anyone or making up information.

The app gives you a clear place to work through it.

### 1. Bring in the list

Choose a CSV, TSV, or Excel `.xlsx` file. CSV and TSV are simple rows-and-columns text files; CSV separates values with commas and TSV with tabs. You can also paste CSV text or use the fictional example.

If an Excel workbook has several sheets, choose the sheet to review. The whole original workbook remains available unchanged. Some workbook features need preparation: merged cells must be unmerged, formulas need saved results, and Excel's numeric date values are not guessed into dates. The import explains these limits.

### 2. Choose the checks and match the columns

A **recipe** is simply saved instructions for how to check a list.

The default recipe expects ID, name, email, status, and start date. Your column may say “Participant name” rather than “Name”; you tell the app which column supplies that information.

You can save a recipe for a recurring file, change which fields are required, choose different statuses, or check other columns. For example, a support-request list could require a ticket number and a cost between zero and a chosen limit.

### 3. See what needs attention

The repair queue highlights missing values, repeated IDs, formatting problems, dates needing confirmation, and other problems defined by your recipe. Search and filters help you find unresolved records and follow-ups.

In the fictional sample, Dana Vale and Eli Hart share an ID. Dana also has `11/06/2026` as a date. The app flags both concerns. It does not decide that Dana and Eli are the same person, remove one, or guess which date Dana meant.

### 4. Review simple tidying and confirmed corrections

The app can propose limited formatting changes, such as removing spaces around a name or changing ` Active ` to `active` under the default recipe.

A missing ID or uncertain date needs a real answer from a source. After confirming that answer, enter it as a proposed correction. The original stays available so you can compare before and after.

### 5. Give unfinished work an owner and a next step

For Dana, record:

- Owner: **Intake coordinator**
- Next action: **Confirm the source ID and intended start date**
- Follow-up status: **Waiting**
- Due date: an optional date you choose

This records responsibility. It does not send that person an email. Marking the follow-up Action complete also does not turn an incorrect date into a valid one; the data still needs the appropriate correction.

### 6. Approve what you mean to keep

Inspect the old and proposed values. Approve each correction or undo it.

The app will not produce the reviewed handoff while a correction still needs a decision. You can save the original or a session backup during the review.

### 7. Take the complete handoff with you

Download ready records, unresolved records, or a ZIP containing the whole package. A ZIP is a folder-like bundle of files.

The bundle contains the original source, reviewed data, remaining problems, accepted changes, owners and next actions, local activity, and a session backup. For Excel or TSV, it also identifies the working CSV separately from the original file.

With the default recipe, approving four simple formatting corrections in the twelve-person sample produces **six ready records and six records needing attention**. All twelve remain accounted for.

### 8. Save before you leave

Work lives in the current browser tab by default. Download a session backup to reopen it later. **Remember on this device** can save in that browser profile, but it is not an online backup.

An optional local companion can save named workspaces on your computer. You start it separately and explicitly save the workspace. It does not upload your work to a public cloud service.

### When the next version of a list arrives

Use **Compare imports** and choose a stable identifying column. The report shows new records, records no longer present, changed values, and unchanged records. Missing or duplicated identifiers are called ambiguous instead of being forced into a match.

This makes a report. It does not merge the files or remove anything from your current workspace.

### What optional AI does

If you connect the local companion and configure a supported model, you can ask for column matches, a handoff summary, an issue explanation, a next-action draft, or advice about selected possible duplicates.

You see what will be sent and review the response. AI cannot approve corrections, merge people, or send messages. Using a remote provider sends the selected content to that provider; a properly configured local model can run on your own machine.

**A short version you can say aloud:** “It helps people clean up messy operational lists without losing anyone. You review the fixes, assign unanswered questions, and hand over usable data with a clear account of what still needs doing.”

## Level 2 — Hybrid: “Explain the product and workflow”

**It is a local data-review and handoff workspace combining validation, human approval, and follow-up ownership.**

A coordinator receives a participant export, a support queue, or another operational list. The file contains inconsistencies. The coordinator needs usable data and a record of the unresolved decisions, not just a file that looks tidier.

The workflow has six stages:

1. **Import and map.** Open a CSV, TSV, or selected Excel worksheet. Confirm the source-column roles. Original headers, extra columns, and input files remain available.
2. **Choose a recipe.** Reuse mappings, required roles, statuses, and declarative checks for custom columns. The default recipe supports participant intake; custom recipes support other schemas.
3. **Inspect and stage.** Deterministic checks identify issues. Supported formatting suggestions and confirmed manual edits become proposals separate from the source.
4. **Coordinate.** Attach an owner, next action, due date, note, and follow-up status. Data validity and task status remain independent.
5. **Review.** Compare original and proposed values; approve or undo every proposal. Pending decisions block the reviewed handoff.
6. **Export and resume.** Generate ready rows, exceptions, approved changes, assignments, activity, and a portable JSON session, with the original source included in the ZIP.

The twelve-person sample illustrates the distinction: approving four formatting proposals leaves six ready records and six exceptions. Assigning Dana's source-confirmation task does not resolve the duplicate ID or uncertain date.

**Ready means “passes this recipe.”** It does not prove an inbox exists, a person is eligible, or a source value is true. If the recipe changes, the checks change; the session records the recipe being used.

### What the optional companion adds

The core runs without a server. The optional Node.js companion saves workspaces in local SQLite, checks revisions before overwriting saved work, and supports workspace-scoped viewer/editor tokens. Service events and an inbox show saved revisions and access changes. A label identifies an authorized token, not an independently verified person.

AI integrates with the review workflow through explicit tasks and pending suggestions. The handoff summary is assembled from actual counts and supplied facts; other model prose remains advisory. Provider credentials remain in the companion rather than the browser bundle.

A configured webhook can deliver a reviewed summary after a payload preview and explicit confirmation. Importing, saving, or running AI does not trigger delivery automatically.

### Current scope

| Area | Implemented boundary |
| --- | --- |
| Files | CSV, TSV, selected XLSX worksheet; 1,000,000 bytes, 2,000 data rows, 30 columns |
| Continuity | Browser persistence, portable backups, optional local SQLite saves |
| Comparison | Reviewed imports matched by a chosen key; duplicate/missing keys remain ambiguous |
| Access | Optional workspace-scoped local tokens with owner/editor/viewer roles |
| AI | Optional configured remote provider or local model; explicit data scope and review |
| Coordination | Local assignments, service notifications, optional confirmed webhook |
| Hosted service | Public deployment paused; no public signup or cloud synchronization |

The companion binds to the same machine's loopback interface. Cross-device cloud sync, Google/email signup, and real-time shared editing are not implemented. There is no account requirement for the core application.

**A short version you can say aloud:** “It's an open-source data-quality review tool with an approval workflow and operational follow-through. It preserves the source, separates accepted corrections from unresolved exceptions, and exports the complete handoff. Optional local services add persistence, scoped access, and reviewed AI assistance.”

## Level 3 — Technical: “Show the architecture and guarantees”

**The frontend is a static React/Vite application with independent JavaScript modules for ingestion, validation, review, comparison, and AI schemas. An optional Node.js/SQLite companion provides loopback persistence and configured integrations.**

### Ingestion and source model

CSV uses fatal UTF-8 decoding and strict quoted-field parsing. TSV uses the same parser with a tab delimiter and converts to the working CSV representation. XLSX uses a bounded ZIP/XML reader, explicit worksheet selection, checked cell references, shared/inline strings, numeric/Boolean values, and cached formula results.

Workbook extraction validates declared and actual sizes, CRC checksums, compressed chunks, XML depth/node counts, and input limits. DTDs, external worksheet references, executable formulas, and unsupported merged-cell structures are not imported. Formatted numeric cells retain their underlying values with a notice rather than inferred display meanings.

The dataset retains working raw text, source filename, original headers, column mapping, recipe, metadata, and original cells. TSV/XLSX originals are stored separately as bounded base64 metadata. Positional row keys do not depend on business IDs. XLSX source references use worksheet row numbers.

### Validation and correction state

Recipes validate a bounded set of canonical roles and arbitrary-column rules. Rules are declarative: required, unique, email, date, number/range, enum, and length. They cannot evaluate expressions or code.

Corrections remain separate from the source:

```js
changes[rowKey][columnIndex] = {
  value: proposedValue,
  approved: false
};
```

The working preview applies proposals to copies of original cells. Reviewed exports apply accepted changes. Changing a proposal invalidates its approval; reverting to the source removes it. Structural mismatches remain exceptions until source repair and reimport.

Assignments and browser activity are separate models. Neither an action status nor a log entry overrides validation. Local event labels and timestamps do not prove external contact or verified identity.

### Comparison and export invariants

Reviewed comparison requires no pending corrections. It joins on an explicitly chosen key, reports column and value changes, and keeps missing/duplicate keys ambiguous. Every row from each version remains represented. No edits or assignments migrate automatically between imports.

For handoff exports, ready and exception partitions reconcile to every source row. The full reviewed CSV retains input order and accepted corrections. Originals are preserved separately. Formula-like generated CSV values receive apostrophe protection by default; the original and session source are not rewritten by that setting.

A CSV handoff contains nine files. TSV/XLSX handoffs add `working-source.csv`, while the original entry retains `.tsv` or `.xlsx`. The remaining reports cover accepted changes, assignments, local activity, the full reviewed list, exceptions, and a versioned session backup.

### Persistence, access, and AI boundary

The browser core holds state in memory, with opt-in browser storage. JSON restore validates structures and reconstructs the dataset, including recipe/source metadata; old version-1 CSV snapshots remain supported.

The optional companion reconstructs the same validated snapshot before SQLite storage. Saves use `expectedVersion` and reject stale writes. Token hashes and workspace membership enforce owner/editor/viewer access. Service events are separate from editable session activity. The service binds to loopback and checks Host, Origin, request size, and bearer authority.

Provider adapters are configured on the server. Only allowed models can be selected. Task requests carry a SHA-256 workspace revision, bounded context, and explicit data scope. Responses must satisfy schemas and evidence-reference checks; applying a response requires the current revision to match. AI receives no tool or approval authority.

Handoff summaries return known fact IDs, which application code renders from actual supplied facts. Issue explanations, next-action drafts, and duplicate advice remain model-generated suggestions. Request and output limits constrain usage, but are not an exact monetary cap.

There is no public identity/signup backend, cross-device synchronization, or Internet-facing production service. The local companion is a tested foundation for optional services, not a substitute for the controls required by a future hosted application.

**A short version you can say aloud:** “It's a local-first, human-reviewed data-repair application with preserved originals, a correction overlay, declarative validation recipes, independent follow-up state, and reconciled exports. React provides the UI; a framework-independent engine drives review. An optional loopback Node/SQLite service adds revision-controlled saves, scoped tokens, and schema-validated AI tasks.”

## Describe it accurately

- Formatting proposals and reviewed edits are implemented; automatic factual correction is not.
- Validation checks source formats and configured rules; it does not verify identities, eligibility, or mailbox delivery.
- The core remains complete without accounts or AI. Optional services must be deliberately started and connected.
- Local token access and revision checks are not public signup, cross-device cloud sync, or real-time collaboration.
- Assigning an owner does not send a message. Service notifications and explicit webhook delivery are separate features.
- Browser activity and service history are useful operational records, not tamper-proof evidence.
- A remote API provider receives the selected scope. BYOK is not a claim of offline processing.
- XLSX support has documented limits; the app is not an Excel rendering or calculation engine.

See [Architecture](ARCHITECTURE.md), [Formats and recipes](FORMATS_AND_RECIPES.md), and [Local services](LOCAL_SERVICES.md) for the implementation details.
