import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCSV, decodeUTF8, createDataset, EXAMPLE_CSV, currentValues, inspectDataset, normalizationEdits, stageEdits, approveChanges, rejectChange, createExports, encodeCSV, validISODate, sessionSnapshot, restoreSession, previewCSV, getColumnIndex, MAX_BYTES, MAX_ROWS, MAX_COLUMNS } from './intake.mjs';

test('UTF-8 uploads preserve a BOM and reject invalid bytes instead of replacing data', () => {
  const source = '\ufeff' + EXAMPLE_CSV;
  const decoded = decodeUTF8(new TextEncoder().encode(source));
  assert.equal(decoded, source);
  assert.equal(createDataset(decoded).raw, source);
  assert.throws(() => decodeUTF8(new Uint8Array([0xc3, 0x28])), /valid UTF-8/);
});

test('quoted commas, escaped quotes, CRLF, and embedded line breaks are preserved', () => {
  const parsed = parseCSV('a,b\r\n"x,y","say ""hello""\r\nnext"\r\nz,q\r\n');
  assert.deepEqual(parsed.map(row => row.values), [['a', 'b'], ['x,y', 'say "hello"\r\nnext'], ['z', 'q']]);
  assert.equal(parsed[2].sourceLine, 4);
});
test('trailing empty fields and interior blank records are not removed', () => {
  assert.deepEqual(parseCSV('a,b\n1,\n\n2,3\n').map(row => row.values), [['a', 'b'], ['1', ''], [''], ['2', '3']]);
});
test('malformed quoting fails with a useful message', () => {
  assert.throws(() => parseCSV('a,b\n"open,x'), /not closed/);
  assert.throws(() => parseCSV('a,b\n"closed"x,y'), /closing quote/);
  assert.throws(() => parseCSV('a,b\nnot"quoted,y'), /Unexpected quote/);
});
test('missing or duplicate headers are rejected without discarding source rows', () => {
  assert.throws(() => createDataset('name,email\nx,x@example.com'), /Missing required columns/);
  assert.throws(() => createDataset('id,name,email,status,start_date,id\n1,A,a@b.com,active,2026-01-01,1'), /unique/);
});
test('both duplicate rows and ambiguous dates remain unresolved', () => {
  const dataset = createDataset(EXAMPLE_CSV);
  const result = inspectDataset(dataset);
  assert.equal(result.rows.length, 12);
  assert.equal(result.issues.filter(issue => issue.code === 'duplicate_id').length, 2);
  assert.equal(result.issues.filter(issue => issue.code === 'ambiguous_date').length, 1);
  assert.equal(result.issues.find(issue => issue.code === 'ambiguous_date').suggested, undefined);
});
test('safe normalization does not guess IDs, dates, email local-parts, or synonyms', () => {
  const dataset = createDataset('id,name,email,status,start_date\n 1 , A ,User@EXAMPLE.COM, Active ,11/06/2026\n2,B,b@example.com,complete,2026-01-01');
  const edits = normalizationEdits(dataset);
  assert.ok(edits.some(edit => edit.value === 'User@example.com'));
  assert.ok(edits.some(edit => edit.value === 'active'));
  assert.ok(!edits.some(edit => edit.column === 4 || edit.value === 'completed'));
});
test('staged edits keep the source immutable and must be reviewed before export', () => {
  const dataset = createDataset(EXAMPLE_CSV);
  const original = structuredClone(dataset);
  let changes = stageEdits(dataset, {}, [{ rowKey: 'row-3', column: 2, value: 'casey.rowan@example.com' }]);
  assert.deepEqual(dataset, original);
  assert.throws(() => createExports(dataset, changes), /Approve or undo/);
  assert.equal(currentValues(dataset.rows[2], changes, true)[2], 'casey.rowan.example.com');
  changes = approveChanges(changes);
  assert.equal(currentValues(dataset.rows[2], changes, true)[2], 'casey.rowan@example.com');
  assert.deepEqual(rejectChange(changes, 'row-3', 2), {});
});
test('every input row belongs to either the clean file or the exception file', () => {
  const dataset = createDataset(EXAMPLE_CSV);
  const changes = approveChanges(stageEdits(dataset, {}, normalizationEdits(dataset)));
  const exports = createExports(dataset, changes);
  assert.equal(exports.clean.length + exports.exceptions.length, dataset.rows.length);
  assert.equal(exports.rows.length, 12);
  assert.equal(exports.issues.filter(issue => issue.code === 'duplicate_id').length, 2);
  assert.equal(parseCSV(exports.exceptionCSV).length - 1, exports.exceptions.length);
  assert.deepEqual(parseCSV(exports.allCSV).slice(1).map(row => row.values), exports.rows.map(row => row.values));
});
test('CSV serialization round-trips multiline values and protects formula-like cells', () => {
  const rows = [['a', 'b'], ['two\nlines', 'a,"quote"']];
  assert.deepEqual(parseCSV(encodeCSV(rows)).map(row => row.values), rows);
  assert.equal(parseCSV(encodeCSV([['=SUM(1,2)', '+123', '@item']]))[0].values[0], "'=SUM(1,2)");
  assert.equal(parseCSV(encodeCSV([['=1']], false))[0].values[0], '=1');
});
test('impossible dates fail and real leap dates pass', () => {
  assert.equal(validISODate('2026-02-30'), false);
  assert.equal(validISODate('2028-02-29'), true);
  assert.equal(validISODate('2026-02-29'), false);
  assert.equal(validISODate('11/06/2026'), false);
});
test('ragged source rows remain in exceptions even if fields are filled', () => {
  const dataset = createDataset('id,name,email,status,start_date\n1,A,a@example.com,active,2026-01-01,extra\n2,B');
  assert.equal(inspectDataset(dataset).exceptions.length, 2);
  assert.equal(createExports(dataset, {}).rows[0].values.at(-1), 'extra');
});
test('optional browser snapshots retain the exact original and review state', () => {
  const dataset = createDataset(EXAMPLE_CSV, 'fictional.csv', true);
  const changes = approveChanges(stageEdits(dataset, {}, normalizationEdits(dataset)));
  const restored = restoreSession(JSON.parse(JSON.stringify(sessionSnapshot(dataset, changes))));
  assert.equal(restored.dataset.raw, EXAMPLE_CSV);
  assert.deepEqual(restored.changes, changes);
});

test('mapping previews suggest obvious unique headers, preserve exact spelling, and count blank records', () => {
  const raw = ' Participant ID ,Full Name,Email Address,Intake Status,Start Date,Notes\r\n001,A,a@example.com,active,2026-01-01,unchanged\r\n\r\n';
  const preview = previewCSV(raw);
  assert.equal(preview.rowCount, 2);
  assert.deepEqual(preview.headers, [' Participant ID ', 'Full Name', 'Email Address', 'Intake Status', 'Start Date', 'Notes']);
  assert.deepEqual(preview.suggestedMap, { id: ' Participant ID ', name: 'Full Name', email: 'Email Address', status: 'Intake Status', start_date: 'Start Date' });
  const uncertain = previewCSV('record_id,participant_id,full_name,participant_name,contact,stage,date\n1,2,A,B,a@example.com,active,2026-01-01');
  assert.deepEqual(uncertain.suggestedMap, { id: '', name: '', email: '', status: '', start_date: '' });
  assert.equal(raw.includes(' Participant ID '), true);
});

test('mapped and reordered input is validated and repaired by canonical role without renaming headers', () => {
  const raw = '\ufeffNotes,Start Date,Email Address,Full Name,Participant ID,Intake Status,extra\r\n"two\r\nlines",2026-01-01,User@EXAMPLE.COM, Jo ,00012, Active ,\r\nkeep,11/06/2026,b@example.com,B,00013,pending,tail\r\nshort\r\n';
  const { suggestedMap } = previewCSV(raw);
  assert.throws(() => createDataset(raw), /Missing required columns/);
  const dataset = createDataset(raw, 'mapped.csv', false, { columnMap: suggestedMap });
  assert.equal(dataset.raw, raw);
  assert.equal(getColumnIndex(dataset, 'id'), 4);
  assert.equal(getColumnIndex(dataset, 'email'), 2);
  assert.equal(getColumnIndex(dataset, 'unexpected'), -1);
  const edits = normalizationEdits(dataset);
  assert.ok(edits.some(edit => edit.column === 2 && edit.value === 'User@example.com'));
  assert.ok(edits.some(edit => edit.column === 3 && edit.value === 'Jo'));
  assert.ok(edits.some(edit => edit.column === 5 && edit.value === 'active'));
  assert.ok(!edits.some(edit => edit.column === 1 || edit.column === 4));
  const changes = approveChanges(stageEdits(dataset, {}, edits));
  const exports = createExports(dataset, changes, false);
  assert.equal(exports.clean.length, 1);
  assert.equal(exports.exceptions.length, 2);
  assert.deepEqual(parseCSV(exports.allCSV)[0].values, dataset.headers);
  assert.equal(parseCSV(exports.allCSV)[1].values[4], '00012');
  assert.equal(parseCSV(exports.allCSV)[1].values[0], 'two\r\nlines');
  assert.equal(parseCSV(exports.changeCSV)[1].values[1], 'Email Address');
  assert.deepEqual(parseCSV(exports.exceptionCSV).slice(1).map(record => JSON.parse(record.values[4])), dataset.rows.slice(1).map(row => row.original));
  assert.deepEqual(dataset.headers, ['Notes', 'Start Date', 'Email Address', 'Full Name', 'Participant ID', 'Intake Status', 'extra']);
});

test('explicit mappings reject missing, repeated, nonexistent, and unknown roles', () => {
  const map = Object.fromEntries(['id', 'name', 'email', 'status', 'start_date'].map(name => [name, name]));
  for (const columnMap of [{}, { ...map, email: 'missing' }, { ...map, name: 'id' }, { ...map, surprise: 'id' }, null, []]) {
    assert.throws(() => createDataset(EXAMPLE_CSV, 'x.csv', false, { columnMap }), /column|mapping|field/i);
  }
  const poisoned = JSON.parse('{"id":"id","name":"name","email":"email","status":"status","start_date":"start_date","__proto__":"name"}');
  assert.throws(() => createDataset(EXAMPLE_CSV, 'x.csv', false, { columnMap: poisoned }), /mapping/);
});

test('arbitrary extra header names and hostile-looking cells are preserved as data', () => {
  const raw = 'id,name,email,status,start_date,__proto__,constructor\n001,"<script>alert(1)</script>",a@example.com,constructor,2026-01-01,"=SUM(1,2)","@value"';
  const dataset = createDataset(raw);
  const result = inspectDataset(dataset);
  assert.equal(result.issues.find(issue => issue.code === 'status_variant').suggested, undefined);
  assert.equal(dataset.rows[0].original[1], '<script>alert(1)</script>');
  assert.deepEqual(parseCSV(createExports(dataset, {}, false).allCSV).slice(1).map(row => row.values), dataset.rows.map(row => row.original));
  const protectedRow = parseCSV(createExports(dataset, {}, true).allCSV)[1].values;
  assert.equal(protectedRow[5], "'=SUM(1,2)");
  assert.equal(protectedRow[6], "'@value");
  assert.equal(dataset.raw, raw);
});

test('export approval applies to the exact staged value and cannot be forged with a truthy flag', () => {
  const dataset = createDataset(EXAMPLE_CSV);
  let changes = stageEdits(dataset, {}, [{ rowKey: 'row-3', column: 2, value: 'first@example.com' }]);
  changes = approveChanges(changes);
  changes = stageEdits(dataset, changes, [{ rowKey: 'row-3', column: 2, value: 'second@example.com' }]);
  assert.equal(changes['row-3'][2].approved, false);
  assert.throws(() => createExports(dataset, changes), /Approve or undo/);
  assert.throws(() => createExports(dataset, { 'row-3': { 2: { value: 'second@example.com', approved: 'yes' } } }), /review status/);
  changes = stageEdits(dataset, changes, [{ rowKey: 'row-3', column: 2, value: dataset.rows[2].original[2] }]);
  assert.deepEqual(changes, {});
  assert.equal(createExports(dataset, changes).rows.length, dataset.rows.length);
});

test('mapped backup round-trip retains raw data, mapping, import time, and pending as well as approved repairs', () => {
  const raw = 'person,mail,state,date,identifier\nA,a@example.com,active,2026-01-01,1\nB,b@example.com,pending,2026-01-02,2';
  const columnMap = { id: 'identifier', name: 'person', email: 'mail', status: 'state', start_date: 'date' };
  const dataset = createDataset(raw, 'source.csv', false, { columnMap });
  let changes = stageEdits(dataset, {}, [{ rowKey: 'row-1', column: 1, value: 'updated@example.com' }, { rowKey: 'row-2', column: 2, value: 'active' }]);
  changes = approveChanges(changes, ['row-1:1']);
  const snapshot = JSON.parse(JSON.stringify(sessionSnapshot(dataset, changes)));
  const restored = restoreSession(snapshot);
  assert.deepEqual(restored.dataset, dataset);
  assert.deepEqual(restored.changes, changes);
  assert.throws(() => createExports(restored.dataset, restored.changes), /Approve or undo/);
  assert.deepEqual(createExports(restored.dataset, approveChanges(restored.changes), false), createExports(dataset, approveChanges(changes), false));
  const legacy = { version: 1, raw: EXAMPLE_CSV, changes: [] };
  assert.equal(getColumnIndex(restoreSession(legacy).dataset, 'email'), 2);
});

test('session restore rejects corruption instead of skipping records or guessing review state', () => {
  const dataset = createDataset(EXAMPLE_CSV);
  const changes = stageEdits(dataset, {}, [{ rowKey: 'row-3', column: 2, value: 'fixed@example.com' }]);
  const original = sessionSnapshot(dataset, changes);
  const variants = [
    { changes: {} }, { changes: null }, { synthetic: 'false' }, { filename: 42 }, { importedAt: '2026-02-30T00:00:00.000Z' },
    { columnMap: { ...dataset.columnMap, email: 'not a header' } },
    { changes: [null] }, { changes: [{ ...original.changes[0], approved: 'true' }] },
    { changes: [{ ...original.changes[0], rowKey: 'row-999' }] },
    { changes: [{ ...original.changes[0], rowKey: '__proto__' }] },
    { changes: [{ ...original.changes[0], column: 30 }] },
    { changes: [{ ...original.changes[0], column: '2' }] },
    { changes: [{ ...original.changes[0], value: 'x'.repeat(10001) }] },
    { changes: [{ ...original.changes[0], value: dataset.rows[2].original[2] }] },
    { changes: [original.changes[0], original.changes[0]] },
  ];
  for (const variant of variants) assert.throws(() => restoreSession({ ...original, ...variant }));
  assert.deepEqual(restoreSession(original).changes, changes);
});

test('source limits count UTF-8 bytes, records, and actual columns without truncating', () => {
  assert.throws(() => parseCSV('é'.repeat(MAX_BYTES / 2 + 1)), /1 MB/);
  const header = 'id,name,email,status,start_date';
  const rows = Array.from({ length: MAX_ROWS }, (_, index) => `${index},A,a@example.com,active,2026-01-01`);
  assert.equal(createDataset([header, ...rows].join('\n')).rows.length, MAX_ROWS);
  assert.throws(() => createDataset([header, ...rows, '2001,B,b@example.com,pending,2026-01-01'].join('\n')), /2,000/);
  const columns = ['id', 'name', 'email', 'status', 'start_date', ...Array.from({ length: MAX_COLUMNS - 5 }, (_, i) => `extra${i}`)];
  assert.equal(createDataset(`${columns.join(',')}\n1,A,a@example.com,active,2026-01-01`).headers.length, MAX_COLUMNS);
  assert.throws(() => createDataset(`${columns.join(',')},too_many\n1,A,a@example.com,active,2026-01-01`), /30 columns/);
  assert.throws(() => createDataset(`${header}\n${Array.from({ length: 31 }, () => 'x').join(',')}`), /30 columns/);
});

test('formula protection covers whitespace-prefixed formulas and exact-value mode is explicit', () => {
  const source = [['\t=1+1', '\r\n+42', ' -1', '@SUM(A1)', 'safe', "'=already-text"]];
  const protectedValues = parseCSV(encodeCSV(source))[0].values;
  assert.deepEqual(protectedValues, ["'\t=1+1", "'\r\n+42", "' -1", "'@SUM(A1)", 'safe', "'=already-text"]);
  assert.deepEqual(parseCSV(encodeCSV(source, false))[0].values, source[0]);
});
