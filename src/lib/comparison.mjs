import { currentValues, listChanges, encodeCSV } from './intake.mjs';

/** Compare accepted values without merging datasets or transferring corrections. */
export function compareDatasets(previous, next, options = {}) {
  const previousKeyColumn = options.previousKeyColumn ?? options.keyColumn;
  const nextKeyColumn = options.nextKeyColumn ?? options.keyColumn;
  const previousIndex = previous.headers.indexOf(previousKeyColumn);
  const nextIndex = next.headers.indexOf(nextKeyColumn);
  if (previousIndex < 0 || nextIndex < 0) throw new Error('Choose a comparison key that exists in both files.');
  const previousChanges = options.previousChanges ?? {};
  const nextChanges = options.nextChanges ?? {};
  const pending = [...listChanges(previous, previousChanges), ...listChanges(next, nextChanges)].some(change => !change.approved);
  if (pending) throw new Error('Approve or undo pending changes before comparing reviewed versions.');
  const before = previous.rows.map(row => ({ key: row.key, sourceLine: row.sourceLine, values: currentValues(row, previousChanges, true) }));
  const after = next.rows.map(row => ({ key: row.key, sourceLine: row.sourceLine, values: currentValues(row, nextChanges, true) }));
  const collect = (rows, index) => {
    const grouped = new Map();
    const missing = [];
    for (const row of rows) {
      const key = (row.values[index] ?? '').trim();
      if (!key) missing.push(row);
      else { if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(row); }
    }
    return { grouped, missing };
  };
  const left = collect(before, previousIndex);
  const right = collect(after, nextIndex);
  const result = { keyColumn: previousKeyColumn, previousKeyColumn, nextKeyColumn, added: [], removed: [], changed: [], unchanged: [], ambiguous: [],
    previousFilename: previous.filename, nextFilename: next.filename,
    columnsAdded: next.headers.filter(header => !previous.headers.includes(header)),
    columnsRemoved: previous.headers.filter(header => !next.headers.includes(header)) };
  const headers = [...new Set([...previous.headers, ...next.headers])];
  for (const key of new Set([...left.grouped.keys(), ...right.grouped.keys()])) {
    const previousRows = left.grouped.get(key) ?? [];
    const nextRows = right.grouped.get(key) ?? [];
    if (previousRows.length > 1 || nextRows.length > 1) {
      result.ambiguous.push({ key, reason: 'duplicate_key', previousRows, nextRows });
      continue;
    }
    if (!previousRows.length) { result.added.push({ key, row: nextRows[0], nextRows, previousRows: [] }); continue; }
    if (!nextRows.length) { result.removed.push({ key, row: previousRows[0], previousRows, nextRows: [] }); continue; }
    const changes = headers.flatMap(column => {
      const previousColumn = previous.headers.indexOf(column), nextColumn = next.headers.indexOf(column);
      const beforeValue = previousColumn < 0 ? null : (previousRows[0].values[previousColumn] ?? '');
      const afterValue = nextColumn < 0 ? null : (nextRows[0].values[nextColumn] ?? '');
      return beforeValue === afterValue ? [] : [{ column, before: beforeValue, after: afterValue }];
    });
    // A malformed extra source cell is part of the comparison, never dropped.
    const beforeExtra = previousRows[0].values.slice(previous.headers.length);
    const afterExtra = nextRows[0].values.slice(next.headers.length);
    if (JSON.stringify(beforeExtra) !== JSON.stringify(afterExtra)) changes.push({ column: '(extra source cells)', before: JSON.stringify(beforeExtra), after: JSON.stringify(afterExtra) });
    const entry = { key, previousRows, nextRows, before: previousRows[0], after: nextRows[0], changes };
    result[changes.length ? 'changed' : 'unchanged'].push(entry);
  }
  for (const row of left.missing) result.ambiguous.push({ key: null, reason: 'missing_key', previousRows: [row], nextRows: [] });
  for (const row of right.missing) result.ambiguous.push({ key: null, reason: 'missing_key', previousRows: [], nextRows: [row] });
  result.counts = Object.fromEntries(['added', 'removed', 'changed', 'unchanged', 'ambiguous'].map(kind => [kind, result[kind].length]));
  result.counts.previousRows = before.length;
  result.counts.nextRows = after.length;
  result.counts.ambiguousPreviousRows = result.ambiguous.reduce((sum, entry) => sum + entry.previousRows.length, 0);
  result.counts.ambiguousNextRows = result.ambiguous.reduce((sum, entry) => sum + entry.nextRows.length, 0);
  return result;
}

export function comparisonCSV(result, protectFormulas = true) {
  const rows = [['comparison_status', 'match_key', 'previous_row_refs', 'next_row_refs', 'reason', 'changes_json', 'previous_values_json', 'next_values_json']];
  for (const kind of ['added', 'removed', 'changed', 'unchanged', 'ambiguous']) {
    for (const entry of result[kind]) rows.push([kind, entry.key ?? '', entry.previousRows.map(row => row.key).join(' | '), entry.nextRows.map(row => row.key).join(' | '), entry.reason ?? '', JSON.stringify(entry.changes ?? []), JSON.stringify(entry.previousRows.map(row => row.values)), JSON.stringify(entry.nextRows.map(row => row.values))]);
  }
  return encodeCSV(rows, protectFormulas);
}
