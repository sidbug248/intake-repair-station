import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { createDataset, inspectDataset, previewCSV, parseCSV, stageEdits, approveChanges, normalizationEdits, sessionSnapshot, restoreSession, createExports } from '../src/lib/intake.mjs';
import { DEFAULT_RECIPE, validateRecipe, recipeFromDataset, applyRecipeMapping, exportRecipe, importRecipe, saveRecipe, loadSavedRecipes, removeSavedRecipe } from '../src/lib/recipes.mjs';
import { readImportFile, getOriginalSource } from '../src/lib/formats.mjs';
import { compareDatasets, comparisonCSV } from '../src/lib/comparison.mjs';
import { base64ToBytes, validateSource } from '../src/lib/source.mjs';

const recipe = overrides => ({ ...DEFAULT_RECIPE, requiredFields: [], ...overrides });
const generic = (raw, filename = 'data.csv', extra = {}) => createDataset(raw, filename, false, { recipe: recipe({}), ...extra });
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const cell = (reference, text) => `<c r="${reference}" t="inlineStr"><is><t>${escape(text)}</t></is></c>`;
const table = rows => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((values, r) => `<row r="${r + 1}">${values.map((text, c) => cell(`${String.fromCharCode(65 + c)}${r + 1}`, text)).join('')}</row>`).join('')}</sheetData></worksheet>`;
function workbook(sheets = [table([['Key', 'Value'], ['001', 'A']])], extra = {}) {
  return zipSync({
    'xl/workbook.xml': strToU8(`<workbook xmlns:r="urn:relationships"><sheets>${sheets.map((_, i) => `<sheet name="Sheet ${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"${i ? ' state="hidden"' : ''}/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
    ...Object.fromEntries(sheets.map((xml, i) => [`xl/worksheets/sheet${i + 1}.xml`, strToU8(xml)])), ...extra,
  });
}
const file = (bytes, name = 'example.xlsx') => ({ name, size: bytes.length, arrayBuffer: async () => bytes.slice().buffer });

test('a recipe can review other kinds of operational lists without the five-field contract', () => {
  const data = generic('Ticket,Priority,Cost\nT1,high,120\nT2,urgent,-2\n,low,unknown', 'tickets.csv', {
    recipe: recipe({ name: 'Support requests', rules: [{ column: 'Ticket', type: 'required' }, { column: 'Priority', type: 'enum', values: ['low', 'high'] }, { column: 'Cost', type: 'number', min: 0, max: 500 }] }),
  });
  const result = inspectDataset(data);
  assert.equal(result.rows.length, 3);
  assert.equal(result.clean.length, 1);
  assert.equal(result.exceptions.length, 2);
  assert.equal(result.issues.filter(issue => issue.code.endsWith('_number')).length, 2);
  assert.deepEqual(data.columnMap, { id: '', name: '', email: '', status: '', start_date: '' });
});

test('optional mapped fields are checked when present; missing optional values are accepted', () => {
  const data = createDataset('id,email,status\n1,, READY \n2,invalid,sleeping', 'contacts.csv', false, {
    recipe: recipe({ requiredFields: ['id'], statuses: ['Ready', 'Waiting'] }),
  });
  const result = inspectDataset(data);
  assert.equal(result.issues.some(issue => issue.code === 'missing_email'), false);
  assert.ok(result.issues.some(issue => issue.code === 'invalid_email'));
  assert.ok(result.issues.some(issue => issue.code === 'status_variant'));
  assert.equal(normalizationEdits(data).find(edit => edit.column === 2).value, 'Ready');
  assert.throws(() => createDataset('name\nA', 'x.csv', false, { recipe: recipe({ requiredFields: ['id'] }) }), /Missing required/);
});

test('custom unique rules retain all duplicates and treat blank requirements separately', () => {
  const data = generic('Reference,Code\nA, 01 \nB,01\nC,', 'refs.csv', { recipe: recipe({ rules: [{ column: 'Code', type: 'unique' }] }) });
  const result = inspectDataset(data);
  assert.equal(result.issues.length, 2);
  assert.deepEqual(result.exceptions.map(row => row.key), ['row-1', 'row-2']);
  assert.equal(result.clean[0].key, 'row-3');
  assert.equal(createExports(data, {}).rows.length, 3);
});

test('recipe validation rejects unknown execution, ambiguous statuses, invalid bounds and missing columns', () => {
  for (const input of [
    recipe({ expression: 'fetch("https://example.com")' }),
    recipe({ statuses: ['Active', 'active'] }),
    recipe({ rules: [{ column: 'A', type: 'regex', values: ['.*'] }] }),
    recipe({ rules: [{ column: 'A', type: 'number', min: 3, max: 2 }] }),
    recipe({ rules: [{ column: 'A', type: 'required', min: 0 }] }),
    recipe({ rules: [{ column: 'A', type: 'max_length', length: 1.5 }] }),
    recipe({ columnMap: { id: 'A', name: 'A' } }),
    recipe({ requiredFields: ['unknown'] }),
  ]) assert.throws(() => validateRecipe(input));
  assert.throws(() => validateRecipe(recipe({ rules: [{ column: 'Missing', type: 'required' }] }), ['A']), /missing/);
  assert.throws(() => importRecipe('{not json}'), /JSON/);
  const data = generic('A\n1');
  data.recipe.requiredFields = ['id'];
  assert.throws(() => inspectDataset(data), /existing source column/);
});

test('recipe save, portable export and mapping reuse store no participant rows', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const data = generic('Reference,Person\nSECRET-01,PRIVATE NAME', 'data.csv', { columnMap: { id: 'Reference', name: 'Person' } });
  const saved = recipeFromDataset(data, 'Recurring list');
  saveRecipe(saved, storage);
  assert.deepEqual(loadSavedRecipes(storage), [saved]);
  assert.ok(![...values.values()][0].includes('SECRET-01'));
  assert.ok(![...values.values()][0].includes('PRIVATE NAME'));
  assert.deepEqual(importRecipe(exportRecipe(saved)), saved);
  assert.equal(applyRecipeMapping(['Person', 'Reference'], saved).id, 'Reference');
  assert.equal(applyRecipeMapping(['Person'], saved).id, '');
  assert.equal(removeSavedRecipe('Recurring list', storage).length, 0);
});

test('recipe and original source survive reviewed session backups', async () => {
  const original = '\ufeffTicket\tPriority\r\n001\t high \r\n';
  const imported = await readImportFile(file(strToU8(original), 'source.tsv'));
  const data = generic(imported.raw, imported.filename, { source: imported.source, recipe: recipe({ name: 'Tickets', rules: [{ column: 'Ticket', type: 'required' }] }) });
  const changes = approveChanges(stageEdits(data, {}, [{ rowKey: 'row-1', column: 1, value: 'high' }]));
  const restored = restoreSession(JSON.parse(JSON.stringify(sessionSnapshot(data, changes))));
  assert.deepEqual(restored.dataset.recipe, data.recipe);
  assert.deepEqual(getOriginalSource(restored.dataset).bytes, strToU8(original));
  assert.equal(getOriginalSource(restored.dataset).format, 'tsv');
  assert.deepEqual(restored.changes, changes);
  assert.throws(() => validateSource({ ...imported.source, base64: '!!!!' }), /malformed/);
  assert.throws(() => base64ToBytes('AB=='), /malformed/);
});

test('TSV supports quoted tabs and embedded lines without silently dropping blank records', async () => {
  const original = 'Key\tNotes\n001\t"tab\there, comma\nand line"\n\n002\t"say ""hello"""\n';
  const imported = await readImportFile(file(strToU8(original), 'records.tsv'));
  const rows = parseCSV(imported.raw);
  assert.deepEqual(rows[1].values, ['001', 'tab\there, comma\nand line']);
  assert.deepEqual(rows[2].values, ['']);
  assert.equal(rows[3].values[1], 'say "hello"');
  assert.equal(previewCSV(imported.raw).rowCount, 3);
});

test('XLSX reads inline text and entities, preserves leading zero strings and complete original bytes', async () => {
  const bytes = workbook([table([['Key', 'Notes'], ['001', 'A & B <C>'], ['002', 'two\nlines']])]);
  const imported = await readImportFile(file(bytes));
  assert.equal(imported.selectedSheet, 'Sheet 1');
  assert.deepEqual(parseCSV(imported.raw).map(row => row.values), [['Key', 'Notes'], ['001', 'A & B <C>'], ['002', 'two\nlines']]);
  const data = generic(imported.raw, imported.filename, { source: imported.source });
  assert.deepEqual(getOriginalSource(data).bytes, bytes);
  assert.equal(getOriginalSource(data).mime, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.deepEqual(data.rows.map(row => row.sourceLine), [2, 3]);
});

test('XLSX decodes escaped cell text once and refuses invalid Unicode instead of replacing it', async () => {
  const bytes = workbook([table([['Key', 'Notes'], ['001', 'line_x000D_break'], ['002', 'literal _x005F_x0041_'], ['003', '_xD83D__xDE00_']])]);
  const imported = await readImportFile(file(bytes));
  assert.deepEqual(parseCSV(imported.raw).slice(1).map(row => row.values[1]), ['line\rbreak', 'literal _x0041_', '😀']);
  await assert.rejects(readImportFile(file(workbook([table([['Key'], ['_xD800_']])]))), /Unicode surrogate/);
});

test('XLSX requires explicit multi-sheet selection including hidden sheets', async () => {
  const bytes = workbook([table([['Key'], ['A']]), table([['Key'], ['B']])]);
  const pending = await readImportFile(file(bytes));
  assert.equal(pending.needsSheet, true);
  assert.equal(pending.raw, undefined);
  assert.equal(pending.sheets[1].hidden, true);
  const chosen = await readImportFile(file(bytes), { sheetName: 'Sheet 2' });
  assert.equal(parseCSV(chosen.raw)[1].values[0], 'B');
  assert.throws(() => generic(chosen.raw, chosen.filename, { source: { ...chosen.source, selectedSheet: '' } }), /worksheet/);
  await assert.rejects(readImportFile(file(bytes), { sheetName: 'Unknown' }), /existing worksheet/);
});

test('XLSX resolves shared strings and cached formulas with explicit warnings; hidden and absent interior rows survive', async () => {
  const xml = `<worksheet><sheetData><row r="1">${cell('A1', 'Key')}${cell('B1', 'Value')}</row><row r="2" hidden="1"><c r="A2" t="s"><v>0</v></c><c r="B2" s="1"><f>1+1</f><v>2</v></c></row><row r="4">${cell('A4', 'C')}<c r="B4" t="b"><v>1</v></c></row></sheetData></worksheet>`;
  const bytes = workbook([xml], { 'xl/sharedStrings.xml': strToU8('<sst><si><r><t>00</t></r><r><t>1</t></r><rPh><t>not visible</t></rPh></si></sst>') });
  const imported = await readImportFile(file(bytes));
  assert.deepEqual(parseCSV(imported.raw).map(row => row.values), [['Key', 'Value'], ['001', '2'], ['', ''], ['C', 'TRUE']]);
  assert.ok(imported.warnings.some(warning => warning.includes('may be stale')));
  assert.ok(imported.warnings.some(warning => warning.includes('underlying numeric')));
  assert.ok(imported.warnings.some(warning => warning.includes('hidden row')));
});

test('XLSX fails clearly for unresolved formulas, merged cells, errors, unsafe XML and bounds', async () => {
  const invalid = [
    '<worksheet><sheetData><row r="1"><c r="A1"><f>1+1</f></c></row></sheetData></worksheet>',
    '<worksheet><sheetData/><mergeCells><mergeCell ref="A1:B1"/></mergeCells></worksheet>',
    '<worksheet><sheetData><row r="1"><c r="A1" t="e"><v>#DIV/0!</v></c></row></sheetData></worksheet>',
    '<!DOCTYPE worksheet [<!ENTITY bad SYSTEM "file:///etc/passwd">]><worksheet><sheetData/></worksheet>',
    '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>99</v></c></row></sheetData></worksheet>',
    '<worksheet><sheetData><row r="2002"/></sheetData></worksheet>',
    '<worksheet><sheetData><row r="1"><c r="AE1"/></row></sheetData></worksheet>',
    '<worksheet><sheetData><row r="1"><c r="A2"/></row></sheetData></worksheet>',
    '<worksheet><sheetData><row r="1"></sheetData></row></worksheet>',
  ];
  for (const xml of invalid) await assert.rejects(readImportFile(file(workbook([xml]))));
  await assert.rejects(readImportFile(file(strToU8('not a zip'))), /readable workbook/);
  await assert.rejects(readImportFile(file(strToU8('any'), 'file.xls')), /Legacy XLS/);
  const bomb = workbook([table([['Key'], ['A']])], { 'xl/sharedStrings.xml': strToU8(' '.repeat(8_000_001)) });
  await assert.rejects(readImportFile(file(bomb)), /8 MB/);
});

test('XLSX verifies actual expansion, checksums, local sizes and XML depth before accepting data', async () => {
  function alterPart(input, partName, change) {
    const bytes = input.slice(), view = new DataView(bytes.buffer);
    for (let offset = 0; offset < bytes.length - 46; offset++) {
      if (view.getUint32(offset, true) !== 0x02014b50) continue;
      const length = view.getUint16(offset + 28, true);
      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + length));
      if (name !== partName) continue;
      change(view, offset, view.getUint32(offset + 42, true));
      return bytes;
    }
    throw new Error('Fixture part missing');
  }
  const normal = workbook();
  const badCRC = alterPart(normal, 'xl/workbook.xml', (view, central, local) => {
    const changed = (view.getUint32(central + 16, true) ^ 1) >>> 0;
    view.setUint32(central + 16, changed, true); view.setUint32(local + 14, changed, true);
  });
  await assert.rejects(readImportFile(file(badCRC)), /checksum check/);
  const inconsistent = alterPart(normal, 'xl/workbook.xml', (view, central) => view.setUint32(central + 24, 1, true));
  await assert.rejects(readImportFile(file(inconsistent)), /inconsistent/);
  const expanded = workbook([table([['Key'], ['A']])], { 'xl/sharedStrings.xml': strToU8('<sst>' + ' '.repeat(2_000_000) + '</sst>') });
  const falsified = alterPart(expanded, 'xl/sharedStrings.xml', (view, central, local) => {
    view.setUint32(central + 24, 10, true); view.setUint32(local + 22, 10, true);
  });
  await assert.rejects(readImportFile(file(falsified)), /exceeds its declared size/);
  const deep = workbook(['<worksheet>' + '<x>'.repeat(50) + '</x>'.repeat(50) + '</worksheet>']);
  await assert.rejects(readImportFile(file(deep)), /too complex/);
});

test('comparison identifies changes, additions, removals and ambiguity without mutating or dropping records', () => {
  const previous = generic('Key,Name\n1,A\n2,B\n3,C\n4,D\n4,E\n,Unknown', 'before.csv');
  const next = generic('Key,Name\n1,A\n2,Changed\n5,New\n4,D\n,Still unknown', 'after.csv');
  const source = JSON.stringify({ previous, next });
  const result = compareDatasets(previous, next, { keyColumn: 'Key' });
  assert.deepEqual(result.counts, { added: 1, removed: 1, changed: 1, unchanged: 1, ambiguous: 3, previousRows: 6, nextRows: 5, ambiguousPreviousRows: 3, ambiguousNextRows: 2 });
  assert.equal(result.changed[0].changes[0].after, 'Changed');
  assert.equal(result.ambiguous.find(item => item.key === '4').previousRows.length, 2);
  assert.equal(JSON.stringify({ previous, next }), source);
  const rows = parseCSV(comparisonCSV(result));
  assert.equal(rows.length, 8);
  assert.ok(rows.some(row => row.values[0] === 'ambiguous' && row.values[4] === 'duplicate_key'));
});

test('comparison needs a real key and approved corrections, and reports structural column changes', () => {
  const previous = generic('Key,Old\n1,A');
  const next = generic('Key,New\n1,B');
  assert.throws(() => compareDatasets(previous, next, { keyColumn: 'missing' }), /comparison key/);
  const proposed = stageEdits(previous, {}, [{ rowKey: 'row-1', column: 1, value: 'B' }]);
  assert.throws(() => compareDatasets(previous, next, { keyColumn: 'Key', previousChanges: proposed }), /Approve or undo/);
  const result = compareDatasets(previous, next, { keyColumn: 'Key', previousChanges: approveChanges(proposed) });
  assert.deepEqual(result.columnsAdded, ['New']);
  assert.deepEqual(result.columnsRemoved, ['Old']);
  assert.equal(result.changed[0].changes.length, 2);
  assert.equal(result.changed[0].changes[0].after, null);
});
