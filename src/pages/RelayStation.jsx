import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronRight,
  CircleCheck, Download, FileInput, FileText, Focus, GitCompare, History,
  ListFilter, LockKeyhole, PackageCheck, RotateCcw, Save, Search,
  ShieldCheck, Sparkles, Table2, Type, Upload, UserRound, X, AlertTriangle,
  BookOpen, SlidersHorizontal, Database,
} from 'lucide-react';
import { zipSync, strToU8 } from 'fflate';
import {
  REQUIRED_COLUMNS, STATUSES, EXAMPLE_CSV, MAX_BYTES, decodeUTF8,
  createDataset, previewCSV, getColumnIndex, inspectDataset,
  normalizationEdits, currentValues, stageEdits, listChanges,
  approveChanges, rejectChange, createExports, restoreSession, sessionSnapshot,
} from '@/lib/intake.mjs';
import {
  emptyCoordination, assignNextAction, recordEvent, restoreCoordination,
  coordinationCSV, activityCSV,
} from '@/lib/coordination.mjs';
import eternityFluxMark from '@/assets/brand/ef-ouroboros-gold.svg?inline';
import { ACCEPTED_IMPORT_TYPES, readImportFile, getOriginalSource } from '@/lib/formats.mjs';
import { DEFAULT_RECIPE, validateRecipe, applyRecipeMapping } from '@/lib/recipes.mjs';
import RecipeEditor from '@/components/RecipeEditor.jsx';
import ComparisonPanel from '@/components/ComparisonPanel.jsx';
import GuidePanel from '@/components/GuidePanel.jsx';
import AssistantPanel from '@/components/AssistantPanel.jsx';
import ServicesPanel from '@/components/ServicesPanel.jsx';
import { createHandoffReport } from '@/lib/handoff.mjs';
import './relay-station.css';
import './workspace-tools.css';
import './relay-experience.css';

// Persisted keys remain stable so earlier workspaces survive the product rename.
const STORAGE_KEY = 'intake-repair-station-session-v1';
const LEGACY_STORAGE_KEY = 'ef-intake-repair-session-v1';
const PAGE_SIZE = 25;
const FIELD_LABELS = {
  id: 'Source ID', name: 'Name', email: 'Email', status: 'Intake status',
  start_date: 'Start date',
};
const ACTION_STATUS = { open: 'Open', waiting: 'Waiting', done: 'Action complete' };
const EVENT_LABELS = {
  import: 'CSV opened', stage: 'Corrections staged', approve: 'Corrections approved',
  undo: 'Correction undone', assignment: 'Next action updated',
  export: 'Export prepared', backup: 'Backup prepared', restore: 'Session restored',
  recipe: 'Review rules changed', ai: 'AI suggestion used',
};
const VIEWS = [
  { id: 'intake', label: 'Start', icon: FileInput, title: 'Make the next step clear.', description: 'Turn an incoming list into clear decisions, owners, and next steps.' },
  { id: 'queue', label: 'Needs attention', icon: ListFilter, title: 'What needs a decision?', description: 'Review a question, confirm a correction, or give the next step an owner.' },
  { id: 'review', label: 'What changed', icon: GitCompare, title: 'See what actually changed.', description: 'Compare each correction with the original, then approve or undo it. Your activity stays here too.' },
  { id: 'export', label: 'Handoff', icon: PackageCheck, title: 'Ready for the next person.', description: 'Share what is ready, what still needs attention, and who takes it from here.' },
  { id: 'activity', label: 'Activity', icon: Activity, title: 'See what actually happened.', description: 'A record of actions taken in this workspace, with drafts and decisions kept distinct.' },
  { id: 'recipes', label: 'Import recipes', icon: SlidersHorizontal, title: 'Make the next import easier.', description: 'Reusable column matches and clear rules for the way your data works.' },
  { id: 'compare', label: 'Compare versions', icon: GitCompare, title: 'See what changed.', description: 'Compare two files while keeping every source record and uncertain match visible.' },
  { id: 'assistant', label: 'AI assistance', icon: Sparkles, title: 'A little help. Your decisions.', description: 'Optional suggestions through your provider or a model on your computer.' },
  { id: 'services', label: 'Saved workspaces', icon: Database, title: 'Pick up where you left off.', description: 'Optional local storage, reviewer access, and connections for ongoing work.' },
  { id: 'guide', label: 'Quick start', icon: BookOpen, title: 'From a messy list to a useful handoff.', description: 'Learn the workflow with twelve fictional people and five practical steps.' },
];
const PRIMARY_VIEWS = VIEWS.slice(0, 4);
const ADVANCED_VIEWS = VIEWS.filter(item => ['recipes', 'compare', 'assistant', 'services'].includes(item.id));
const FILTERS = [
  { id: 'exceptions', label: 'Needs attention' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'format', label: 'Formatting' },
  { id: 'duplicates', label: 'Duplicate IDs' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'ready', label: 'Ready' },
  { id: 'pending', label: 'Pending changes' },
  { id: 'all', label: 'All records' },
];

function initialSession() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (stored) {
      const value = JSON.parse(stored);
      const restored = restoreSession(value);
      return {
        ...restored, coordination: restoreCoordination(value.coordination, restored.dataset),
        remember: true, message: 'Your saved workspace is ready on this device.',
      };
    }
  } catch {
    return {
      dataset: null, changes: {}, coordination: emptyCoordination(), remember: false,
      message: 'The saved workspace could not be restored. Start a new CSV or restore a session backup.',
    };
  }
  return { dataset: null, changes: {}, coordination: emptyCoordination(), remember: false, message: '' };
}

function emptyAssignment() {
  return { owner: '', action: '', dueDate: '', status: 'open', note: '' };
}

function editableAssignment(value = {}) {
  return Object.fromEntries(Object.entries(emptyAssignment()).map(([key, fallback]) => [key, value[key] ?? fallback]));
}

function tryRecordForDownload(state, event) {
  try {
    return { state: recordEvent(state, event), warning: '' };
  } catch (problem) {
    return { state, warning: 'Existing history was preserved, but this action could not be added to the log. ' + problem.message };
  }
}

function safeStem(filename) {
  return (filename || 'intake').replace(/\.(csv|tsv|xlsx)$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100) || 'intake';
}

function safeOriginalName(filename) {
  return 'original-' + (filename || 'intake.csv').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 130);
}

function downloadFile(content, filename, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Time unavailable' : date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatDate(value) {
  if (!value) return 'No due date';
  const date = new Date(value + 'T12:00:00');
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function summarizeChanges(edits) {
  return { count: edits.length, fields: [...new Set(edits.map(edit => edit.field))] };
}

function snapshotWithCoordination(dataset, changes, coordination) {
  return { ...sessionSnapshot(dataset, changes), coordination };
}

function Mark() {
  return <span className="ir-mark" aria-hidden="true">
    <img src={eternityFluxMark} alt="" width="48" height="48" />
  </span>;
}

function Pill({ children, tone = '', icon: Icon }) {
  return <span className={'ir-pill ' + tone}>{Icon && <Icon size={12}/>} {children}</span>;
}

function Button({ children, variant = 'secondary', className = '', ...props }) {
  return <button type="button" className={'ir-button ' + variant + ' ' + className} {...props}>{children}</button>;
}

function Value({ value }) {
  return <span className={value ? 'ir-cell-value' : 'ir-empty-value'}>{value || 'Empty value'}</span>;
}

function ErrorMessage({ children }) {
  return children ? <div className="ir-inline-error" role="alert"><AlertTriangle size={18}/><span>{children}</span></div> : null;
}

function keepDialogFocus(event) {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget;
  const controls = [...dialog.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]',
  )].filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
  if (!controls.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const current = controls.indexOf(document.activeElement);
  if (event.shiftKey && current <= 0) {
    event.preventDefault();
    controls[controls.length - 1].focus();
  } else if (!event.shiftKey && (current === controls.length - 1 || current < 0)) {
    event.preventDefault();
    controls[0].focus();
  }
}

export default function RelayStation() {
  const [initial] = useState(initialSession);
  const [dataset, setDataset] = useState(initial.dataset);
  const [changes, setChanges] = useState(initial.changes);
  const [coordination, setCoordination] = useState(initial.coordination);
  const [remember, setRemember] = useState(initial.remember);
  const [view, setView] = useState('intake');
  const [showImport, setShowImport] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [queueLayout, setQueueLayout] = useState('cards');
  const [raw, setRaw] = useState(initial.dataset?.raw || '');
  const [filename, setFilename] = useState(initial.dataset?.filename || 'intake.csv');
  const [inputIsExample, setInputIsExample] = useState(Boolean(initial.dataset?.synthetic));
  const [importPreview, setImportPreview] = useState(null);
  const [columnMap, setColumnMap] = useState({});
  const [recipe, setRecipe] = useState(() => structuredClone(initial.dataset?.recipe || DEFAULT_RECIPE));
  const [inputSource, setInputSource] = useState(initial.dataset?.source);
  const [inputWarnings, setInputWarnings] = useState([]);
  const [pendingWorkbook, setPendingWorkbook] = useState(null);
  const [workbookSheets, setWorkbookSheets] = useState([]);
  const [workbookSheet, setWorkbookSheet] = useState('');
  const [connection, setConnection] = useState(null);
  const [remoteWorkspace, setRemoteWorkspace] = useState(null);
  const [guided, setGuided] = useState(false);
  const [exported, setExported] = useState(false);
  const [notice, setNotice] = useState(initial.message);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalNotice, setModalNotice] = useState('');
  const [filter, setFilter] = useState('exceptions');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [focus, setFocus] = useState(false);
  const [readable, setReadable] = useState(false);
  const [modal, setModal] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [recordPanel, setRecordPanel] = useState('source');
  const [draft, setDraft] = useState([]);
  const [assignmentDraft, setAssignmentDraft] = useState(emptyAssignment);
  const [recordStaged, setRecordStaged] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [protectFormulas, setProtectFormulas] = useState(true);
  const dialogRef = useRef(null);
  const fileRef = useRef(null);
  const restoreRef = useRef(null);
  const headingRef = useRef(null);
  const mappingRef = useRef(null);

  const inspected = useMemo(() => dataset ? inspectDataset(dataset, changes) : {
    rows: [], issues: [], clean: [], exceptions: [], duplicateGroups: 0,
  }, [dataset, changes]);
  const edits = useMemo(() => dataset ? listChanges(dataset, changes) : [], [dataset, changes]);
  const pending = useMemo(() => edits.filter(edit => !edit.approved), [edits]);
  const safeEdits = useMemo(() => dataset ? normalizationEdits(dataset, changes) : [], [dataset, changes]);
  const selected = inspected.rows.find(row => row.key === selectedKey);
  const sourceDirty = Boolean(selected && draft.some((value, index) => value !== (selected.values[index] ?? '')));
  const assignmentDirty = Boolean(selected && Object.keys(emptyAssignment()).some(key => assignmentDraft[key] !== editableAssignment(coordination.assignments[selected.key])[key]));
  const activeView = VIEWS.find(item => item.id === view);
  const nameIndex = dataset ? Math.max(0, getColumnIndex(dataset, 'name')) : -1;
  const idIndex = dataset ? getColumnIndex(dataset, 'id') : -1;
  const unassignedCount = inspected.exceptions.filter(row => !coordination.assignments[row.key]?.owner).length;
  const pendingKeys = useMemo(() => new Set(pending.map(edit => edit.rowKey)), [pending]);
  const needsAttention = row => row.issues.length > 0 || pendingKeys.has(row.key) || Boolean(coordination.assignments[row.key] && coordination.assignments[row.key].status !== 'done');
  const attentionCount = inspected.rows.filter(needsAttention).length;
  const filteredRows = useMemo(() => inspected.rows.filter(row => {
    const assignment = coordination.assignments[row.key];
    const matches = filter === 'all' ? true
      : filter === 'unassigned' ? row.issues.length > 0 && !assignment?.owner
      : filter === 'waiting' ? assignment?.status === 'waiting'
      : filter === 'format' ? row.issues.some(issue => issue.safe)
      : filter === 'duplicates' ? row.issues.some(issue => issue.code === 'duplicate_id')
      : filter === 'overdue' ? assignment?.dueDate && assignment.status !== 'done' && assignment.dueDate < new Date().toLocaleDateString('en-CA')
      : filter === 'ready' ? row.issues.length === 0 && !pendingKeys.has(row.key)
      : filter === 'pending' ? pendingKeys.has(row.key)
      : row.issues.length > 0 || pendingKeys.has(row.key) || Boolean(assignment && assignment.status !== 'done');
    const haystack = [
      ...row.values, ...row.issues.map(issue => issue.title),
      assignment?.owner || '', assignment?.action || '',
    ].join(' ').toLowerCase();
    return matches && (!search || haystack.includes(search.toLowerCase()));
  }), [inspected, coordination, filter, search, pendingKeys]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = filteredRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const exportResult = useMemo(
    () => dataset && !pending.length ? createExports(dataset, changes, protectFormulas) : null,
    [dataset, changes, pending.length, protectFormulas],
  );
  const mappedFields = REQUIRED_COLUMNS.map(field => columnMap[field]).filter(Boolean);
  const mappingComplete = recipe.requiredFields.every(field => importPreview?.headers.includes(columnMap[field])) && new Set(mappedFields).size === mappedFields.length;
  const events = useMemo(() => [...coordination.events].reverse(), [coordination]);
  const rawByteLength = useMemo(() => new TextEncoder().encode(raw).length, [raw]);
  const activeSnapshot = useMemo(() => dataset ? snapshotWithCoordination(dataset, changes, coordination) : null, [dataset, changes, coordination]);
  const aiSnapshot = useMemo(() => ({ workspace: activeSnapshot, import: { raw, columnMap, recipe } }), [activeSnapshot, raw, columnMap, recipe]);
  const datasetRevisionKey = dataset ? dataset.importedAt + ':' + dataset.filename : 'empty';

  useEffect(() => {
    if (!remember || !dataset) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotWithCoordination(dataset, changes, coordination)));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      setNotice('This browser could not save the workspace. Save a session backup before leaving this tab.');
    }
  }, [dataset, changes, coordination, remember]);

  useEffect(() => { setPage(0); }, [filter, search]);

  useEffect(() => {
    function shortcut(event) {
      if (modal) return;
      const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable;
      if (event.key === '/' && view === 'queue' && !editing && !event.ctrlKey && !event.metaKey) {
        event.preventDefault(); document.getElementById('record-search')?.focus();
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && /^[1-5]$/.test(event.key)) {
        event.preventDefault(); navigate(VIEWS[Number(event.key) - 1].id);
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [view, modal]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (modal && dialog && !dialog.open) dialog.showModal();
    if (!modal && dialog?.open) dialog.close();
    setModalError('');
    if (!modal) setModalNotice('');
  }, [modal]);

  function navigate(next) {
    setView(next);
    if (ADVANCED_VIEWS.some(item => item.id === next)) setAdvancedOpen(true);
    setError('');
    window.setTimeout(() => headingRef.current?.focus(), 0);
  }

  function preparePreview(source = raw, sourceFilename = filename, synthetic = inputIsExample, originalSource = inputSource) {
    try {
      setShowImport(true);
      const preview = previewCSV(source);
      setRaw(source);
      setFilename(sourceFilename);
      setInputIsExample(synthetic);
      setInputSource(originalSource);
      setImportPreview(preview);
      setColumnMap(recipe.columnMap ? { ...preview.suggestedMap, ...applyRecipeMapping(preview.headers, recipe) } : { ...preview.suggestedMap });
      setError('');
      window.setTimeout(() => mappingRef.current?.focus(), 0);
    } catch (problem) {
      setImportPreview(null);
      setError(problem.message);
    }
  }

  function tryExample() {
    if (dataset) { setModal('example'); return; }
    loadExample();
  }

  function loadExample() {
    const exampleRecipe = structuredClone(DEFAULT_RECIPE);
    const exampleMap = previewCSV(EXAMPLE_CSV).suggestedMap;
    const next = createDataset(EXAMPLE_CSV, 'fictional-cohort.csv', true, { columnMap: exampleMap, recipe: exampleRecipe });
    const nextCoordination = recordEvent(emptyCoordination(), {
      type: 'import', detail: 'Opened the fictional example with its known column matches. All ' + next.rows.length + ' source records retained.',
      changes: { columnMap: exampleMap },
    });
    setDataset(next); setChanges({}); setCoordination(nextCoordination);
    setRecipe(exampleRecipe); setColumnMap(exampleMap); setRaw(EXAMPLE_CSV); setFilename(next.filename);
    setInputIsExample(true); setInputSource(undefined); setInputWarnings([]);
    setWorkbookSheets([]); setPendingWorkbook(null); setImportPreview(null); setRemoteWorkspace(null);
    setShowImport(false); setExported(false); setFilter('exceptions'); setSearch(''); setPage(0);
    setQueueLayout('cards'); setModal(null); navigate('queue');
    setNotice('This example is fictional. Pick a card to review a question or plan the next step.');
  }

  function importCSV() {
    try {
      const next = createDataset(raw, filename || 'intake.csv', inputIsExample, { columnMap, recipe, ...(inputSource ? { source: inputSource } : {}) });
      const nextCoordination = recordEvent(emptyCoordination(), {
        type: 'import',
        detail: 'Opened ' + next.rows.length + ' records from ' + next.filename + '. Column mapping confirmed.',
        changes: { columnMap },
      });
      setDataset(next);
      setRemoteWorkspace(null); setExported(false);
      setChanges({});
      setCoordination(nextCoordination);
      setImportPreview(null);
      setFilter('exceptions');
      setSearch('');
      setPage(0);
      navigate('queue');
      setNotice(next.rows.length + ' source records retained. Corrections and next actions are kept separately.');
    } catch (problem) {
      setError(problem.message);
    }
  }

  async function readFile(file, sheetName) {
    if (!file) return;
    setShowImport(true);
    if (file.size > MAX_BYTES) {
      setError('Choose a CSV, TSV, or Excel workbook smaller than 1 MB.');
      return;
    }
    try {
      const input = await readImportFile(file, sheetName ? { sheetName } : {});
      if (input.needsSheet) {
        setPendingWorkbook(file); setWorkbookSheets(input.sheets); setWorkbookSheet(input.sheets[0]?.name || '');
        setRaw(''); setFilename(file.name); setImportPreview(null); setInputSource(undefined); setInputWarnings(input.warnings || []);
        setError(''); setNotice('Choose which worksheet to review. The entire original workbook will be preserved.'); return;
      }
      setRaw(input.raw);
      setFilename(input.filename);
      setInputSource(input.source);
      setInputWarnings(input.warnings || []);
      setWorkbookSheets([]); setPendingWorkbook(null);
      setInputIsExample(false);
      setImportPreview(null);
      setError('');
      setNotice('File read in this browser. Inspect the data to confirm its column mapping.');
    } catch (problem) {
      setError(problem.message || 'This file could not be read. Choose a CSV, TSV, or XLSX file.');
    }
  }

  function openRow(row, panel = 'source') {
    setSelectedKey(row.key);
    setDraft([...row.values]);
    setAssignmentDraft(editableAssignment(coordination.assignments[row.key]));
    setRecordStaged(false);
    setRecordPanel(panel);
    setModal('record');
  }

  function saveRow() {
    if (!dataset || !selected) return;
    try {
      const proposed = dataset.headers.map((_, column) => ({
        rowKey: selected.key, column, value: draft[column] ?? '',
      }));
      const next = stageEdits(dataset, changes, proposed);
      const changedColumns = proposed.filter(edit => (selected.values[edit.column] ?? '') !== edit.value);
      if (!changedColumns.length) {
        setModalNotice('No source values changed. Your other draft is still available in this dialog.');
        return;
      }
      const proposals = changedColumns.filter(edit => edit.value !== (selected.original[edit.column] ?? ''));
      const restored = changedColumns.filter(edit => edit.value === (selected.original[edit.column] ?? ''));
      let nextCoordination = coordination;
      if (proposals.length) {
        nextCoordination = recordEvent(nextCoordination, {
          type: 'stage', rowKey: selected.key,
          detail: 'Staged ' + proposals.length + ' field corrections at source line ' + selected.sourceLine + ' for review.',
          changes: { fields: proposals.map(edit => dataset.headers[edit.column]) },
        });
      }
      if (restored.length) {
        nextCoordination = recordEvent(nextCoordination, {
          type: 'undo', rowKey: selected.key,
          detail: 'Restored ' + restored.length + ' source values at line ' + selected.sourceLine + ', removing their corrections.',
          changes: { fields: restored.map(edit => dataset.headers[edit.column]) },
        });
      }
      setChanges(next);
      setCoordination(nextCoordination);
      setRecordStaged(true);
      if (assignmentDirty) {
        setRecordPanel('action');
        setModalNotice('Source changes recorded. Your next-action draft is still here; save it before leaving.');
      } else {
        setModal(null);
        navigate('review');
        setNotice(proposals.length ? 'Corrections staged. Review the original and proposed values before approving.' : 'Source values restored. The removed corrections are recorded in Activity.');
      }
    } catch (problem) {
      setModalError(problem.message);
    }
  }

  function saveAssignment() {
    if (!selected) return;
    if (!assignmentDirty) {
      if (sourceDirty) {
        setRecordPanel('source');
        setModalNotice('The next action has no changes. Your source correction draft is still here.');
      } else {
        setModal(null);
        if (recordStaged) navigate('review');
        setNotice('The next action is unchanged.');
      }
      return;
    }
    try {
      const next = assignNextAction(coordination, selected.key, assignmentDraft);
      setCoordination(next);
      if (sourceDirty) {
        setRecordPanel('source');
        setModalNotice('Next action saved. Your source correction draft still needs staging; it remains in this dialog.');
      } else {
        setModal(null);
        if (recordStaged) navigate('review');
        setNotice('Next action saved. Source values, contact history, and correction approvals are unchanged.');
      }
    } catch (problem) {
      setModalError(problem.message);
    }
  }

  function stageFormatting() {
    try {
      const next = stageEdits(dataset, changes, safeEdits);
      const nextCoordination = recordEvent(coordination, {
        type: 'stage',
        detail: 'Staged ' + safeEdits.length + ' formatting corrections for human review.',
        changes: { count: safeEdits.length, fields: [...new Set(safeEdits.map(edit => dataset.headers[edit.column]))] },
      });
      setChanges(next);
      setCoordination(nextCoordination);
      setModal(null);
      navigate('review');
      setNotice('Formatting suggestions staged. Nothing is approved automatically.');
    } catch (problem) {
      setModalError(problem.message);
    }
  }

  function approve(keys = null) {
    const approving = pending.filter(edit => !keys || keys.includes(edit.key));
    if (!approving.length) return;
    try {
      const next = recordEvent(coordination, {
        type: 'approve',
        ...(approving.length === 1 ? { rowKey: approving[0].rowKey } : {}),
        detail: 'Approved ' + approving.length + ' correction' + (approving.length === 1 ? '' : 's') + ' after review.',
        changes: summarizeChanges(approving),
      });
      setChanges(approveChanges(changes, keys));
      setCoordination(next);
      setNotice('Approval recorded. Any remaining data issues stay in the exception handoff.');
    } catch (problem) {
      setError(problem.message);
    }
  }

  function undo(edit) {
    try {
      const next = recordEvent(coordination, {
        type: 'undo', rowKey: edit.rowKey,
        detail: 'Undid the ' + edit.field + ' correction at source line ' + edit.sourceLine + '; the source value is restored in the working copy.',
        changes: { field: edit.field, previouslyApproved: edit.approved },
      });
      setChanges(rejectChange(changes, edit.rowKey, edit.column));
      setCoordination(next);
      setNotice('Correction undone. The original value is back in the working copy.');
    } catch (problem) {
      setError(problem.message);
    }
  }

  function exportFile(kind) {
    if (!exportResult || !dataset) return;
    const suffix = {
      cleanCSV: 'clean', exceptionCSV: 'exceptions', allCSV: 'all-reviewed-rows',
      changeCSV: 'change-log', assignments: 'assignments', activity: 'activity',
    }[kind];
    const recorded = tryRecordForDownload(coordination, {
      type: 'export', detail: 'Prepared ' + suffix.replaceAll('-', ' ') + ' CSV for download.',
    });
    const next = recorded.state;
    const content = kind === 'assignments' ? coordinationCSV(dataset, next, protectFormulas)
      : kind === 'activity' ? activityCSV(next, protectFormulas) : exportResult[kind];
    downloadFile(content, safeStem(dataset.filename) + '-' + suffix + '.csv');
    setCoordination(next);
    setNotice('Prepared ' + suffix.replaceAll('-', ' ') + ' CSV. ' + (recorded.warning || 'Your browser handles the download.'));
  }

  function exportOriginal() {
    if (!dataset) return;
    const original = getOriginalSource(dataset);
    downloadFile(original.bytes, safeOriginalName(original.filename), original.mime);
    const recorded = tryRecordForDownload(coordination, { type: 'export', detail: 'Prepared the exact original source file for download; no transformations applied.' });
    setCoordination(recorded.state);
    setNotice('Original source file prepared exactly as it was imported. ' + recorded.warning);
  }

  function saveBackup() {
    if (!dataset) return;
    const recorded = tryRecordForDownload(coordination, {
      type: 'backup', detail: 'Prepared a portable session backup with source data, proposals, approvals, next actions, and activity.',
    });
    const next = recorded.state;
    downloadFile(
      JSON.stringify(snapshotWithCoordination(dataset, changes, next), null, 2),
      safeStem(dataset.filename) + '-session.json',
      'application/json;charset=utf-8',
    );
    setCoordination(next);
    setNotice('Session backup prepared. ' + (recorded.warning || 'It includes your source data and can be restored in another browser.'));
  }

  async function readBackup(file) {
    if (!file) return;
    if (file.size > MAX_BYTES * 10) {
      setError('Choose a session JSON backup smaller than 10 MB.');
      return;
    }
    try {
      const value = JSON.parse(decodeUTF8(await file.arrayBuffer()));
      const restored = restoreSession(value);
      const restoredCoordination = restoreCoordination(value.coordination, restored.dataset);
      setPendingRestore({ ...restored, coordination: restoredCoordination, backupName: file.name });
      setError('');
      setModal('restore');
    } catch (problem) {
      setError('Could not restore this backup. ' + problem.message);
    }
  }

  function confirmRestore() {
    if (!pendingRestore) return;
    const restored = pendingRestore;
    setDataset(restored.dataset);
    setRecipe(structuredClone(restored.dataset.recipe || DEFAULT_RECIPE));
    setInputSource(restored.dataset.source);
    setInputWarnings(restored.dataset.source?.warnings || []);
    setRemoteWorkspace(null); setExported(false);
    setChanges(restored.changes);
    const recorded = tryRecordForDownload(restored.coordination, {
      type: 'restore', detail: 'Restored workspace from ' + restored.backupName + '. Existing recorded history retained.',
    });
    setCoordination(recorded.state);
    setRaw(restored.dataset.raw);
    setFilename(restored.dataset.filename);
    setInputIsExample(Boolean(restored.dataset.synthetic));
    setImportPreview(null);
    setFilter('exceptions');
    setSearch('');
    setPage(0);
    setModal(null);
    setPendingRestore(null);
    navigate('queue');
    setNotice('Session restored. ' + (recorded.warning || 'Pending corrections still need approval before handoff export.'));
  }

  function exportZip() {
    if (!dataset || !exportResult) return;
    try {
      const recorded = tryRecordForDownload(coordination, {
        type: 'export', detail: 'Prepared a handoff ZIP with reviewed data, unresolved exceptions, source, approvals, next actions, activity, and a session backup.',
      });
      const next = recorded.state;
      const original = getOriginalSource(dataset);
      const originalEntry = 'original.' + original.format;
      const readme = [
        'RELAY STATION BY ETERNITY FLUX — HANDOFF',
        '',
        'Source file: ' + dataset.filename,
        'Prepared: ' + new Date().toISOString(),
        'Fictional example: ' + (dataset.synthetic ? 'yes' : 'no'),
        '',
        'RECORD RECONCILIATION',
        dataset.rows.length + ' imported = ' + exportResult.clean.length + ' ready + ' + exportResult.exceptions.length + ' exceptions.',
        'No source rows have been deleted or merged.',
        '',
        'FILES',
        'handoff.html — start here: a readable summary of decisions, outstanding questions, and next owners. Open in any browser.',
        originalEntry + ' — exact imported source file, with its original content preserved.',
        ...(original.format !== 'csv' ? ['working-source.csv — the selected tabular data used for review; original workbook/TSV is preserved separately.'] : []),
        'clean.csv — approved working values for rows passing the configured checks.',
        'exceptions.csv — unresolved records with issue descriptions and original/reviewed values.',
        'all-reviewed-rows.csv — all retained rows with approved corrections applied.',
        'change-log.csv — original and approved values for current corrections.',
        'assignments.csv — separate owner, next action, due date, and action status.',
        'activity.csv — recorded workspace actions.',
        'session.json — restore this workspace in Relay Station.',
        '',
        'COLUMN MAPPING',
        ...REQUIRED_COLUMNS.map(field => field + ' -> ' + (dataset.headers[getColumnIndex(dataset, field)] || '(unmapped)')),
        '',
        'REVIEW RECIPE: ' + (dataset.recipe?.name || 'Participant intake'),
        '',
        'HOW TO READ THIS HANDOFF',
        'Passing a format check does not verify a source fact, identity, or email delivery.',
        'Assignments are separate from source records. An action marked complete does not fix a data issue or prove contact occurred.',
        'Activity records local actions; it is not an independently verified audit record.',
        'Export activity: ' + (recorded.warning || 'This export is included in the activity log.'),
        'Clean and exception CSVs partition the retained source rows. Do not combine them by dropping exceptions.',
        'Spreadsheet formula protection: ' + (protectFormulas ? 'on. Formula-like values are prefixed with an apostrophe in exported copies.' : 'off. Review values before opening in spreadsheet software.'),
        'The original source file is never transformed by the export setting.',
        '',
        'This archive contains the source data and activity. Share it only with the intended recipient.',
      ].join('\n');
      const files = {
        'handoff.html': strToU8(createHandoffReport(dataset, changes, next)),
        [originalEntry]: original.bytes,
        ...(original.format !== 'csv' ? { 'working-source.csv': strToU8(dataset.raw) } : {}),
        'clean.csv': strToU8(exportResult.cleanCSV),
        'exceptions.csv': strToU8(exportResult.exceptionCSV),
        'all-reviewed-rows.csv': strToU8(exportResult.allCSV),
        'change-log.csv': strToU8(exportResult.changeCSV),
        'assignments.csv': strToU8(coordinationCSV(dataset, next, protectFormulas)),
        'activity.csv': strToU8(activityCSV(next, protectFormulas)),
        'session.json': strToU8(JSON.stringify(snapshotWithCoordination(dataset, changes, next), null, 2)),
        'README.txt': strToU8(readme),
      };
      downloadFile(zipSync(files, { level: 6 }), safeStem(dataset.filename) + '-handoff.zip', 'application/zip');
      setCoordination(next);
      setExported(true);
      setNotice('Handoff ZIP prepared with all source rows accounted for. ' + recorded.warning);
    } catch (problem) {
      setError('The ZIP could not be prepared. ' + problem.message);
    }
  }

  function exportReadableHandoff() {
    if (!dataset || !exportResult) return;
    try {
      const recorded = tryRecordForDownload(coordination, {
        type: 'export', detail: 'Prepared a readable handoff with decisions, unresolved questions, next owners, and every reviewed record.',
      });
      const html = createHandoffReport(dataset, changes, recorded.state);
      downloadFile(html, safeStem(dataset.filename) + '-handoff.html', 'text/html;charset=utf-8');
      setCoordination(recorded.state); setExported(true);
      setNotice('Readable handoff prepared. Open the HTML file in any browser; Relay Station is not required. ' + recorded.warning);
    } catch (problem) {
      setError('The handoff could not be prepared. ' + problem.message);
    }
  }

  function toggleRemember(checked) {
    setRemember(checked);
    if (!checked) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        setNotice('Saved browser copy removed. Your current workspace stays open until you leave or refresh.');
      } catch {
        setNotice('Browser storage could not be cleared. You can remove this site’s stored data in browser settings.');
      }
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      setModalError('Browser storage could not be cleared. Remove this site’s stored data in browser settings.');
      return;
    }
    setDataset(null);
    setChanges({});
    setCoordination(emptyCoordination());
    setRaw('');
    setFilename('intake.csv');
    setInputIsExample(false);
    setInputSource(undefined); setInputWarnings([]); setWorkbookSheets([]); setPendingWorkbook(null);
    setRemoteWorkspace(null); setExported(false);
    setImportPreview(null);
    setRemember(false);
    setModal(null);
    setSelectedKey(null);
    setShowImport(false);
    navigate('intake');
    setNotice('The current workspace and saved browser copy were cleared.');
  }

  function applyCurrentRecipe(nextRecipe) {
    if (!dataset) return;
    const checked = validateRecipe(nextRecipe, dataset.headers);
    const next = createDataset(dataset.raw, dataset.filename, dataset.synthetic, {
      columnMap: dataset.columnMap, recipe: checked, ...(dataset.source ? { source: dataset.source } : {}),
    });
    next.importedAt = dataset.importedAt;
    const nextCoordination = recordEvent(coordination, { type: 'recipe', detail: 'Applied review recipe “' + checked.name + '”. Source data and existing correction decisions are preserved.', changes: { name: checked.name, requiredFields: checked.requiredFields, rules: checked.rules } });
    setDataset(next); setCoordination(nextCoordination); setRecipe(checked);
  }

  function loadStoredSnapshot(value) {
    const restored = restoreSession(value);
    const nextCoordination = restoreCoordination(value.coordination, restored.dataset);
    setDataset(restored.dataset); setChanges(restored.changes); setCoordination(nextCoordination);
    setRaw(restored.dataset.raw); setFilename(restored.dataset.filename); setInputIsExample(restored.dataset.synthetic);
    setInputSource(restored.dataset.source); setRecipe(structuredClone(restored.dataset.recipe || DEFAULT_RECIPE));
    setInputWarnings(restored.dataset.source?.warnings || []); setImportPreview(null); setExported(false);
    setFilter('exceptions'); setSearch(''); setPage(0);
  }

  function useAIMapping(map) {
    if (!importPreview) {
      const source = dataset?.raw || raw;
      const preview = previewCSV(source);
      setRaw(source); setFilename(dataset?.filename || filename); setInputSource(dataset?.source || inputSource);
      setInputIsExample(Boolean(dataset?.synthetic)); setImportPreview(preview);
    }
    setColumnMap(map); navigate('intake');
    setNotice('AI column suggestions are ready to inspect. Confirm the matches before opening Needs attention.');
  }

  function useAINextAction(rowKey, action, provenance = {}) {
    const row = inspected.rows.find(item => item.key === rowKey);
    if (!row) throw new Error('This record is no longer in the current workspace.');
    setCoordination(recordEvent(coordination, { type: 'ai', rowKey, detail: 'Opened an AI next-action draft for human review. The assignment is not saved until confirmed.', changes: { provider: provenance.provider || 'configured provider', model: provenance.model || 'configured model', proposalId: provenance.id || 'local suggestion' } }));
    openRow(row, 'action');
    setAssignmentDraft({ ...editableAssignment(coordination.assignments[rowKey]), action });
    setModalNotice('AI drafted this next action. Confirm the wording and owner before saving.');
  }

  function useAIRules(rules) {
    const headers = importPreview?.headers || dataset?.headers;
    const next = validateRecipe({ ...recipe, rules: [...recipe.rules, ...rules] }, headers);
    setRecipe(next); navigate('recipes');
    setNotice('Proposed rules are in the recipe editor. Inspect and save them, or explicitly apply them to the current workspace.');
  }

  return (
    <div className={'ir-app ' + (focus ? 'ir-focus ' : '') + (readable ? 'ir-readable' : '')}>
      <a className="ir-skip" href="#ir-main">Skip to workspace</a>
      <input ref={fileRef} type="file" accept={ACCEPTED_IMPORT_TYPES} hidden tabIndex={-1} aria-label="Choose intake CSV, TSV or Excel" onChange={event => { readFile(event.target.files?.[0]); event.target.value = ''; }}/>
      <input
        ref={restoreRef} hidden tabIndex={-1} type="file" accept=".json,application/json"
        aria-label="Restore session JSON"
        onChange={event => { readBackup(event.target.files?.[0]); event.target.value = ''; }}
      />
      <aside className="ir-sidebar">
        <div className="ir-brand"><Mark/><span>RELAY STATION<small>BY ETERNITY FLUX</small></span></div>
        <p className="ir-nav-label"><span/>YOUR WORKSPACE</p>
        <nav aria-label="Workflow">
          {PRIMARY_VIEWS.map((item, index) => (
            <button key={item.id} className={view === item.id || (item.id === 'review' && view === 'activity') ? 'active' : ''} onClick={() => navigate(item.id)} aria-current={view === item.id || (item.id === 'review' && view === 'activity') ? 'page' : undefined}>
              <item.icon size={18}/><span>{item.label}</span>
              {item.id === 'queue' && attentionCount > 0 ? <b>{attentionCount}</b>
                : item.id === 'review' && pending.length > 0 ? <b>{pending.length}</b>
                  : <small>{index < 4 ? '0' + (index + 1) : ''}</small>}
            </button>
          ))}
        </nav>
        <details className="ir-advanced-nav" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
          <summary><SlidersHorizontal size={16}/>Advanced tools<ChevronRight size={14}/></summary>
          <nav aria-label="Advanced tools">{ADVANCED_VIEWS.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={17}/><span>{item.label}</span></button>)}</nav>
        </details>
        <button className="ir-guide-link" onClick={() => navigate('guide')}><BookOpen size={17}/>Quick start</button>
        <div className="ir-sidebar-note">
          <ShieldCheck size={26}/><h3>Careful by design.</h3>
          <p>Keep the source.<br/>Review each change.<br/>Make the next step clear.</p>
          <div><span className="ir-live-dot"/>EVERY RECORD RETAINED</div>
        </div>
        <div className="ir-sidebar-bottom"><LockKeyhole size={17}/><div>Local by default<small>No account or AI required.<br/>Optional services are your choice.</small></div></div>
        <p className="ir-signature">Build clarity. Keep moving.</p>
      </aside>

      <div className="ir-workspace">
        <header className="ir-topbar">
          <div className="ir-breadcrumb"><span className="ir-live-dot"/>RELAY STATION<ChevronRight size={13}/><strong>{activeView.label}</strong></div>
          <div className="ir-top-actions">
            <button className={readable ? 'selected' : ''} onClick={() => setReadable(!readable)} aria-pressed={readable} title="Larger readable text"><Type size={17}/><span>Readable</span></button>
            <button className={focus ? 'selected' : ''} onClick={() => setFocus(!focus)} aria-pressed={focus}><Focus size={17}/><span>{focus ? 'Exit focus' : 'Focus'}</span></button>
            <span className="ir-local"><LockKeyhole size={12}/>{connection ? 'COMPANION CONNECTED' : 'LOCAL WORKSPACE'}</span>
          </div>
        </header>
        {focus && <nav className="ir-focus-nav" aria-label="Workflow in focus mode">
          {PRIMARY_VIEWS.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>{item.label}</button>)}
          <details className="ir-focus-tools"><summary>More tools</summary>{VIEWS.filter(item => !PRIMARY_VIEWS.includes(item)).map(item => <button key={item.id} onClick={() => navigate(item.id)}>{item.label}</button>)}</details>
        </nav>}

        <main id="ir-main" className="ir-main">
          <div className="ir-intro">
            <div><p className="ir-eyebrow">A LITTLE STRUCTURE. A BETTER HANDOFF.</p><h1 ref={headingRef} tabIndex={-1}>{activeView.title}</h1><p>{activeView.description}</p></div>
            {dataset && <Pill tone={dataset.synthetic ? 'gold' : 'blue'} icon={FileText}>{dataset.synthetic ? 'Fictional example' : 'Your local file'}</Pill>}
          </div>
          <ErrorMessage>{error}</ErrorMessage>
          {(view === 'review' || view === 'activity') && <nav className="ir-review-tabs" aria-label="Changes and activity">
            <button className={view === 'review' ? 'active' : ''} aria-current={view === 'review' ? 'page' : undefined} onClick={() => navigate('review')}><GitCompare size={16}/>Corrections{pending.length > 0 && <span>{pending.length}</span>}</button>
            <button className={view === 'activity' ? 'active' : ''} aria-current={view === 'activity' ? 'page' : undefined} onClick={() => navigate('activity')}><Activity size={16}/>Activity</button>
          </nav>}
          {guided && <section className="ir-guide-strip" aria-label="Guided example progress"><BookOpen size={20}/><div><strong>Your first complete handoff</strong><p>{!dataset ? 'Open the fictional example to start with a question.' : pending.length ? 'Compare each proposal in What changed, then approve or undo it.' : !edits.length ? 'Inspect a record, assign a next action, and preview formatting.' : exported ? 'Handoff prepared. Keep the backup to reopen your work.' : 'Your decisions are recorded. Download a readable handoff or the complete ZIP.'}</p></div><button className="ir-text-button" onClick={() => navigate('guide')}>View steps</button><button className="ir-icon-button" aria-label="Close guided walkthrough" onClick={() => setGuided(false)}><X size={16}/></button></section>}

          {view === 'intake' && <>
            <section className="ir-hero">
              <div>
                <p className="ir-eyebrow">A CLEARER WAY TO PASS WORK ON</p>
                <h2>See the issue.<br/><span>Keep work moving.</span></h2>
                <p>Someone sends you a list. A few details need checking. Find the questions, record your decisions, and give the next person a clear handoff.</p>
                <div className="ir-hero-actions">
                  <Button variant="gold" onClick={dataset ? () => navigate('queue') : tryExample}>{dataset ? 'Continue your workspace' : 'Try fictional example'}<ArrowRight size={16}/></Button>
                  <button className="ir-hero-link" onClick={() => fileRef.current?.click()}>Open a file</button>
                  <button className="ir-hero-link" onClick={() => restoreRef.current?.click()}>Resume a backup</button>
                </div>
                {!dataset && <small className="ir-hero-note">No sign-up. Review locally; choose optional services when you need them.</small>}
              </div>
              <div className="ir-hero-sheet" aria-label="Illustration of fictional intake records">
                <div className="ir-sheet-heading"><ListFilter size={17}/><span>QUESTIONS → NEXT STEPS</span><span className="ir-sheet-dot"/></div>
                <div className="ir-sheet-columns"><span>RECORD</span><span>REVIEW NEEDED</span></div>
                {[
                  { id: 'IR-1003', label: 'Confirm email address' },
                  { id: 'IR-1004', label: 'Check the source ID' },
                  { id: 'IR-1007', label: 'Review formatting' },
                ].map(item => <div className="ir-sheet-row" key={item.id}><span>{item.id}</span><span>{item.label}</span></div>)}
                <div className="ir-sheet-footer"><ShieldCheck size={14}/><span>ILLUSTRATIVE FICTIONAL RECORDS</span></div>
              </div>
            </section>

            <section className="ir-start-steps" aria-label="How Relay Station works">
              <article><span>01</span><h3>See what needs attention</h3><p>Missing details and unclear values become questions you can review one at a time.</p></article>
              <article><span>02</span><h3>Make the decision visible</h3><p>Confirm a correction, or record who will find out. Keep the original alongside it.</p></article>
              <article><span>03</span><h3>Pass on a clear next step</h3><p>Share a readable handoff with what changed, what is waiting, and who owns it.</p></article>
            </section>
            <div className="ir-start-options"><button className="ir-text-button" onClick={() => { setShowImport(true); window.setTimeout(() => document.getElementById('csv-source')?.focus(), 0); }}>Paste CSV instead<ArrowRight size={14}/></button><button className="ir-text-button" onClick={() => navigate('guide')}>Walk me through it<BookOpen size={14}/></button></div>

            {dataset && <div className="ir-resume-strip">
              <div><FileText size={19}/><span><strong>{dataset.filename}</strong><small>{dataset.rows.length} records · {pending.length} corrections awaiting review</small></span></div>
              <Button onClick={saveBackup}><Save size={15}/>Save session backup</Button>
            </div>}

            {showImport && <div className="ir-import-grid">
              <section className="ir-panel">
                <div className="ir-section-head"><div><p className="ir-eyebrow">01 / BRING IN DATA</p><h2>A file, with context.</h2></div><Pill>CSV · TSV · XLSX</Pill></div>
                <div className="ir-file-bar">
                  <Button onClick={() => fileRef.current?.click()}><Upload size={16}/>Choose file</Button>
                  <span>{raw ? filename : 'No file selected'}</span>
                  <button className="ir-text-button" onClick={tryExample}>Try fictional example</button>
                </div>
                {!!workbookSheets.length && <div className="ir-sheet-picker"><label>Workbook sheet<select value={workbookSheet} onChange={event => setWorkbookSheet(event.target.value)}>{workbookSheets.map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.name}{sheet.hidden ? ' (hidden)' : ''}</option>)}</select></label><Button variant="primary" onClick={() => readFile(pendingWorkbook, workbookSheet)}>Read selected sheet</Button></div>}
                {!!inputWarnings.length && <ul className="ir-format-warnings">{inputWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
                <label className="ir-label" htmlFor="csv-source">Or paste your CSV</label>
                <textarea
                  id="csv-source" className="ir-csv-input" spellCheck={false} value={raw} readOnly={Boolean(inputSource)}
                  onChange={event => { setRaw(event.target.value); setInputIsExample(false); setImportPreview(null); setError(''); setInputSource(undefined); setInputWarnings([]); setFilename('intake.csv'); }}
                  placeholder={'id,name,email,status,start_date\nYour CSV headers can be different — match them in the next step.'}
                />
                {inputSource && <p className="ir-form-note">This is the tabular preview of your {inputSource.format?.toUpperCase() || 'source'} file. The original stays intact. Make reviewed corrections after import. <button className="ir-text-button" onClick={() => { setInputSource(undefined); setFilename(safeStem(filename) + '.csv'); setInputWarnings([]); setImportPreview(null); setNotice('An editable CSV copy is now the source. The workbook or TSV is no longer attached to this new import.'); }}>Start an editable CSV copy instead</button></p>}
                <div className={'ir-input-meta ' + (rawByteLength > MAX_BYTES ? 'over-limit' : '')}>
                  <span>{rawByteLength.toLocaleString()} of {MAX_BYTES.toLocaleString()} bytes</span>
                  {rawByteLength > MAX_BYTES && <strong>Over the limit. Source text has not been shortened.</strong>}
                </div>
                <div className="ir-import-footer">
                  <p>Up to 2,000 records and 30 columns. Extra columns and original values are retained.</p>
                  <Button variant="primary" onClick={() => preparePreview()} disabled={!raw.trim()}>Inspect CSV<ArrowRight size={16}/></Button>
                </div>
                <div className="ir-recipe-strip"><SlidersHorizontal size={17}/><span>Recipe: <strong>{recipe.name || 'Unnamed recipe'}</strong> · {recipe.rules.length} additional rules</span><button className="ir-text-button" onClick={() => navigate('recipes')}>Configure recipe</button>{connection && <button className="ir-text-button" onClick={() => navigate('assistant')}>Ask AI for column matches</button>}</div>

                {importPreview && <section className="ir-mapping" aria-labelledby="mapping-heading">
                  <div className="ir-section-head"><div><p className="ir-eyebrow">MATCH, THEN OPEN</p><h2 id="mapping-heading" ref={mappingRef} tabIndex={-1}>Confirm column mapping.</h2></div><Pill tone="blue">{importPreview.rowCount} records</Pill></div>
                  <p>Choose which source column supplies each field. Suggested matches need your confirmation. Headers and source values stay intact.</p>
                  <div className="ir-mapping-fields">
                    {REQUIRED_COLUMNS.map(field => <label key={field}>
                      <span>{FIELD_LABELS[field]}<code>{field}{recipe.requiredFields.includes(field) ? ' · required' : ' · optional'}</code></span>
                      <select value={columnMap[field] || ''} onChange={event => setColumnMap(map => ({ ...map, [field]: event.target.value }))} aria-label={'Source column for ' + FIELD_LABELS[field]}>
                        <option value="">{recipe.requiredFields.includes(field) ? 'Choose a source column' : 'Not mapped'}</option>
                        {importPreview.headers.map(header => <option key={header} value={header} disabled={REQUIRED_COLUMNS.some(other => other !== field && columnMap[other] === header)}>{header}</option>)}
                      </select>
                    </label>)}
                  </div>
                  <div className="ir-import-footer">
                    <p>{dataset ? 'Opening this file replaces the current workspace. Save a session backup first if you want to keep it.' : 'Each mapped role needs a different source column. Additional columns are carried through.'}</p>
                    <Button variant="primary" disabled={!mappingComplete} onClick={importCSV}>Open review<ArrowRight size={16}/></Button>
                  </div>
                </section>}
              </section>

              <aside className="ir-schema">
                <p className="ir-eyebrow">A RECIPE THAT FITS</p><h2>Familiar roles.<br/>Your rules.</h2>
                <p>Start with these five roles, or configure required fields and checks for other columns in Import recipes.</p>
                <dl>
                  {[
                    ['id', 'A unique source identifier'], ['name', 'The recorded name'],
                    ['email', 'A confirmed contact address'], ['status', 'One of the statuses below'],
                    ['start_date', 'A real date: YYYY-MM-DD'],
                  ].map(([field, hint]) => <div key={field}><dt>{field}</dt><dd>{hint}</dd></div>)}
                </dl>
                <div className="ir-status-list">{[...new Set(recipe.statuses.filter(Boolean))].map(status => <code key={status}>{status}</code>)}</div>
                <p className="ir-schema-note">Checks cover format and completeness. They do not confirm identity, source facts, or email delivery.</p>
                <div className="ir-restore-link"><History size={18}/><div><strong>Picking up previous work?</strong><button className="ir-text-button" onClick={() => restoreRef.current?.click()}>Restore session JSON<ArrowRight size={13}/></button></div></div>
              </aside>
            </div>}
          </>}

          {view === 'queue' && (dataset ? <>
            <Stats inspected={inspected} pending={pending} unassigned={unassignedCount}/>
            <section className="ir-queue-banner">
              <div className="ir-banner-icon"><ListFilter size={25}/></div>
              <div><p className="ir-eyebrow">ONE QUESTION AT A TIME</p><h2>{attentionCount ? attentionCount + ' records need attention.' : 'No outstanding questions or actions.'}</h2><p>{pending.length ? pending.length + ' proposed corrections still need approval. Review them in What changed.' : 'Open a card to review its details, or plan who will find out what is missing.'}</p></div>
              <Button variant="primary" onClick={() => setModal('bulk')} disabled={!safeEdits.length}><Sparkles size={15}/>Preview formatting<span className="ir-button-count">{safeEdits.length}</span></Button>
            </section>
            <div className="ir-queue-toolbar">
              <div className="ir-filters" role="group" aria-label="Filter records">
                {FILTERS.map(item => <button key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>{item.label}{item.id === 'unassigned' && <span>{unassignedCount}</span>}</button>)}
              </div>
              <label className="ir-search"><Search size={17}/><span className="ir-sr-only">Search records, owners, actions, and issues</span><input id="record-search" type="search" placeholder="Find record, owner, or action" value={search} onChange={event => setSearch(event.target.value)}/></label>
            </div>
            <div className="ir-layout-toolbar"><p>{filter === 'ready' ? 'These values pass the checks. A record can still have an open next action.' : 'Questions, proposed changes, and unfinished next actions stay visible.'}</p><div role="group" aria-label="Record layout"><button aria-pressed={queueLayout === 'cards'} onClick={() => setQueueLayout('cards')}><ListFilter size={15}/>Issue cards</button><button aria-pressed={queueLayout === 'table'} onClick={() => setQueueLayout('table')}><Table2 size={15}/>Table view</button></div></div>
            {queueLayout === 'cards' ? <div className="ir-issue-cards" aria-label="Records needing decisions">
              {visibleRows.map(row => {
                const assignment = coordination.assignments[row.key];
                const firstIssue = row.issues[0];
                const issueColumn = firstIssue ? getColumnIndex(dataset, firstIssue.field) : -1;
                const name = row.values[nameIndex]?.trim() || 'Name not recorded';
                return <article className="ir-issue-card" key={row.key}>
                  <div className="ir-issue-card-heading"><div className="ir-person"><span className="ir-person-avatar">{name.slice(0, 1)}</span><div><h3>{name}</h3><small>Source line {row.sourceLine} · {row.values[idIndex]?.trim() || 'ID missing'}</small></div></div><Pill tone={row.issues.length || pendingKeys.has(row.key) ? 'gold' : 'green'}>{row.issues.length ? row.issues.length + ' question' + (row.issues.length === 1 ? '' : 's') : pendingKeys.has(row.key) ? 'Needs approval' : 'Checks passed'}</Pill></div>
                  <div className="ir-card-question"><h4>{firstIssue?.title || (pendingKeys.has(row.key) ? 'A correction needs your approval.' : assignment && assignment.status !== 'done' ? 'A next step is still open.' : 'The recorded values pass the checks.')}</h4><p>{firstIssue?.detail || (pendingKeys.has(row.key) ? 'Compare the proposed value with the original in What changed.' : 'Passing these checks does not confirm source facts or complete a follow-up task.')}</p>
                    {issueColumn >= 0 && <div className="ir-card-source"><small>ORIGINAL · {dataset.headers[issueColumn]}</small><Value value={row.original[issueColumn]}/></div>}
                    {row.issues.length > 1 && <small className="ir-card-more">Also: {row.issues.slice(1, 3).map(issue => issue.title).join(' · ')}{row.issues.length > 3 ? ' · +' + (row.issues.length - 3) + ' more' : ''}</small>}
                  </div>
                  <div className="ir-card-next"><UserRound size={17}/><div><strong>{assignment?.owner || 'No owner yet'}</strong><p>{assignment?.action || (row.issues.length ? 'Give this question a person and a next step.' : 'Add a next step if follow-up is needed.')}</p>{assignment && <small>{ACTION_STATUS[assignment.status]} · {formatDate(assignment.dueDate)}</small>}</div></div>
                  <div className="ir-card-actions"><Button variant="primary" onClick={() => openRow(row)} aria-label={'Review record, source line ' + row.sourceLine}>Review record<ArrowRight size={15}/></Button><Button onClick={() => openRow(row, 'action')} aria-label={(assignment ? 'Edit next step for ' : 'Plan next action for ') + name}>{assignment ? 'Edit next step' : 'Plan next action'}<UserRound size={15}/></Button></div>
                </article>;
              })}
              {!visibleRows.length && <div className="ir-empty-state ir-panel"><CircleCheck size={34}/><h3>No records match this view.</h3><p>Every source record is still here. Change the filter to see it.</p><Button onClick={() => { setFilter('all'); setSearch(''); }}>Show all records<ArrowRight size={15}/></Button></div>}
            </div> : <div className="ir-table-wrap">
              <table className="ir-table">
                <caption className="ir-sr-only">Intake records and their separate next actions. Line numbers refer to the original CSV.</caption>
                <thead><tr><th>Source record</th><th>What needs review</th><th>Who owns the next action</th><th><span className="ir-sr-only">Record actions</span></th></tr></thead>
                <tbody>{visibleRows.map(row => {
                  const assignment = coordination.assignments[row.key];
                  return <tr key={row.key}>
                    <td data-label="Source record"><div className="ir-person"><span className="ir-person-avatar">{(row.values[nameIndex] || '?').trim().slice(0, 1)}</span><div><strong>{row.values[nameIndex]?.trim() || 'Name not recorded'}</strong><small>Line {row.sourceLine} · {row.values[idIndex]?.trim() || 'ID missing'}</small></div></div></td>
                    <td data-label="What needs review">
                      <div className="ir-issue-tags">
                        {row.issues.slice(0, 3).map(issue => <span key={issue.key} className={issue.safe ? 'format' : ''}>{issue.title}</span>)}
                        {row.issues.length > 3 && <span>+{row.issues.length - 3} more</span>}
                        {!row.issues.length && <span className="clear">{pendingKeys.has(row.key) ? 'Proposal awaiting approval' : 'Passes current checks'}</span>}
                      </div>
                    </td>
                    <td data-label="Next action">
                      <button className="ir-assignment-preview" onClick={() => openRow(row, 'action')}>
                        {assignment ? <>
                          <strong><UserRound size={13}/>{assignment.owner}<span className={'ir-task-state ' + assignment.status}>{ACTION_STATUS[assignment.status]}</span></strong>
                          <span>{assignment.action}</span><small>{assignment.dueDate ? 'Due ' + formatDate(assignment.dueDate) : 'No due date'}</small>
                        </> : <span className="ir-unassigned"><UserRound size={15}/>Unassigned<small>Add an owner & next step</small></span>}
                        <span className="ir-sr-only">{(assignment ? 'Edit next action for ' : 'Assign next action for ') + (row.values[nameIndex] || 'source line ' + row.sourceLine)}</span>
                      </button>
                    </td>
                    <td><button className="ir-review-button" onClick={() => openRow(row)}>Review<ArrowUpRight size={16}/><span className="ir-sr-only"> source line {row.sourceLine}</span></button></td>
                  </tr>;
                })}</tbody>
              </table>
              {!visibleRows.length && <div className="ir-empty-state">
                <CircleCheck size={34}/><h3>{filter !== 'exceptions' || search ? 'No records match this view.' : 'No open issues in this preview.'}</h3>
                <p>{filter !== 'exceptions' || search ? 'Clear the filters to see every retained record.' : pending.length ? 'Approve or undo the staged corrections before exporting.' : 'Every record remains available in All records.'}</p>
                <Button onClick={() => { setFilter('all'); setSearch(''); setPage(0); }}>Show all records<ArrowRight size={15}/></Button>
              </div>}
            </div>}
            <div className="ir-table-footer">
              <span>{filteredRows.length} records in this view · {dataset.filename}</span>
              {pageCount > 1 && <div><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pageCount}</span><button disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
              <button className="ir-text-button" onClick={() => navigate('review')}>Review {pending.length} pending changes<ArrowRight size={14}/></button>
            </div>
            <p className="ir-context-note"><ShieldCheck size={15}/>Next actions are separate from data corrections. Marking an action complete never clears a source issue or records contact.</p>
          </> : <Empty onLoad={() => navigate('intake')} onExample={tryExample}/>)}

          {view === 'review' && <>
            <section className="ir-review-summary">
              <div><p className="ir-eyebrow">HUMAN REVIEW</p><h2>{pending.length ? pending.length + ' changes await your approval.' : edits.length ? 'Every current correction is approved.' : 'The source is still untouched.'}</h2><p>Approve a change in the working copy. The original value remains available in the source and change log.</p></div>
              <div className="ir-review-meter"><strong>{edits.length - pending.length}<span> / {edits.length}</span></strong><small>CORRECTIONS APPROVED</small><div><span style={{ width: (edits.length ? (edits.length - pending.length) / edits.length * 100 : 0) + '%' }}/></div></div>
            </section>
            {pending.length > 0 && <div className="ir-approval-bar"><span><GitCompare size={18}/>Read the original and proposed values below.</span><Button variant="primary" onClick={() => approve()}><CheckCheck size={16}/>Approve all {pending.length} pending changes</Button></div>}
            {edits.length ? <div className="ir-change-list">
              {edits.map(edit => <article className="ir-change-card" key={edit.key}>
                <div className="ir-change-heading"><span>LINE {edit.sourceLine}<i/><code>{edit.field}</code></span><Pill tone={edit.approved ? 'green' : 'gold'} icon={edit.approved ? Check : undefined}>{edit.approved ? 'Approved' : 'Awaiting review'}</Pill></div>
                <div className="ir-diff"><div><small>ORIGINAL · UNCHANGED</small><Value value={edit.before}/></div><ArrowRight size={20}/><div><small>{edit.approved ? 'APPROVED VALUE' : 'PROPOSED VALUE'}</small><Value value={edit.after}/></div></div>
                <div className="ir-change-actions"><button className="ir-text-button muted" onClick={() => undo(edit)}><RotateCcw size={14}/>Undo correction</button>{!edit.approved && <Button onClick={() => approve([edit.key])}><Check size={15}/>Approve change</Button>}</div>
              </article>)}
            </div> : <div className="ir-empty-state ir-panel"><GitCompare size={36}/><h3>Corrections will appear here.</h3><p>Open a record or preview formatting suggestions in Needs attention.</p><Button variant="primary" onClick={() => navigate(dataset ? 'queue' : 'intake')}>Go to {dataset ? 'Needs attention' : 'Start'}<ArrowRight size={15}/></Button></div>}
            {!!edits.length && !pending.length && <div className="ir-review-complete"><CircleCheck size={22}/><div><strong>Your decisions are recorded in this workspace.</strong><p>{inspected.exceptions.length} records still need review and will remain in the exception handoff.</p></div><Button variant="primary" onClick={() => navigate('export')}>Prepare handoff<ArrowRight size={16}/></Button></div>}
          </>}

          {view === 'export' && (dataset ? <>
            <section className="ir-reconciliation">
              <div><p className="ir-eyebrow">EVERY RECORD ACCOUNTED FOR</p><h2>Nothing disappears<br/>between files.</h2><p>The ready file contains rows passing the current checks. Unresolved rows stay in the exception file with their source values.</p></div>
              <div className="ir-equation"><div><strong>{dataset.rows.length}</strong><span>imported</span></div><b>=</b><div><strong>{inspected.clean.length}</strong><span>ready rows</span></div><b>+</b><div className="exceptions"><strong>{inspected.exceptions.length}</strong><span>exceptions</span></div></div>
            </section>
            {pending.length > 0 && <div className="ir-blocked-export" role="status"><AlertTriangle size={22}/><div><strong>Review {pending.length} corrections before exporting.</strong><p>Counts reflect proposed values. Approve or undo every correction to prepare the handoff. Source downloads and session backups remain available.</p></div><Button onClick={() => navigate('review')}>Review changes<ArrowRight size={15}/></Button></div>}
            <section className="ir-zip-card">
              <div className="ir-zip-icon"><PackageCheck size={30}/></div>
              <div><p className="ir-eyebrow">START WITH THE STORY</p><h2>A handoff anyone can read.</h2><p>What came in, what changed, what still needs an answer, and who takes the next step. Open the report in any browser.</p><small>The complete ZIP also includes the original, reviewed files, activity, and a backup.</small></div>
              <div className="ir-handoff-buttons"><Button variant="gold" disabled={!!pending.length} onClick={exportReadableHandoff}><FileText size={17}/>Download readable handoff</Button><Button disabled={!!pending.length} onClick={exportZip}><Download size={17}/>Download handoff ZIP</Button></div>
            </section>
            <details className="ir-export-details"><summary><Download size={17}/>Individual files & export settings<ChevronRight size={16}/></summary>
            <div className="ir-export-grid">
              <ExportCard icon={CircleCheck} label="THE READY FILE" title="Clean rows" description="Approved working values that pass the configured checks. Passing a check does not verify the source facts." count={inspected.clean.length} disabled={!!pending.length} onClick={() => exportFile('cleanCSV')} tone="green"/>
              <ExportCard icon={ListFilter} label="THE FOLLOW-UP FILE" title="Unresolved exceptions" description="Each unresolved row, its issues, and both original and reviewed values. Nothing is silently dropped." count={inspected.exceptions.length} disabled={!!pending.length} onClick={() => exportFile('exceptionCSV')} tone="gold"/>
            </div>
            <section className="ir-export-extras ir-panel">
              <div><h3>Take the pieces you need.</h3><p>Keep ownership and activity alongside the reviewed data.</p></div>
              <div>
                <Button disabled={!!pending.length} onClick={() => exportFile('allCSV')}><Table2 size={15}/>All reviewed rows</Button>
                <Button disabled={!!pending.length} onClick={() => exportFile('changeCSV')}><GitCompare size={15}/>Change log</Button>
                <Button disabled={!!pending.length} onClick={() => exportFile('assignments')}><UserRound size={15}/>Next actions</Button>
                <Button disabled={!!pending.length} onClick={() => exportFile('activity')}><Activity size={15}/>Activity CSV</Button>
                <Button onClick={exportOriginal}><FileText size={15}/>Exact original</Button>
              </div>
            </section>
            <label className="ir-export-option"><input type="checkbox" checked={protectFormulas} onChange={event => setProtectFormulas(event.target.checked)}/><div><strong>Protect formula-like values for spreadsheets</strong><p>Add an apostrophe before values beginning with =, +, - or @ in exported copies. Original downloads remain exact.</p></div></label>
            </details>
          </> : <Empty onLoad={() => navigate('intake')} onExample={tryExample}/>)}

          {view === 'activity' && (dataset ? <>
            <section className="ir-activity-intro ir-panel">
              <div><History size={25}/><h2>A trail of deliberate actions.</h2><p>Imports, proposed corrections, approvals, undo actions, assignments, and prepared exports appear here. An assigned task or generated file is not proof of contact or completed source verification.</p></div>
              <Pill tone="blue">{events.length} recorded actions</Pill>
            </section>
            <ol className="ir-timeline" aria-label="Workspace activity, newest first">
              {events.map(event => {
                const row = dataset.rows.find(item => item.key === event.rowKey);
                return <li key={event.id}>
                  <span className={'ir-event-icon ' + event.type}>{event.type === 'approve' ? <Check size={16}/> : event.type === 'assignment' ? <UserRound size={16}/> : event.type === 'export' || event.type === 'backup' ? <Download size={16}/> : <Activity size={16}/>}</span>
                  <div className="ir-event-content"><div><strong>{EVENT_LABELS[event.type] || event.type}</strong><time dateTime={event.at}>{formatTime(event.at)}</time></div><p>{event.detail}</p><small>{event.actor || 'You'}{row ? ' · Source line ' + row.sourceLine : ''}</small></div>
                </li>;
              })}
            </ol>
            {!events.length && <div className="ir-empty-state ir-panel"><History size={34}/><h3>No recorded activity yet.</h3><p>This restored session may predate the activity log. New actions will appear here.</p></div>}
            <p className="ir-context-note"><ShieldCheck size={15}/>This log travels with session backups. It is a local record, not an independently verified audit service.</p>
          </> : <Empty onLoad={() => navigate('intake')} onExample={tryExample}/>)}

          {view === 'recipes' && <RecipeEditor recipe={recipe} onChange={setRecipe} headers={importPreview?.headers || dataset?.headers || []} columnMap={importPreview ? columnMap : dataset?.columnMap || {}} onMapping={setColumnMap} onApply={applyCurrentRecipe} hasDataset={Boolean(dataset)}/>}
          {view === 'compare' && <ComparisonPanel key={datasetRevisionKey} dataset={dataset} changes={changes} onImport={() => navigate('intake')}/>}
          {view === 'assistant' && <AssistantPanel connection={connection} dataset={dataset} changes={changes} coordination={coordination} importPreview={importPreview} recipe={recipe} snapshot={aiSnapshot} onMapping={useAIMapping} onRules={useAIRules} onNextAction={useAINextAction} onConnect={() => navigate('services')}/>}
          {view === 'services' && <ServicesPanel connection={connection} onConnection={setConnection} snapshot={activeSnapshot} remote={remoteWorkspace} onRemote={setRemoteWorkspace} onLoad={loadStoredSnapshot} onBackup={saveBackup}/>}
          {view === 'guide' && <GuidePanel dataset={dataset} pending={pending} edits={edits} coordination={coordination} exported={exported} onExample={() => { setGuided(true); tryExample(); }} navigate={navigate}/>}

          <section className="ir-local-note">
            <LockKeyhole size={20}/>
            <div><strong>{connection ? 'You choose when to use the companion.' : 'Your active review stays in this browser.'}</strong><p>{remember ? 'Saved on this device until you turn this off or clear the workspace. Other people using this browser profile can access it.' : 'Session-only by default. Save a backup before closing or refreshing, or choose to remember this workspace.'}{connection && ' Saving a companion workspace and requesting AI are separate, explicit actions.'}</p></div>
            <label><input type="checkbox" checked={remember} onChange={event => toggleRemember(event.target.checked)} disabled={!dataset}/>Remember on this device</label>
          </section>
          <div className="ir-session-actions">
            <Button onClick={saveBackup} disabled={!dataset}><Save size={15}/>Save session backup</Button>
            <Button onClick={() => restoreRef.current?.click()}><History size={15}/>Restore session</Button>
            {dataset && <button className="ir-text-button muted" onClick={() => setModal('clear')}>Clear workspace & saved copy</button>}
          </div>
          <footer className="ir-footer"><span>RELAY STATION <i/> BY ETERNITY FLUX</span><span>Clear decisions. Confident handoffs.</span></footer>
        </main>
      </div>

      <dialog
        ref={dialogRef} className={'ir-dialog ' + (modal === 'record' ? 'wide' : '')}
        aria-labelledby="ir-dialog-title" onKeyDown={keepDialogFocus}
        onCancel={() => setModal(null)} onClose={() => setModal(null)}
      >
        {modal && <div className="ir-dialog-inner">
          <div className="ir-dialog-head">
            <div><p className="ir-eyebrow">{modal === 'record' ? 'SOURCE LINE ' + selected?.sourceLine : modal === 'bulk' ? 'EXPLICIT FORMATTING CORRECTIONS' : 'LOCAL WORKSPACE'}</p><h2 id="ir-dialog-title">{modal === 'record' ? 'Give this record a clear next step.' : modal === 'bulk' ? 'Small fixes. Fully visible.' : modal === 'restore' ? 'Restore this workspace?' : modal === 'example' ? 'Open the fictional example?' : 'Clear the current workspace?'}</h2></div>
            <button className="ir-icon-button" onClick={() => setModal(null)} aria-label="Close dialog"><X size={21}/></button>
          </div>
          <ErrorMessage>{modalError}</ErrorMessage>
          {modalNotice && <p className="ir-dialog-feedback" role="status"><CircleCheck size={17}/>{modalNotice}</p>}

          {modal === 'record' && selected && <>
            <div className="ir-record-summary"><strong>{selected.values[nameIndex]?.trim() || 'Name not recorded'}</strong><span>{selected.values[idIndex]?.trim() || 'ID missing'}</span><Pill tone={selected.issues.length ? 'gold' : 'green'}>{selected.issues.length} current issues</Pill></div>
            <div className="ir-record-switch" role="group" aria-label="Choose record task">
              <button className={recordPanel === 'source' ? 'active' : ''} aria-pressed={recordPanel === 'source'} onClick={() => { setRecordPanel('source'); setModalError(''); }}><GitCompare size={16}/>Source corrections{sourceDirty && <span className="ir-draft-dot" aria-label="Unstaged draft"/>}</button>
              <button className={recordPanel === 'action' ? 'active' : ''} aria-pressed={recordPanel === 'action'} onClick={() => { setRecordPanel('action'); setModalError(''); }}><UserRound size={16}/>Owner & next action{assignmentDirty && <span className="ir-draft-dot" aria-label="Unsaved draft"/>}</button>
            </div>
            {recordPanel === 'source' ? <>
              <div className="ir-dialog-issues">
                {selected.issues.map(issue => <div key={issue.key} className={issue.safe ? 'safe' : ''}>
                  <strong>{issue.title}<span>{FIELD_LABELS[issue.field] || issue.field}</span></strong><p>{issue.detail}</p>
                  {issue.suggested !== undefined && <button className="ir-text-button" onClick={() => setDraft(values => values.map((value, index) => index === getColumnIndex(dataset, issue.field) ? issue.suggested : value))}>Use suggestion:<code>{issue.suggested}</code><ArrowRight size={13}/></button>}
                </div>)}
              </div>
              <form onSubmit={event => { event.preventDefault(); saveRow(); }}>
                <div className="ir-record-fields">
                  {dataset.headers.map((field, index) => {
                    const canonical = REQUIRED_COLUMNS.find(item => getColumnIndex(dataset, item) === index);
                    return <label key={field}><span>{field}{canonical && <small>{FIELD_LABELS[canonical]}</small>}</span>
                      <textarea rows={canonical ? 1 : 2} value={draft[index] ?? ''} maxLength={10000} onChange={event => setDraft(values => { const next = [...values]; next[index] = event.target.value; return next; })} placeholder={canonical === 'start_date' ? 'YYYY-MM-DD · confirm with source' : canonical === 'status' ? (dataset.recipe?.statuses || STATUSES).join(' / ') : ''}/>
                      <small className="ir-original-hint">Original: {selected.original[index] || '(empty)'}</small>
                    </label>;
                  })}
                </div>
                <p className="ir-form-note">Staging creates proposals for review. Missing or ambiguous facts need confirmation from the source; no value is inferred.</p>
                <div className="ir-dialog-actions"><Button onClick={() => setModal(null)}>Keep as is</Button><Button variant="primary" type="submit">Stage corrections<ArrowRight size={16}/></Button></div>
              </form>
            </> : <form onSubmit={event => { event.preventDefault(); saveAssignment(); }}>
              <p className="ir-modal-description">Record who will handle the exception and what they need to do. This does not change source values or create a contact record.</p>
              <div className="ir-assignment-form">
                <label><span>Owner <small>Required</small></span><input required maxLength={200} value={assignmentDraft.owner} placeholder="Person or team responsible" onChange={event => setAssignmentDraft(value => ({ ...value, owner: event.target.value }))}/></label>
                <label className="full"><span>Next action <small>Required</small></span><textarea required rows={2} maxLength={2000} value={assignmentDraft.action} placeholder="For example: confirm the intended start date with the intake coordinator" onChange={event => setAssignmentDraft(value => ({ ...value, action: event.target.value }))}/></label>
                <label><span>Due date <small>Optional</small></span><input type="date" value={assignmentDraft.dueDate} onChange={event => setAssignmentDraft(value => ({ ...value, dueDate: event.target.value }))}/></label>
                <label><span>Action status</span><select value={assignmentDraft.status} onChange={event => setAssignmentDraft(value => ({ ...value, status: event.target.value }))}><option value="open">Open</option><option value="waiting">Waiting</option><option value="done">Action complete</option></select></label>
                <label className="full"><span>Handoff note <small>Optional</small></span><textarea rows={3} maxLength={4000} value={assignmentDraft.note} placeholder="Add useful context for the next person. Record only what you know." onChange={event => setAssignmentDraft(value => ({ ...value, note: event.target.value }))}/></label>
              </div>
              <p className="ir-form-note">“Action complete” describes this task only. A data issue stays open until its value is corrected and approved.</p>
              <div className="ir-dialog-actions"><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" type="submit">Save next action<Check size={16}/></Button></div>
            </form>}
          </>}

          {modal === 'bulk' && <>
            <p className="ir-modal-description">Suggestions cover outer whitespace, email-domain casing, and the casing or separators of known statuses. They do not infer dates, invent IDs, fill missing facts, or resolve status synonyms.</p>
            <div className="ir-bulk-list">
              {safeEdits.map(edit => {
                const row = dataset.rows.find(item => item.key === edit.rowKey);
                return <div key={edit.rowKey + ':' + edit.column}><small>Line {row.sourceLine} · <code>{dataset.headers[edit.column]}</code></small><div><Value value={currentValues(row, changes)[edit.column]}/><ArrowRight size={15}/><Value value={edit.value}/></div></div>;
              })}
            </div>
            <div className="ir-dialog-actions"><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" onClick={stageFormatting} disabled={!safeEdits.length}>Stage {safeEdits.length} suggestions<ArrowRight size={15}/></Button></div>
          </>}

          {modal === 'restore' && pendingRestore && <>
            <p className="ir-modal-description"><strong>{pendingRestore.dataset.filename}</strong><br/>{pendingRestore.dataset.rows.length} records and {listChanges(pendingRestore.dataset, pendingRestore.changes).length} current corrections.</p>
            <p className="ir-modal-description">Restoring replaces the current workspace with this backup, including its recorded activity and next actions.{dataset ? ' Save a backup of your current work first if you need it.' : ''}</p>
            <div className="ir-dialog-actions"><Button onClick={() => setModal(null)}>Cancel</Button>{dataset && <Button onClick={saveBackup}>Back up current work</Button>}<Button variant="primary" onClick={confirmRestore}>Restore workspace<History size={15}/></Button></div>
          </>}

          {modal === 'clear' && <>
            <p className="ir-modal-description">This removes the loaded CSV, corrections, next actions, activity, and remembered session from this browser. Keep a backup if you want to return to this work.</p>
            <div className="ir-dialog-actions"><Button onClick={() => setModal(null)}>Keep working</Button><Button onClick={saveBackup}><Save size={15}/>Save backup first</Button><Button variant="primary" onClick={clearSession}>Clear workspace</Button></div>
          </>}
          {modal === 'example' && <>
            <p className="ir-modal-description">This replaces the current workspace with fictional practice records. Save a backup first to keep your current decisions and next actions.</p>
            <div className="ir-dialog-actions"><Button onClick={() => setModal(null)}>Keep working</Button><Button onClick={saveBackup}><Save size={15}/>Save backup first</Button><Button variant="primary" onClick={loadExample}>Open example</Button></div>
          </>}
        </div>}
      </dialog>

      {notice && <div className="ir-toast" role="status"><CircleCheck size={19}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
    </div>
  );
}

function Stats({ inspected, pending, unassigned }) {
  const cards = [
    { label: 'RECORDS RETAINED', value: inspected.rows.length, hint: 'Every source row', icon: Table2 },
    { label: 'NEEDS REVIEW', value: inspected.exceptions.length, hint: pending.length ? 'Working preview' : 'Current exceptions', icon: ListFilter },
    { label: 'UNASSIGNED EXCEPTIONS', value: unassigned, hint: 'Need an owner', icon: UserRound },
    { label: 'PENDING CORRECTIONS', value: pending.length, hint: 'Awaiting approval', icon: GitCompare },
  ];
  return <div className="ir-stats">{cards.map(card => <div key={card.label}><span>{card.label}</span><strong>{card.value}<small>{card.hint}</small></strong><card.icon size={19}/></div>)}</div>;
}

function Empty({ onLoad, onExample }) {
  return <section className="ir-empty-state ir-panel"><FileInput size={36}/><h3>A clean slate.</h3><p>Bring in a CSV or try the fictional example. Your source records will stay intact throughout the workflow.</p><div className="ir-empty-actions"><Button variant="primary" onClick={onLoad}>Bring in data<ArrowRight size={15}/></Button><Button onClick={onExample}>Try fictional example</Button></div></section>;
}

function ExportCard({ icon: Icon, label, title, description, count, disabled, onClick, tone }) {
  return <article className={'ir-export-card ' + tone}><div className="ir-export-icon"><Icon size={25}/></div><p className="ir-eyebrow">{label}</p><h3>{title}</h3><p>{description}</p><div><strong>{count}<span>records</span></strong><Button variant={tone === 'green' ? 'primary' : 'secondary'} disabled={disabled} onClick={onClick}><Download size={15}/>Download CSV</Button></div></article>;
}

