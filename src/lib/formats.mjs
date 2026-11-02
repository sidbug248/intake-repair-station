import { Inflate } from 'fflate';
import { decodeUTF8, encodeCSV, parseDelimited, previewCSV, MAX_BYTES, MAX_ROWS, MAX_COLUMNS } from './intake.mjs';
import { createSource } from './source.mjs';
export { getOriginalSource } from './source.mjs';

export const ACCEPTED_IMPORT_TYPES = '.csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_XML_BYTES = 8_000_000;
const MAX_XML_NODES = 220_000;
const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const localName = name => name.split(':').at(-1);
const children = (node, name) => node.children.filter(child => child.name === name);
const child = (node, name) => children(node, name)[0];
const textContent = node => node ? node.parts.map(part => typeof part === 'string' ? part : textContent(part)).join('') : '';

function xmlText(text) {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9A-Fa-f]+;)/.test(text)) throw new Error('The workbook contains an unsupported XML entity.');
  return text.replace(/&(#x[0-9A-Fa-f]+|#\d+|amp|lt|gt|quot|apos);/g, (_, value) => {
    if (value[0] !== '#') return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[value];
    const code = value[1] === 'x' ? Number.parseInt(value.slice(2), 16) : Number(value.slice(1));
    if (!Number.isInteger(code) || code > 0x10ffff || code === 0 || (code >= 0xd800 && code <= 0xdfff)
      || (code < 0x20 && ![9, 10, 13].includes(code))) throw new Error('The workbook contains an invalid XML character.');
    return String.fromCodePoint(code);
  });
}

/** Small bounded XML reader for SpreadsheetML. DTDs and entities are never loaded. */
function readXML(bytes, partName) {
  if (!bytes) throw new Error(`The workbook is missing ${partName}.`);
  const xml = decodeUTF8(bytes).replace(/^\ufeff/, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Workbook XML with DTDs or custom entities is not supported.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(xml)) throw new Error('Workbook XML contains invalid control characters.');
  const root = { name: '#document', children: [], parts: [] };
  const stack = [root];
  let offset = 0, count = 0;
  while (offset < xml.length) {
    if (xml[offset] !== '<') {
      const end = xml.indexOf('<', offset);
      const raw = xml.slice(offset, end < 0 ? xml.length : end);
      if (stack.length === 1 && raw.trim()) throw new Error('Workbook XML contains text outside its root.');
      stack.at(-1).parts.push(xmlText(raw));
      offset = end < 0 ? xml.length : end;
      continue;
    }
    if (xml.startsWith('<!--', offset)) {
      const end = xml.indexOf('-->', offset + 4);
      if (end < 0) throw new Error('Workbook XML contains an unfinished comment.');
      offset = end + 3; continue;
    }
    if (xml.startsWith('<?', offset)) {
      const end = xml.indexOf('?>', offset + 2);
      if (end < 0) throw new Error('Workbook XML contains an unfinished declaration.');
      offset = end + 2; continue;
    }
    if (xml.startsWith('<![CDATA[', offset)) {
      const end = xml.indexOf(']]>', offset + 9);
      if (end < 0 || stack.length === 1) throw new Error('Workbook XML contains invalid CDATA.');
      stack.at(-1).parts.push(xml.slice(offset + 9, end)); offset = end + 3; continue;
    }
    let quote = '', end = offset + 1;
    for (; end < xml.length; end++) {
      const current = xml[end];
      if (quote) { if (current === quote) quote = ''; }
      else if (current === '"' || current === "'") quote = current;
      else if (current === '>') break;
      else if (current === '<') throw new Error('Workbook XML contains a malformed tag.');
    }
    if (end >= xml.length) throw new Error('Workbook XML contains an unfinished tag.');
    let tag = xml.slice(offset + 1, end);
    offset = end + 1;
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      if (!XML_NAME.test(name) || stack.length <= 1 || stack.at(-1).qualified !== name) throw new Error('Workbook XML contains mismatched tags.');
      stack.pop(); continue;
    }
    const selfClosing = /\/\s*$/.test(tag);
    if (selfClosing) tag = tag.replace(/\/\s*$/, '');
    const match = tag.match(/^([^\s]+)([\s\S]*)$/);
    if (!match || !XML_NAME.test(match[1])) throw new Error('Workbook XML contains an unsupported tag.');
    const attrs = Object.create(null);
    let rest = match[2];
    while (rest.trim()) {
      const attr = rest.match(/^\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
      if (!attr || Object.hasOwn(attrs, attr[1]) || /</.test(attr[2] ?? attr[3])) throw new Error('Workbook XML contains an invalid attribute.');
      attrs[attr[1]] = xmlText(attr[2] ?? attr[3]);
      rest = rest.slice(attr[0].length);
    }
    const node = { name: localName(match[1]), qualified: match[1], attrs, children: [], parts: [] };
    const parent = stack.at(-1);
    parent.children.push(node); parent.parts.push(node);
    count++;
    if (count > MAX_XML_NODES || stack.length > 40) throw new Error('Workbook XML is too complex for a local intake file.');
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1 || root.children.length !== 1) throw new Error('Workbook XML has an incomplete or multiple root.');
  return root.children[0];
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate directory/local metadata first; never allocate from an unbounded ZIP size. */
function extractWorkbookParts(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = offset => { if (offset < 0 || offset + 2 > bytes.length) throw new Error('Workbook ZIP metadata is truncated.'); return view.getUint16(offset, true); };
  const u32 = offset => { if (offset < 0 || offset + 4 > bytes.length) throw new Error('Workbook ZIP metadata is truncated.'); return view.getUint32(offset, true); };
  let end = -1;
  for (let offset = bytes.length - 22, minimum = Math.max(0, bytes.length - 65557); offset >= minimum; offset--) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0) throw new Error('This XLSX is not a readable workbook archive.');
  const count = u16(end + 10), directorySize = u32(end + 12), directoryOffset = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || count > 1000
    || count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff
    || directoryOffset + directorySize > end) throw new Error('The workbook uses unsupported split, ZIP64, or oversized ZIP metadata.');
  const seen = new Set(), entries = [];
  let position = directoryOffset, declaredTotal = 0;
  for (let index = 0; index < count; index++) {
    if (position + 46 > directoryOffset + directorySize || u32(position) !== 0x02014b50) throw new Error('The workbook ZIP directory is malformed.');
    const flags = u16(position + 8), method = u16(position + 10), checksum = u32(position + 16);
    const compressedSize = u32(position + 20), originalSize = u32(position + 24);
    const nameLength = u16(position + 28), extraLength = u16(position + 30), commentLength = u16(position + 32);
    const localOffset = u32(position + 42), next = position + 46 + nameLength + extraLength + commentLength;
    if (next > directoryOffset + directorySize || u16(position + 34) || originalSize === 0xffffffff || compressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error('The workbook ZIP entry is out of bounds or uses ZIP64.');
    const nameBytes = bytes.subarray(position + 46, position + 46 + nameLength);
    // Supported workbook part paths are ASCII. Unused parts are never extracted.
    const name = Array.from(nameBytes, byte => String.fromCharCode(byte)).join('');
    if (seen.has(name)) throw new Error('The workbook archive contains duplicate parts.');
    seen.add(name);
    const needed = ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml'].includes(name)
      || /^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(name);
    if (needed) {
      if (flags & 0x41 || ![0, 8].includes(method)) throw new Error('Encrypted or unsupported workbook compression is not supported.');
      if (method === 0 && compressedSize !== originalSize) throw new Error('A stored workbook part has inconsistent sizes.');
      declaredTotal += originalSize;
      if (declaredTotal > MAX_XML_BYTES) throw new Error('Workbook XML expands beyond the 8 MB safety limit.');
      if (localOffset + 30 > directoryOffset || u32(localOffset) !== 0x04034b50
        || u16(localOffset + 8) !== method || u16(localOffset + 6) !== flags) throw new Error('The workbook local ZIP header does not match its directory.');
      const localNameLength = u16(localOffset + 26), localExtraLength = u16(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      if (dataOffset + compressedSize > directoryOffset || localNameLength !== nameLength
        || !nameBytes.every((byte, at) => byte === bytes[localOffset + 30 + at])) throw new Error('The workbook ZIP data is out of bounds.');
      if (!(flags & 8) && (u32(localOffset + 14) !== checksum || u32(localOffset + 18) !== compressedSize || u32(localOffset + 22) !== originalSize)) throw new Error('The workbook ZIP size or checksum metadata is inconsistent.');
      entries.push({ name, method, checksum, originalSize, compressed: bytes.subarray(dataOffset, dataOffset + compressedSize) });
    }
    position = next;
  }
  if (position !== directoryOffset + directorySize) throw new Error('The workbook ZIP directory length is inconsistent.');
  const parts = Object.create(null);
  let actualTotal = 0;
  for (const entry of entries) {
    let decoded;
    if (entry.method === 0) decoded = entry.compressed.slice();
    else {
      const chunks = [];
      let size = 0;
      const inflater = new Inflate(chunk => {
        size += chunk.length;
        if (size > entry.originalSize || actualTotal + size > MAX_XML_BYTES) throw new Error('Workbook data exceeds its declared size or the 8 MB safety limit.');
        chunks.push(chunk.slice());
      });
      try {
        // Small compressed chunks keep even a falsified-size compression bomb bounded.
        for (let offset = 0; offset < entry.compressed.length; offset += 512) inflater.push(entry.compressed.subarray(offset, offset + 512), offset + 512 >= entry.compressed.length);
        if (!entry.compressed.length) inflater.push(new Uint8Array(), true);
      } catch (error) {
        if (/Workbook/.test(error.message)) throw error;
        throw new Error('The workbook contains invalid compressed data.');
      }
      decoded = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { decoded.set(chunk, offset); offset += chunk.length; }
    }
    if (decoded.length !== entry.originalSize || crc32(decoded) !== entry.checksum) throw new Error('A workbook part failed its size or checksum check. Re-save a valid source workbook.');
    actualTotal += decoded.length;
    parts[entry.name] = decoded;
  }
  return parts;
}

function workbookParts(bytes) {
  const parts = extractWorkbookParts(bytes);
  const workbook = readXML(parts['xl/workbook.xml'], 'workbook metadata');
  const relationships = readXML(parts['xl/_rels/workbook.xml.rels'], 'worksheet relationships');
  if (workbook.name !== 'workbook' || relationships.name !== 'Relationships') throw new Error('The XLSX metadata is not a supported workbook.');
  const relations = new Map();
  for (const relation of children(relationships, 'Relationship')) {
    const { Id, Target, TargetMode, Type } = relation.attrs;
    if (!Id || relations.has(Id)) throw new Error('The workbook contains invalid worksheet relationships.');
    if (Type?.endsWith('/worksheet')) {
      if (TargetMode === 'External' || !Target) throw new Error('External worksheet references are not imported.');
      const path = Target.startsWith('/xl/') ? Target.slice(1) : `xl/${Target}`;
      if (!/^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(path)) throw new Error('The workbook uses an unsupported worksheet path.');
      relations.set(Id, path);
    }
  }
  const sheets = children(child(workbook, 'sheets') ?? { children: [] }, 'sheet').map(sheet => {
    const relationship = Object.entries(sheet.attrs).find(([key]) => localName(key) === 'id')?.[1];
    const path = relations.get(relationship);
    if (!path || !parts[path] || !sheet.attrs.name || sheet.attrs.name.length > 100) throw new Error('The workbook contains an unsupported or missing worksheet.');
    return { name: sheet.attrs.name, hidden: sheet.attrs.state === 'hidden' || sheet.attrs.state === 'veryHidden', path };
  });
  if (!sheets.length || sheets.length > 100 || new Set(sheets.map(sheet => sheet.name)).size !== sheets.length) throw new Error('Choose a workbook with 1–100 distinctly named worksheets.');
  return { parts, sheets };
}

function richText(node) {
  if (!node) return '';
  // Phonetic runs are presentation metadata, not the cell's visible text.
  return decodeCellText(node.children.filter(item => ['t', 'r'].includes(item.name)).map(item => item.name === 't'
    ? textContent(item) : children(item, 't').map(textContent).join('')).join(''));
}

function decodeCellText(value) {
  // One pass preserves literal escape-looking strings encoded as _x005F_xHHHH_.
  const decoded = value.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  for (let index = 0; index < decoded.length; index++) {
    const code = decoded.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = decoded.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('A workbook string contains an invalid Unicode surrogate.');
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error('A workbook string contains an invalid Unicode surrogate.');
  }
  return decoded;
}

function columnNumber(letters) {
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}

function worksheetCSV(parts, sheet) {
  const root = readXML(parts[sheet.path], 'selected worksheet');
  if (root.name !== 'worksheet') throw new Error('The selected sheet is not a tabular worksheet.');
  if (children(child(root, 'mergeCells') ?? { children: [] }, 'mergeCell').length) throw new Error('Unmerge cells in the selected worksheet before importing; merged values are not duplicated or guessed.');
  const sharedRoot = parts['xl/sharedStrings.xml'] ? readXML(parts['xl/sharedStrings.xml'], 'shared strings') : null;
  const shared = sharedRoot ? children(sharedRoot, 'si').map(richText) : [];
  if (sharedRoot && sharedRoot.name !== 'sst') throw new Error('The workbook shared-string table is invalid.');
  const data = child(root, 'sheetData');
  if (!data) throw new Error('The selected worksheet contains no data.');
  const rows = [];
  let previousRow = 0, formulaCount = 0, styledNumbers = 0, hiddenRows = 0;
  for (const row of children(data, 'row')) {
    const rowNumber = row.attrs.r === undefined ? previousRow + 1 : Number(row.attrs.r);
    if (!Number.isInteger(rowNumber) || rowNumber <= previousRow || rowNumber > MAX_ROWS + 1) throw new Error(`Worksheet rows must be in order and fit within ${MAX_ROWS + 1} rows including the header.`);
    if (row.attrs.hidden === '1' || row.attrs.hidden === 'true') hiddenRows++;
    while (rows.length < rowNumber) rows.push([]);
    const cells = rows[rowNumber - 1];
    let previousColumn = -1;
    for (const cell of children(row, 'c')) {
      let column = previousColumn + 1;
      if (cell.attrs.r !== undefined) {
        const coordinate = cell.attrs.r.match(/^([A-Z]+)([1-9]\d*)$/);
        if (!coordinate || Number(coordinate[2]) !== rowNumber) throw new Error('A worksheet cell has an invalid row reference.');
        column = columnNumber(coordinate[1]);
      }
      if (column <= previousColumn || column >= MAX_COLUMNS) throw new Error(`Worksheet cells must be in order and use at most ${MAX_COLUMNS} columns.`);
      const type = cell.attrs.t ?? 'n';
      const formula = child(cell, 'f');
      const valueNode = child(cell, 'v');
      if (formula) {
        formulaCount++;
        if (!valueNode) throw new Error('A formula has no saved result. Recalculate and save the workbook or replace formulas with confirmed values before importing.');
      }
      let value = valueNode ? textContent(valueNode) : '';
      if (type === 's') {
        if (!/^\d+$/.test(value) || Number(value) >= shared.length) throw new Error('A worksheet cell refers to an invalid shared string.');
        value = shared[Number(value)];
      } else if (type === 'inlineStr') value = richText(child(cell, 'is'));
      else if (type === 'b') {
        if (!['0', '1', ''].includes(value)) throw new Error('A worksheet cell contains an invalid Boolean.');
        value = value === '' ? '' : value === '1' ? 'TRUE' : 'FALSE';
      } else if (type === 'e') throw new Error(`The worksheet contains an Excel error at ${cell.attrs.r ?? `row ${rowNumber}`}. Resolve it in the source before importing.`);
      else if (type === 'str') value = decodeCellText(value);
      else if (!['n', 'd'].includes(type)) throw new Error(`The worksheet uses an unsupported cell type: ${type}.`);
      if (type === 'n' && value && cell.attrs.s !== undefined) styledNumbers++;
      if (value.length > 10000) throw new Error('A worksheet cell exceeds 10,000 characters.');
      while (cells.length < column) cells.push('');
      cells[column] = value;
      previousColumn = column;
    }
    previousRow = rowNumber;
  }
  if (!rows.length) throw new Error('The selected worksheet is empty.');
  const width = rows[0].length;
  for (const row of rows) while (row.length < width) row.push('');
  const raw = encodeCSV(rows, false);
  previewCSV(raw);
  const warnings = ['Only the selected worksheet is reviewed. The complete original XLSX remains available unchanged.'];
  if (formulaCount) warnings.push(`${formulaCount} formula cell${formulaCount === 1 ? '' : 's'} use saved results. Formulas are never executed or recalculated; saved results may be stale.`);
  if (styledNumbers) warnings.push(`${styledNumbers} formatted numeric cell${styledNumbers === 1 ? '' : 's'} use underlying numeric values, not display formatting. Excel serial dates need source confirmation or ISO-date text; zero-padded IDs should be stored as text.`);
  if (hiddenRows) warnings.push(`${hiddenRows} hidden row${hiddenRows === 1 ? '' : 's'} are included. No rows are removed because they are hidden.`);
  return { raw, warnings };
}

/** No network calls. For multiple sheets, the caller must make an explicit selection. */
export async function readImportFile(file, options = {}) {
  if (!file || typeof file.arrayBuffer !== 'function' || typeof file.name !== 'string' || !file.name || file.name.length > 1024) throw new Error('Choose a CSV, TSV, or XLSX file.');
  if (typeof file.size === 'number' && file.size > MAX_BYTES) throw new Error('Choose an input file smaller than 1 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Choose a nonempty input file smaller than 1 MB.');
  const extension = file.name.split('.').at(-1).toLowerCase();
  if (extension === 'csv') {
    const raw = decodeUTF8(bytes);
    previewCSV(raw);
    return { raw, filename: file.name, format: 'csv', warnings: [], sheets: [] };
  }
  if (extension === 'tsv') {
    const original = decodeUTF8(bytes);
    const raw = encodeCSV(parseDelimited(original, '\t').map(row => row.values), false);
    previewCSV(raw);
    const warnings = ['Tab-separated values are represented as CSV for review. The original TSV is retained unchanged.'];
    return { raw, filename: file.name, format: 'tsv', source: createSource(bytes, file.name, 'tsv', { warnings }), warnings, sheets: [] };
  }
  if (extension !== 'xlsx') throw new Error('Choose CSV, TSV, or XLSX. Legacy XLS, XLSM, ODS, and encrypted workbooks are not supported.');
  const { parts, sheets } = workbookParts(bytes);
  const publicSheets = sheets.map(({ name, hidden }) => ({ name, hidden }));
  if (options.sheetName === undefined && sheets.length > 1) return { filename: file.name, format: 'xlsx', needsSheet: true, sheets: publicSheets, warnings: ['Choose which worksheet to review. Other worksheets remain in the preserved original workbook.'] };
  const selected = options.sheetName === undefined ? sheets[0] : sheets.find(sheet => sheet.name === options.sheetName);
  if (!selected) throw new Error('Choose an existing worksheet from this workbook.');
  const { raw, warnings } = worksheetCSV(parts, selected);
  return { raw, filename: file.name, format: 'xlsx', sheets: publicSheets, selectedSheet: selected.name, warnings,
    source: createSource(bytes, file.name, 'xlsx', { selectedSheet: selected.name, warnings }) };
}
