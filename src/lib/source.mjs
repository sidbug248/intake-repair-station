/** Original non-CSV files are retained separately from the working CSV. */
export const MAX_SOURCE_BYTES = 1_000_000;
const MIME = { tsv: 'text/tab-separated-values;charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export function bytesToBase64(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_SOURCE_BYTES) throw new Error('The source file exceeds 1 MB.');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function base64ToBytes(base64) {
  if (typeof base64 !== 'string' || !base64.length || base64.length > Math.ceil(MAX_SOURCE_BYTES / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error('The saved original file is malformed or exceeds 1 MB.');
  const binary = atob(base64);
  if (binary.length > MAX_SOURCE_BYTES || btoa(binary) !== base64) throw new Error('The saved original file is malformed or too large.');
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function validateSource(input) {
  if (input === undefined) return undefined;
  if (!record(input) || Object.keys(input).some(key => !['format', 'filename', 'mime', 'base64', 'selectedSheet', 'warnings'].includes(key))
    || !Object.hasOwn(MIME, input.format) || typeof input.filename !== 'string' || !input.filename || input.filename.length > 1024
    || input.mime !== MIME[input.format]) throw new Error('Saved original-file metadata is invalid.');
  base64ToBytes(input.base64);
  if (input.selectedSheet !== undefined && (input.format !== 'xlsx' || typeof input.selectedSheet !== 'string'
    || !input.selectedSheet.length || input.selectedSheet.length > 100)) throw new Error('The saved worksheet name is invalid.');
  if (input.warnings !== undefined && (!Array.isArray(input.warnings) || input.warnings.length > 20
    || input.warnings.some(warning => typeof warning !== 'string' || warning.length > 2000))) throw new Error('Saved import notices are invalid.');
  return { format: input.format, filename: input.filename, mime: input.mime, base64: input.base64,
    ...(input.selectedSheet !== undefined ? { selectedSheet: input.selectedSheet } : {}),
    ...(input.warnings !== undefined ? { warnings: [...input.warnings] } : {}) };
}

export function createSource(bytes, filename, format, metadata = {}) {
  return validateSource({ format, filename, mime: MIME[format], base64: bytesToBase64(bytes), ...metadata });
}

export function getOriginalSource(dataset) {
  const source = validateSource(dataset.source);
  return source ? { filename: source.filename, mime: source.mime, bytes: base64ToBytes(source.base64), format: source.format }
    : { filename: dataset.filename, mime: 'text/csv;charset=utf-8', bytes: new TextEncoder().encode(dataset.raw), format: 'csv' };
}
