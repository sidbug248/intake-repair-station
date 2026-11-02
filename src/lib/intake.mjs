export const REQUIRED_COLUMNS = ['id', 'name', 'email', 'status', 'start_date'];
export const STATUSES = ['pending', 'active', 'completed', 'on_hold', 'withdrawn'];
export const MAX_BYTES = 1_000_000;
export const MAX_ROWS = 2000;
export const MAX_COLUMNS = 30;
const MAX_FIELD_EDIT = 10_000;

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function sourceRecords(raw) {
  const parsed = parseCSV(raw);
  const headers = parsed[0].values;
  if (new Set(headers).size !== headers.length || headers.some(header => !header.trim())) {
    throw new Error('Every column needs a unique, nonempty header.');
  }
  if (parsed.length < 2) throw new Error('The header is present, but there are no data rows.');
  return { parsed, headers };
}

function resolveColumnMap(headers, supplied) {
  if (supplied !== undefined && (!isRecord(supplied) || Object.keys(supplied).some(key => !REQUIRED_COLUMNS.includes(key)))) {
    throw new Error('Column mapping must use only id, name, email, status, and start_date.');
  }
  const columnMap = Object.fromEntries(REQUIRED_COLUMNS.map(field => [field, supplied === undefined ? field : (owns(supplied, field) ? supplied[field] : undefined)]));
  const missing = REQUIRED_COLUMNS.filter(field => typeof columnMap[field] !== 'string' || !headers.includes(columnMap[field]));
  if (missing.length) {
    if (supplied === undefined) throw new Error(`Missing required columns: ${missing.join(', ')}. Map the source columns or use these exact headers: ${REQUIRED_COLUMNS.join(', ')}.`);
    throw new Error(`Choose an existing source column for: ${missing.join(', ')}.`);
  }
  if (new Set(Object.values(columnMap)).size !== REQUIRED_COLUMNS.length) throw new Error('Use a different source column for each required field.');
  return columnMap;
}

/** Header suggestions only. Values and exact source headers are never changed. */
export function previewCSV(raw) {
  const { parsed, headers } = sourceRecords(raw);
  const aliases = {
    id: ['id', 'record_id', 'participant_id', 'intake_id'],
    name: ['name', 'full_name', 'participant_name'],
    email: ['email', 'email_address', 'e_mail'],
    status: ['status', 'intake_status', 'participant_status'],
    start_date: ['start_date', 'startdate'],
  };
  const key = header => header.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const suggestedMap = Object.fromEntries(REQUIRED_COLUMNS.map(field => {
    if (headers.includes(field)) return [field, field];
    const candidates = headers.filter(header => aliases[field].includes(key(header)));
    return [field, candidates.length === 1 ? candidates[0] : ''];
  }));
  return { headers: [...headers], rowCount: parsed.length - 1, suggestedMap };
}

export function getColumnIndex(dataset, canonicalField) {
  if (!REQUIRED_COLUMNS.includes(canonicalField)) return -1;
  const sourceHeader = dataset.columnMap?.[canonicalField] ?? canonicalField;
  return dataset.headers.indexOf(sourceHeader);
}

function validateChanges(dataset, changes) {
  if (!isRecord(changes)) throw new Error('Saved changes must be a record of reviewed field edits.');
  const rowKeys = new Set(dataset.rows.map(row => row.key));
  for (const [rowKey, entries] of Object.entries(changes)) {
    if (!rowKeys.has(rowKey) || !isRecord(entries)) throw new Error('A saved change refers to an unknown source row.');
    for (const [column, edit] of Object.entries(entries)) {
      const index = Number(column);
      if (!/^\d+$/.test(column) || String(index) !== column || !Number.isInteger(index) || index >= dataset.headers.length
        || !isRecord(edit) || typeof edit.value !== 'string' || edit.value.length > MAX_FIELD_EDIT || typeof edit.approved !== 'boolean'
        || Object.keys(edit).some(key => !['value', 'approved'].includes(key))) {
        throw new Error('A saved field change has an invalid column, value, or review status.');
      }
    }
  }
}

export function decodeUTF8(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error('Choose a valid UTF-8 CSV. Invalid byte sequences are not replaced or silently repaired.'); }
}

export const EXAMPLE_CSV = `id,name,email,status,start_date,notes
IR-1001,Amara Ellis,amara.ellis@example.com,active,2026-11-02,Orientation confirmed
IR-1002,"Bennett, Sol",sol.bennett@example.com, Active ,2026-11-03,"Prefers a morning session, if available"
IR-1003,Casey Rowan,casey.rowan.example.com,pending,2026-11-04,Confirm contact information
IR-1004,Dana Vale,dana.vale@example.com,completed,11/06/2026,Ask which date convention was used
IR-1004,Eli Hart,eli.hart@example.com,active,2026-11-05,Check the source ID against the intake record
,Fern Avery,fern.avery@example.com,pending,2026-11-06,An ID was not recorded
IR-1007,  Gray Ellis  ,gray.ellis@EXAMPLE.COM,on hold,2026-11-09,Awaiting a scheduling update
IR-1008,Haven Reed,haven.reed@example.com,complete,2026-11-10,"Source says ""complete""; confirm the intended status"
IR-1009,Indigo Lane,indigo.lane@example.com,active,2026-02-30,The calendar date needs checking
IR-1010,Jordan Moss,jordan.moss@example.com,withdrawn,2026-11-11,"A fictional note with
two lines; both are preserved"
IR-1011,Kai River,kai.river@example.com,pending,2026-11-12,Ready for the next step
IR-1012,Linden Ash,linden.ash@example.com,active,2026-11-13,All examples are fictional`;

/** Strict quoted CSV parser. Keeps blank records and source line numbers. */
export function parseCSV(text) {
  if (typeof text !== 'string') throw new Error('Paste a CSV or choose a UTF-8 CSV file.');
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('Choose a file smaller than 1 MB.');
  if (!text.trim()) throw new Error('The CSV is empty. Paste data or load the fictional example.');
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = [];
  let row = [], field = '', quoted = false, closed = false, line = 1, rowLine = 1;
  const endField = () => {
    row.push(field); field = ''; closed = false;
    if (row.length > MAX_COLUMNS) throw new Error(`Use at most ${MAX_COLUMNS} columns per record. No rows or extra values were removed.`);
  };
  const endRow = () => {
    endField(); records.push({ values: row, sourceLine: rowLine }); row = [];
    if (records.length > MAX_ROWS + 1) throw new Error(`This station supports up to ${MAX_ROWS.toLocaleString()} data rows per file.`);
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else {
        field += char;
        if (char === '\n' || (char === '\r' && source[i + 1] !== '\n')) line++;
      }
      continue;
    }
    if (char === ',') { endField(); continue; }
    if (char === '\r' || char === '\n') {
      endRow();
      if (char === '\r' && source[i + 1] === '\n') i++;
      line++; rowLine = line;
      continue;
    }
    if (closed) throw new Error(`Unexpected text after a closing quote near line ${line}. Keep commas and line breaks outside quoted fields.`);
    if (char === '"') {
      if (field.length) throw new Error(`Unexpected quote near line ${line}. Wrap the whole field in quotes and escape inner quotes as "".`);
      quoted = true;
    } else field += char;
  }
  if (quoted) throw new Error(`An opening quote is not closed near line ${rowLine}. Correct it before importing.`);
  if (field.length || row.length || closed) endRow();
  return records;
}

export function createDataset(raw, filename = 'intake.csv', synthetic = false, options = {}) {
  const { parsed, headers } = sourceRecords(raw);
  if (!isRecord(options)) throw new Error('Dataset options must contain a column mapping.');
  if (typeof filename !== 'string' || !filename || filename.length > 1024 || typeof synthetic !== 'boolean') throw new Error('The source filename or example flag is invalid.');
  const columnMap = resolveColumnMap(headers, options.columnMap);
  return {
    version: 1, raw, filename, synthetic, headers, columnMap, importedAt: new Date().toISOString(),
    rows: parsed.slice(1).map((row, index) => ({ key: `row-${index + 1}`, sourceLine: row.sourceLine, original: [...row.values] })),
  };
}

export function currentValues(row, changes, reviewedOnly = false) {
  const values = [...row.original];
  for (const [column, edit] of Object.entries(changes[row.key] || {})) {
    if (!reviewedOnly || edit.approved) values[Number(column)] = edit.value;
  }
  return values;
}

export function stageEdits(dataset, changes, edits) {
  validateChanges(dataset, changes);
  if (!Array.isArray(edits)) throw new Error('Proposed changes must be a list of field edits.');
  const next = structuredClone(changes);
  const rowsByKey = new Map(dataset.rows.map(row => [row.key, row]));
  for (const edit of edits) {
    if (!isRecord(edit)) throw new Error('The proposed change is invalid.');
    const { rowKey, column, value } = edit;
    const row = rowsByKey.get(rowKey);
    if (!row || !Number.isInteger(column) || column < 0 || column >= dataset.headers.length || typeof value !== 'string') throw new Error('The proposed change is invalid.');
    if (value.length > MAX_FIELD_EDIT) throw new Error('Keep each field under 10,000 characters.');
    next[rowKey] ||= {};
    if (value === (row.original[column] ?? '')) delete next[rowKey][column];
    else if (next[rowKey][column]?.value !== value) next[rowKey][column] = { value, approved: false };
    if (!Object.keys(next[rowKey]).length) delete next[rowKey];
  }
  return next;
}

export function listChanges(dataset, changes) {
  validateChanges(dataset, changes);
  return dataset.rows.flatMap(row => Object.entries(changes[row.key] || {}).map(([index, change]) => ({
    key: `${row.key}:${index}`, rowKey: row.key, sourceLine: row.sourceLine,
    column: Number(index), field: dataset.headers[Number(index)],
    before: row.original[Number(index)] ?? '', after: change.value, approved: change.approved,
  })));
}

export function approveChanges(changes, keys = null) {
  const selected = keys ? new Set(keys) : null;
  const next = structuredClone(changes);
  for (const [rowKey, entries] of Object.entries(next)) {
    for (const [column, change] of Object.entries(entries)) {
      if (!selected || selected.has(`${rowKey}:${column}`)) change.approved = true;
    }
  }
  return next;
}

export function rejectChange(changes, rowKey, column) {
  const next = structuredClone(changes);
  if (next[rowKey]) {
    delete next[rowKey][column];
    if (!Object.keys(next[rowKey]).length) delete next[rowKey];
  }
  return next;
}

export function validISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

const statusKey = value => value.trim().toLowerCase().replace(/[\s-]+/g, '_');
const aliases = { complete: 'completed', finished: 'completed', enrolled: 'active', paused: 'on_hold' };

/** Safe suggestions never infer dates, IDs, names, or status synonyms. */
export function safeNormalization(field, value) {
  let normalized = value.trim();
  if (field === 'email' && normalized.includes('@')) {
    const at = normalized.lastIndexOf('@');
    normalized = normalized.slice(0, at + 1) + normalized.slice(at + 1).toLowerCase();
  }
  if (field === 'status' && STATUSES.includes(statusKey(normalized))) normalized = statusKey(normalized);
  return normalized;
}

export function inspectDataset(dataset, changes = {}, reviewedOnly = false) {
  validateChanges(dataset, changes);
  const rows = dataset.rows.map(row => ({ ...row, values: currentValues(row, changes, reviewedOnly), issues: [] }));
  const index = Object.fromEntries(REQUIRED_COLUMNS.map(field => [field, getColumnIndex(dataset, field)]));
  const ids = new Map();
  for (const row of rows) {
    const id = (row.values[index.id] ?? '').trim();
    if (id) { if (!ids.has(id)) ids.set(id, []); ids.get(id).push(row.key); }
  }
  for (const row of rows) {
    const add = (code, field, title, detail, options = {}) => row.issues.push({
      key: `${row.key}:${code}:${field}`, rowKey: row.key, sourceLine: row.sourceLine,
      code, field, title, detail, ...options,
    });
    if (row.original.length !== dataset.headers.length) add('column_count', 'row', 'Column count mismatch', `This source row has ${row.original.length} values for ${dataset.headers.length} headers. Correct the source CSV and reimport; the original row remains in exceptions.`);
    for (const field of REQUIRED_COLUMNS) {
      const value = row.values[index[field]] ?? '';
      const trimmed = value.trim();
      if (!trimmed) {
        add(`missing_${field}`, field, `Missing ${field === 'id' ? 'ID' : field.replace('_', ' ')}`, 'Check the source record and enter the confirmed value. No value is inferred.');
        continue;
      }
      const safe = safeNormalization(field, value);
      if (safe !== value) add('normalization', field, 'Formatting variation', 'Review a whitespace or casing correction. The underlying value is preserved in the original.', { suggested: safe, safe: true });
      if (field === 'id' && ids.get(trimmed)?.length > 1) add('duplicate_id', field, 'Duplicate ID', `${ids.get(trimmed).length} rows share this ID after outer whitespace is removed. Confirm each source ID; neither row is deleted.`);
      if (field === 'email' && !/^[^\s@,]+@[^\s@,]+\.[^\s@,.]{2,}$/.test(trimmed)) add('invalid_email', field, 'Email format needs checking', 'Enter a confirmed address. A format check cannot verify whether a mailbox exists.');
      if (field === 'status' && !STATUSES.includes(statusKey(trimmed))) {
        const suggested = owns(aliases, statusKey(trimmed)) ? aliases[statusKey(trimmed)] : undefined;
        add('status_variant', field, 'Status needs confirmation', suggested ? `The source uses “${trimmed}”. “${suggested}” may be the intended status; confirm it before changing.` : `Use one of: ${STATUSES.join(', ')}. Confirm the source meaning first.`, { ...(suggested ? { suggested } : {}) });
      }
      if (field === 'start_date' && !validISODate(trimmed)) {
        const parts = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
        const ambiguous = parts && +parts[1] <= 12 && +parts[2] <= 12 && +parts[1] !== +parts[2];
        add(ambiguous ? 'ambiguous_date' : 'invalid_date', field, ambiguous ? 'Ambiguous date' : 'Date needs checking', ambiguous ? 'Day/month and month/day give different dates. Confirm the intended date with the source, then enter YYYY-MM-DD. No interpretation is selected.' : 'Use a real calendar date in YYYY-MM-DD format. No dates are inferred or automatically converted.');
      }
    }
  }
  const issues = rows.flatMap(row => row.issues);
  return { rows, issues, clean: rows.filter(row => !row.issues.length), exceptions: rows.filter(row => row.issues.length), duplicateGroups: [...ids.values()].filter(group => group.length > 1).length };
}

export function normalizationEdits(dataset, changes = {}) {
  const inspected = inspectDataset(dataset, changes);
  return inspected.issues.filter(issue => issue.safe).map(issue => ({ rowKey: issue.rowKey, column: getColumnIndex(dataset, issue.field), value: issue.suggested }));
}

export function encodeCSV(rows, protectFormulas = true) {
  const encode = value => {
    let text = String(value ?? '');
    if (protectFormulas && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return rows.map(row => row.map(encode).join(',')).join('\r\n') + '\r\n';
}

export function createExports(dataset, changes, protectFormulas = true) {
  if (listChanges(dataset, changes).some(change => !change.approved)) throw new Error('Approve or undo pending changes before exporting the handoff.');
  const result = inspectDataset(dataset, changes, true);
  return {
    ...result,
    cleanCSV: encodeCSV([dataset.headers, ...result.clean.map(row => row.values)], protectFormulas),
    exceptionCSV: encodeCSV([
      ['source_line', 'issue_count', 'issues', 'source_headers_json', 'original_values_json', 'reviewed_values_json'],
      ...result.exceptions.map(row => [row.sourceLine, row.issues.length, row.issues.map(issue => `${issue.field}: ${issue.title}`).join(' | '), JSON.stringify(dataset.headers), JSON.stringify(row.original), JSON.stringify(row.values)]),
    ], protectFormulas),
    allCSV: encodeCSV([dataset.headers, ...result.rows.map(row => row.values)], protectFormulas),
    changeCSV: encodeCSV([
      ['source_line', 'column', 'original', 'reviewed_value'],
      ...listChanges(dataset, changes).filter(change => change.approved).map(change => [change.sourceLine, change.field, change.before, change.after]),
    ], protectFormulas),
  };
}

export function restoreSession(value) {
  if (!isRecord(value) || value.version !== 1 || typeof value.raw !== 'string') throw new Error('Saved session is incompatible.');
  if (value.filename !== undefined && (typeof value.filename !== 'string' || !value.filename || value.filename.length > 1024)) throw new Error('Saved filename is invalid.');
  if (value.synthetic !== undefined && typeof value.synthetic !== 'boolean') throw new Error('Saved example flag must be true or false.');
  if (value.changes !== undefined && (!Array.isArray(value.changes) || value.changes.length > MAX_ROWS * MAX_COLUMNS)) throw new Error('Saved changes must be a bounded list of field edits.');
  const dataset = createDataset(value.raw, value.filename ?? 'intake.csv', value.synthetic ?? false, { columnMap: value.columnMap });
  if (value.importedAt !== undefined) {
    if (typeof value.importedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.importedAt)
      || !Number.isFinite(new Date(value.importedAt).valueOf()) || new Date(value.importedAt).toISOString() !== value.importedAt) throw new Error('Saved import time is invalid.');
    dataset.importedAt = value.importedAt;
  }
  const changes = {};
  const seen = new Set();
  const rowsByKey = new Map(dataset.rows.map(row => [row.key, row]));
  for (const change of value.changes || []) {
    if (!isRecord(change) || typeof change.rowKey !== 'string' || !Number.isInteger(change.column)
      || typeof change.value !== 'string' || typeof change.approved !== 'boolean'
      || Object.keys(change).some(key => !['rowKey', 'column', 'value', 'approved'].includes(key))) throw new Error('A saved field change is malformed.');
    const key = `${change.rowKey}:${change.column}`;
    if (seen.has(key)) throw new Error('Saved changes contain the same source field more than once.');
    seen.add(key);
    const row = rowsByKey.get(change.rowKey);
    if (!row || change.column < 0 || change.column >= dataset.headers.length || change.value.length > MAX_FIELD_EDIT) throw new Error('A saved field change refers to an invalid row, column, or value.');
    if (change.value === (row.original[change.column] ?? '')) throw new Error('A saved field change does not differ from its source value.');
    changes[change.rowKey] ||= {};
    changes[change.rowKey][change.column] = { value: change.value, approved: change.approved };
  }
  validateChanges(dataset, changes);
  return { dataset, changes };
}

export function sessionSnapshot(dataset, changes) {
  return { version: 1, raw: dataset.raw, filename: dataset.filename, synthetic: dataset.synthetic,
    columnMap: { ...dataset.columnMap }, importedAt: dataset.importedAt,
    changes: listChanges(dataset, changes).map(change => ({ rowKey: change.rowKey, column: change.column, value: change.after, approved: change.approved })) };
}
