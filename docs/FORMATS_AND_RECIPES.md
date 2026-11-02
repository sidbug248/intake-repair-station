# Imports, reusable recipes, and version comparison

These features run locally in the browser. They do not require an account, an AI provider, or a network request. The same modules are included in the downloadable offline app.

## CSV, TSV, and Excel workbooks

Choose a `.csv`, `.tsv`, or `.xlsx` file. Input files remain limited to 1,000,000 bytes, 2,000 data rows, and 30 columns. Headers must be unique and nonempty. Each worksheet uses its first row as the header. No data rows are silently dropped to fit a limit.

| Format | Review behavior | Original preservation |
| --- | --- | --- |
| CSV | Strict UTF-8, quoted commas, escaped quotes, embedded line breaks, LF/CRLF, optional BOM | Original CSV text is kept without reserialization |
| TSV | Same strict quoting rules, with tabs between fields; represented as CSV for the review engine | Exact original TSV bytes are retained separately |
| XLSX | Select one tabular worksheet; strings, numbers, Booleans, and saved formula results are read | Exact bytes of the complete workbook, including unselected sheets, are retained separately |

A workbook with multiple worksheets requires an explicit sheet selection. Hidden sheets are identified in that selection; hidden rows inside the chosen sheet are included. Interior blank rows and omitted blank cells are represented explicitly. For XLSX imports, source-line references identify the original worksheet row number, even when a cell contains line breaks. Reviewing one sheet does not remove other sheets from the preserved original workbook.

### Excel limitations that matter

- **Formulas are not executed.** A formula cell uses its saved result, and the import shows a warning that the result may be stale. A formula without a saved result must be recalculated and saved, or replaced with confirmed values in the source workbook, before import.
- **Numeric display formatting is not interpreted.** The underlying value is preserved. For example, a number displayed as an Excel date still arrives as its serial number; it is not silently guessed into a date. Use confirmed `YYYY-MM-DD` text for dates. Store identifiers with meaningful leading zeros as text. The importer displays a notice for formatted numeric cells.
- **Merged cells are rejected.** Unmerge the selected worksheet before import. The app does not duplicate a merged value into cells that did not contain it.
- Excel error cells, legacy `.xls`, `.xlsm`, `.ods`, encrypted workbooks, unsupported worksheet structures, and files beyond the supported limits fail with an explanation.
- Cell colors, charts, images, conditional formatting, and workbook calculation behavior are outside the review engine. Those features remain in the original workbook.
- External worksheet links, XML DTDs, and custom XML entities are not loaded. Workbook XML has expansion, node-count, depth, row, column, and field-size limits.

Generated handoff data is CSV. It does not reconstruct a modified Excel workbook. The original download and handoff package should identify the original format correctly: `original.tsv` or `original.xlsx` alongside the working CSV representation when applicable.

Microsoft documents how SpreadsheetML stores [worksheet cells](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-sheets), [shared strings](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-the-shared-string-table), and [cached formula results](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-formulas). The app reads those stored values; it is not an Excel calculation engine.

## Reusable mapping and validation recipes

A recipe contains a name, required field roles, allowed statuses, optional saved column mappings, and a bounded list of declarative rules. It contains **no participant records**.

The default **Participant intake** recipe preserves the original five-field workflow: ID, name, email, status, and start date. A custom recipe may require only a subset—or none—of those roles. An optional mapped role is still checked when it has a value. An empty optional role does not create a missing-value issue.

For example, a support-request list may have `Ticket`, `Priority`, and `Cost` rather than participant fields:

```json
{
  "version": 1,
  "name": "Support requests",
  "requiredFields": [],
  "statuses": ["pending", "active", "completed"],
  "rules": [
    { "column": "Ticket", "type": "required" },
    { "column": "Ticket", "type": "unique" },
    { "column": "Priority", "type": "enum", "values": ["low", "high"] },
    { "column": "Cost", "type": "number", "min": 0, "max": 500 }
  ]
}
```

### Available rules

| Type | Meaning | Configuration |
| --- | --- | --- |
| `required` | A nonblank value is required | Exact source column name |
| `unique` | Nonblank values must be unique after outer trimming | Exact source column name |
| `email` | Value must pass the email-format check | Exact source column name |
| `date` | Value must be a real calendar date in `YYYY-MM-DD` form | Exact source column name |
| `number` | Value must be a finite decimal/scientific-notation number | Optional numeric `min` and `max` |
| `enum` | Trimmed value must match an allowed value exactly | `values` list; case-sensitive |
| `min_length` | Value must contain at least the chosen character count | Integer `length` |
| `max_length` | Value must not exceed the chosen character count | Integer `length` |

Blank values are skipped by rules other than `required`; combine rules when an optional value should become mandatory. A uniqueness rule never merges or deletes duplicate rows. A length rule never truncates content. Numeric rules do not infer currency symbols or locale-specific separators. Rules do not run JavaScript, regular expressions, formulas, or arbitrary expressions.

The app supports up to 60 rules, 50 status values, and 20 recipes saved in a browser profile. Status values cannot differ only by supported case/spacing normalization, which avoids ambiguous normalization targets.

Save a recipe only when you choose to reuse it. Browser recipe storage is separate from session persistence. A recipe can also be exported/imported as a small JSON file. Importing a recipe does not silently accept missing mapped columns; confirm the mapping for the new source.

**Ready means “passes the active recipe.”** Changing required fields or rules changes the checks. It does not establish that a source fact is true. Session backups include the recipe used for the review, so a reopened session uses the same rules.

## Compare a new import with a previous version

Choose a key column present in each file—typically a stable source ID. The comparison uses reviewed values, so pending corrections must be approved or undone first.

The result separates:

- **Added:** a unique key appears only in the newer file.
- **Removed:** a unique key appears only in the previous file.
- **Changed:** the same unique key appears in both, with one or more different field values.
- **Unchanged:** the same unique key and values appear in both.
- **Ambiguous:** the key is missing or duplicated in either file. All affected rows remain visible, with their source row references.

Key matching trims outer whitespace but does not change case or infer identity. Added and removed columns are reported separately. Extra cells in malformed source rows are also compared. No corrections, assignments, or approvals are transferred from one source row to another automatically.

The comparison is read-only. Export its report as CSV to keep the result with the handoff. Every previous and newer source row remains accounted for even when identity cannot be matched safely.

## Integration API

```js
import { readImportFile, getOriginalSource } from '../src/lib/formats.mjs';
import { createDataset, sessionSnapshot, restoreSession } from '../src/lib/intake.mjs';
import { validateRecipe, recipeFromDataset, saveRecipe } from '../src/lib/recipes.mjs';
import { compareDatasets, comparisonCSV } from '../src/lib/comparison.mjs';

const imported = await readImportFile(file, { sheetName: selectedSheet });
// If imported.needsSheet is true, show imported.sheets and call again after selection.
const dataset = createDataset(imported.raw, imported.filename, false, {
  columnMap: confirmedMapping,
  recipe: validateRecipe(selectedRecipe, sourceHeaders),
  source: imported.source,
});

const original = getOriginalSource(dataset);
// Download original.bytes with original.filename and original.mime.

saveRecipe(recipeFromDataset(dataset, 'Monthly participant export'));
const backup = sessionSnapshot(dataset, changes);
const restored = restoreSession(JSON.parse(JSON.stringify(backup)));

const report = compareDatasets(previousDataset, dataset, {
  keyColumn: 'Participant ID',
  previousChanges: previousReviewedChanges,
  nextChanges: changes,
});
const reportCSV = comparisonCSV(report);
```

The CSV APIs remain backward compatible. Existing version-1 session files without a recipe restore with the default participant-intake checks. New sessions preserve their recipe and original non-CSV source metadata. Applications handling downloads must use `getOriginalSource` instead of assuming `dataset.raw` is the uploaded file for every format.
