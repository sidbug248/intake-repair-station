import { useMemo, useRef, useState } from 'react';
import { Download, GitCompare, Upload } from 'lucide-react';
import { createDataset, previewCSV } from '../lib/intake.mjs';
import { DEFAULT_RECIPE } from '../lib/recipes.mjs';
import { ACCEPTED_IMPORT_TYPES, readImportFile } from '../lib/formats.mjs';
import { compareDatasets, comparisonCSV } from '../lib/comparison.mjs';

export default function ComparisonPanel({ dataset, changes, onImport }) {
  const [candidate, setCandidate] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [sheetName, setSheetName] = useState('');
  const [beforeKey, setBeforeKey] = useState(dataset?.columnMap?.id || dataset?.headers[0] || '');
  const [afterKey, setAfterKey] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [kind, setKind] = useState('changed');
  const fileRef = useRef(null);
  const entries = useMemo(() => result?.[kind] || [], [result, kind]);
  async function read(file, selectedSheet) {
    if (!file) return;
    try {
      const input = await readImportFile(file, selectedSheet ? { sheetName: selectedSheet } : {});
      if (input.needsSheet) { setPendingFile(file); setSheets(input.sheets); setSheetName(input.sheets[0]?.name || input.sheets[0] || ''); setCandidate(null); setResult(null); setError(''); return; }
      const preview = previewCSV(input.raw);
      const next = createDataset(input.raw, input.filename, false, { columnMap: preview.suggestedMap, recipe: { ...DEFAULT_RECIPE, name: 'Comparison only', requiredFields: [], rules: [] }, source: input.source });
      setCandidate(next); setAfterKey(next.headers.includes(beforeKey) ? beforeKey : (next.columnMap.id || next.headers[0]));
      setResult(null); setError(''); setWarnings(input.warnings || []); setSheets([]); setPendingFile(null);
    } catch (problem) { setError(problem.message); }
  }
  function compare() {
    try { setResult(compareDatasets(dataset, candidate, { previousKeyColumn: beforeKey, nextKeyColumn: afterKey, previousChanges: changes })); setError(''); }
    catch (problem) { setError(problem.message); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([comparisonCSV(result)], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'import-comparison.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!dataset) return <section className="ir-empty-state ir-panel"><GitCompare size={35}/><h2>Start with the current version.</h2><p>Open the first file in your workspace, then bring its next version here.</p><button className="ir-button primary" onClick={onImport}>Open a file</button></section>;
  return <>
    <section className="ir-panel ir-tool-panel">
      <h2>What changed between files?</h2><p>Compare accepted values in <strong>{dataset.filename}</strong> with another import. This creates a report; it never merges people or transfers corrections.</p>
      {error && <div role="alert" className="ir-inline-error">{error}</div>}
      <input ref={fileRef} hidden tabIndex={-1} type="file" accept={ACCEPTED_IMPORT_TYPES} aria-label="Choose comparison file" onChange={e => { read(e.target.files?.[0]); e.target.value = ''; }}/>
      <div className="ir-tool-actions"><button className="ir-button secondary" onClick={() => fileRef.current.click()}><Upload size={15}/>Choose next version</button><span>{candidate?.filename || 'CSV, TSV, or XLSX'}</span></div>
      {!!sheets.length && <div className="ir-sheet-picker"><label>Workbook sheet<select value={sheetName} onChange={e => setSheetName(e.target.value)}>{sheets.map(sheet => <option key={sheet.name || sheet} value={sheet.name || sheet}>{sheet.name || sheet}</option>)}</select></label><button className="ir-button primary" onClick={() => read(pendingFile, sheetName)}>Read selected sheet</button></div>}
      {!!warnings.length && <ul className="ir-format-warnings">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      {candidate && <><div className="ir-form-grid"><label><span>Unique key in current file</span><select value={beforeKey} onChange={e => { setBeforeKey(e.target.value); setResult(null); }}>{dataset.headers.map(header => <option key={header}>{header}</option>)}</select></label><label><span>Matching key in next file</span><select value={afterKey} onChange={e => { setAfterKey(e.target.value); setResult(null); }}>{candidate.headers.map(header => <option key={header}>{header}</option>)}</select></label></div><p className="ir-form-note">Choose a stable identifier. Missing and repeated keys are reported as ambiguous, not forced into matches. Approve or undo current proposals first.</p><button className="ir-button primary" onClick={compare}><GitCompare size={16}/>Compare versions</button></>}
    </section>
    {result && <section className="ir-panel ir-tool-panel">
      <div className="ir-section-head"><div><h2>The changes, accounted for.</h2><p>{result.counts.previousRows} rows in the current file · {result.counts.nextRows} in the next file</p></div><button className="ir-button secondary" onClick={download}><Download size={15}/>Download comparison CSV</button></div>
      <div className="ir-compare-counts">{['added', 'removed', 'changed', 'unchanged', 'ambiguous'].map(type => <button key={type} className={kind === type ? 'active' : ''} aria-pressed={kind === type} onClick={() => setKind(type)}><strong>{result.counts[type]}</strong><span>{type === 'ambiguous' ? 'ambiguous groups' : type}</span></button>)}</div>
      {(result.columnsAdded.length > 0 || result.columnsRemoved.length > 0) && <p className="ir-tool-message">Columns added: {result.columnsAdded.join(', ') || 'none'}. Columns removed: {result.columnsRemoved.join(', ') || 'none'}.</p>}
      <p className="ir-form-note">“Removed” means absent from the next file. No record was removed from your workspace.</p>
      <div className="ir-comparison-list">{entries.slice(0, 100).map((entry, index) => <article key={index}><strong>{entry.key || 'Missing comparison key'}</strong><small>Current rows: {entry.previousRows.map(row => row.sourceLine).join(', ') || 'none'} · Next rows: {entry.nextRows.map(row => row.sourceLine).join(', ') || 'none'}</small>{entry.reason && <p>{entry.reason === 'duplicate_key' ? 'This key occurs more than once. Confirm the identity relationship at the source.' : 'A missing key cannot be matched reliably.'}</p>}{entry.changes?.map((change, i) => <div className="ir-compare-change" key={i}><b>{change.column}</b><span>{change.before === null ? '(column absent)' : change.before || '(empty)'}</span><span aria-label="to">→</span><span>{change.after === null ? '(column absent)' : change.after || '(empty)'}</span></div>)}</article>)}</div>
      {!entries.length && <p>No {kind} records in this comparison.</p>}
      {entries.length > 100 && <p>Showing 100 of {entries.length} entries. The downloaded report includes every entry.</p>}
    </section>}
  </>;
}
