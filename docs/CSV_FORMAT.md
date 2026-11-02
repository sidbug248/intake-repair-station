# CSV format and exports

## Input requirements

| Property | Supported value |
| --- | --- |
| Encoding | Valid UTF-8, with or without an initial byte-order mark (BOM) |
| Delimiter | Comma |
| Maximum file size | 1,000,000 bytes |
| Maximum data rows | 2,000, excluding the header |
| Maximum columns | 30 |
| Header | One header row with unique, nonempty column names |
| Line endings | LF or CRLF; line breaks inside quoted fields are preserved |
| Quoting | Double quotes around a field; double an embedded quote as `""` |

Limits cause an import error rather than a partial import. A CSV needs at least one data row. An empty final line terminator is not an additional data record; an actual blank record between rows is retained and flagged.

The app is intentionally strict about quotes. Text after a closing quote, an unclosed quoted field, or an unescaped quote in an unquoted field produces an error. Fix the source file before importing it. Spaces outside a quoted field are not silently discarded.

```csv
id,name,email,status,start_date,notes
IR-2001,"River, Morgan",morgan.river@example.com,active,2026-11-02,"Orientation booked, arrival confirmed"
IR-2002,Rowan Lake,rowan.lake@example.com,pending,2026-11-03,"A note containing ""quoted text"""
```

For a multiline field, put the entire value inside quotes:

```csv
id,name,email,status,start_date,notes
IR-2003,Avery Meadow,avery.meadow@example.com,on_hold,2026-11-04,"First line of the note
Second line of the same note"
```

## Confirm the column mapping

The app checks five fields. Source columns can have different names and can appear in any order. Select which source column supplies each field before opening the repair queue.

| Field used by the app | Example source header | Expected value |
| --- | --- | --- |
| `id` | `Participant ID` | A nonempty identifier that is unique within the file after outer whitespace is removed |
| `name` | `Full name` | A nonempty recorded name |
| `email` | `Email address` | A nonempty address that passes the app's format check |
| `status` | `Enrollment status` | `pending`, `active`, `completed`, `on_hold`, or `withdrawn` |
| `start_date` | `Program start date` | A real calendar date in `YYYY-MM-DD` format |

Each field needs its own source column. Obvious header matches may be suggested, but you confirm the mapping. Source headers and column order remain unchanged in the reviewed CSVs. A column named `Notes`, for example, is retained without being treated as one of the five required fields.

## What a check means

### IDs and missing values

IDs are compared after removing outer whitespace. They are not rewritten, renumbered, or deduplicated automatically. Both records in a duplicate group remain available for review. The app does not determine whether two different IDs refer to the same person.

A required field containing only whitespace is considered missing. Enter information only when you can confirm it from the source. Leaving it unresolved keeps the record in the exception handoff.

### Email addresses

The email check catches common formatting mistakes. It does not contact the address, verify delivery, or provide a complete validator for every legal email-address format.

The formatting suggestion lowercases the domain after `@`, while preserving the local part before it. For example, `Morgan.River@EXAMPLE.COM` can be proposed as `Morgan.River@example.com`.

### Statuses

Recognized statuses can have their outer whitespace, casing, and separators normalized. For example, ` Active ` can be proposed as `active`, and `on hold` as `on_hold`.

A term such as `complete`, `finished`, `enrolled`, or `paused` may have a plausible meaning, but it is not treated as an automatic formatting fix. Confirm the intended status for that record.

### Dates

`2026-11-02` is valid. `2026-02-30` is not a real date. A value such as `11/06/2026` requires clarification because it could mean different dates under different conventions.

The app does not convert date formats, infer a missing year, or use a person's name, status, or other records to guess a date. Confirm the source date and enter it in `YYYY-MM-DD` format.

### Uneven rows

A row with a different number of cells from the header is retained as an exception. Its raw cell array is preserved, including surplus cells. Correct the source row's structure and reimport the file; changing an individual field does not resolve a structural mismatch.

## Proposed values and approved values

The repair queue previews staged corrections so you can see whether they resolve an issue. A preview is not an approval.

Every proposed correction records the original and new value. Approve it or undo it in **Review changes**. Editing an approved correction creates a new proposal that needs review again. A corrected cell can contain at most 10,000 characters. Generated handoff exports remain unavailable while any proposal awaits approval.

“No open issues” describes the checks in the current preview. A row can still require a follow-up action, and a follow-up marked Action complete can still have unresolved data issues.

## Export files

The ZIP uses the filenames below. Individual CSV downloads add a filename stem from the imported file, such as `cohort-clean.csv`.

### `original.csv`

The unchanged imported text, including its source header, quoting, BOM if present, and line endings. It is not formula-protected or otherwise normalized.

### `clean.csv`

Source headers followed by records that pass every current check after approved changes. Extra columns stay in their original positions. Record order follows the input. This file may contain only the header if no rows are ready.

### `exceptions.csv`

One row for each source record with unresolved issues. Fields include its source line, issue count and descriptions, source headers, original values, and reviewed values. Headers and cell arrays are stored in JSON columns so uneven source rows remain representable without discarding cells.

Source line numbers refer to physical lines in the original text. A quoted multiline record can span several lines; its reference is the line where that record starts.

### `all-reviewed-rows.csv`

Every source record, in its original order, with approved corrections applied. This is a complete working copy rather than a promise that every row is ready to import into another system. A structural exception can still have a different number of cells from the header.

### `change-log.csv`

The source line, source column, original value, and reviewed value for approved corrections. This is the current set of approved differences; use the activity report for recorded workflow events.

### `assignments.csv`

One row per source record, including records without an assignment. It contains source-record references and the associated owner, next action, due date, follow-up status, and note. The `source_id` and `source_name` columns use the original values so they remain traceable even after a correction. Assignments are separate from source data and do not add columns to the imported CSV.

An assignment needs an owner and next action. Its due date can be empty or a real `YYYY-MM-DD` date. The exported follow-up statuses are `open`, `waiting`, and `done`; the interface displays the last as **Action complete**. These differ from the participant's enrollment status.

### `activity.csv`

Events in the order recorded by the local workspace, oldest first. The app uses a default `You` actor label alongside the timestamp and action description. It is a useful handoff aid, not an authenticated or tamper-proof record. The label does not prove who performed an action, and someone with a session backup can edit its contents.

### `session.json`

A restorable session containing the original CSV, filename, confirmed mapping, corrections and their approval state, assignments, and activity. A backup can be saved before all corrections are approved. Restore it in the app to continue the review.

Treat backups as data files: they contain the original records. Restoring a backup replaces the current workspace rather than merging two reviews. The browser accepts backup files up to 10,000,000 bytes; the source CSV inside must still fit the CSV limits. Saved coordination data is also bounded to 10,000 events and 4,000,000 characters of serialized text.

## Spreadsheet formula protection

Generated CSV files use spreadsheet protection by default. A cell whose first non-whitespace character is `=`, `+`, `-`, or `@` is prefixed with an apostrophe. For example, `=1+1` is exported as `'=1+1`.

This reduces the chance that spreadsheet software interprets a source value as a formula. It is not a guarantee about every spreadsheet program or import setting. It also affects legitimate values such as an identifier starting with `-` or a phone number starting with `+`.

The option changes generated CSV representations, including the approved working copy; it does not change the original data retained in the workspace. The unchanged original and JSON backup are not sanitized for opening in a spreadsheet. Review the setting before handing data to another system.

## Example files

- [fictional-cohort.csv](../examples/fictional-cohort.csv): the demonstration cohort, including safe formatting proposals and issues that require judgment.
- [mapped-cohort.csv](../examples/mapped-cohort.csv): the same field contract with descriptive source headers and an extra notes column.

All example people and addresses are fictional. These files illustrate behavior; they are not intended as a general-purpose dataset or a substitute for confirming real source information.
