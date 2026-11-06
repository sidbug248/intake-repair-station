import { createExports, getColumnIndex, listChanges } from './intake.mjs';
import { restoreCoordination } from './coordination.mjs';
import { validateSource } from './source.mjs';

const ACTION_STATUS = { open: 'Open', waiting: 'Waiting', done: 'Action complete' };
const EVENT_LABELS = {
  import: 'File opened', stage: 'Correction proposed', approve: 'Correction approved',
  undo: 'Correction undone', assignment: 'Next action recorded', export: 'Export prepared',
  backup: 'Backup prepared', restore: 'Workspace restored', recipe: 'Checks changed',
  ai: 'AI suggestion used',
};

// Source values are always text. They never become markup, attributes, URLs or CSS.
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function valueHTML(value) {
  if (value === undefined) return '<span class="empty">Not present in the source row</span>';
  if (value === '') return '<span class="empty">Empty value</span>';
  if (!value.trim()) return '<span class="empty">Whitespace only</span><span class="value">' + escapeHTML(value) + '</span>';
  return '<span class="value">' + escapeHTML(value) + '</span>';
}

function timestampHTML(iso) {
  const readable = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(iso));
  return '<time datetime="' + escapeHTML(iso) + '">' + escapeHTML(readable) + ' UTC</time>';
}

function preparedTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(new Date(value).valueOf()) || new Date(value).toISOString() !== value) {
    throw new Error('Use a real UTC timestamp for the handoff preparation time.');
  }
  return value;
}

function assignmentHTML(assignment, hasIssues) {
  if (!assignment) {
    return '<div class="next-step unassigned"><h4>Unassigned</h4><p>No owner or next action has been recorded for this question.</p></div>';
  }
  return `<div class="next-step">
    <div class="next-step-heading"><h4>${escapeHTML(assignment.owner)}</h4><span class="badge">${ACTION_STATUS[assignment.status]}</span></div>
    <p class="value action">${escapeHTML(assignment.action)}</p>
    <p class="meta">${assignment.dueDate ? 'Due <time datetime="' + escapeHTML(assignment.dueDate) + '">' + escapeHTML(assignment.dueDate) + '</time>' : 'No due date recorded'}</p>
    ${assignment.note ? '<p class="note value"><strong>Handoff note:</strong> ' + escapeHTML(assignment.note) + '</p>' : ''}
    ${hasIssues && assignment.status === 'done' ? '<p class="still-open">The action is marked complete. The information still needs attention.</p>' : ''}
  </div>`;
}

const STYLES = `
  :root { color-scheme: light; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17253b; background: #fbfaf7; line-height: 1.6; }
  * { box-sizing: border-box; }
  body { margin: 0; }
  a { color: #285789; text-underline-offset: .2em; }
  a:focus-visible, summary:focus-visible, .table-scroll:focus-visible { outline: 3px solid #926a31; outline-offset: 4px; }
  h1, h2, h3, h4, p { margin: 0; }
  h1, h2, h3, h4 { line-height: 1.25; letter-spacing: -.025em; }
  h1 { margin: 20px 0 12px; font-size: clamp(2.2rem, 6vw, 3.5rem); font-weight: 650; }
  h2 { font-size: 1.65rem; }
  h3 { font-size: 1.2rem; }
  h4 { font-size: 1rem; }
  p + p { margin-top: 10px; }
  .page { width: min(1040px, 100%); margin: 0 auto; padding: 44px 24px 60px; }
  .hero { padding: 34px 38px; border-radius: 18px; background: #142339; color: #f6f2e9; border-top: 4px solid #b8965e; }
  .brand { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; font-size: 1.05rem; font-weight: 650; }
  .brand span { color: #d4bd93; font-size: .8rem; font-weight: 500; }
  .hero .description { max-width: 700px; color: #d4dfed; font-size: 1.05rem; }
  .hero .source { margin-top: 24px; padding-top: 18px; border-top: 1px solid #536177; color: #d4dfed; overflow-wrap: anywhere; }
  .hero .source strong { color: #fff; }
  .hero .meta { color: #bdcce0; }
  .fictional { display: inline-block; margin-top: 12px; border: 1px solid #b49764; padding: 3px 9px; border-radius: 5px; color: #edd7ae; font-size: .8rem; }
  nav { display: flex; flex-wrap: wrap; gap: 12px 24px; padding: 20px 2px; font-size: .9rem; }
  .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 8px; }
  .stat { padding: 19px 20px; background: white; border: 1px solid #dfe3e2; border-radius: 12px; }
  .stat strong { display: block; font-size: 2rem; line-height: 1.15; }
  .stat span { display: block; margin-top: 7px; font-size: .85rem; color: #506075; }
  .stat.needs { border-color: #d4bc91; }
  .reconciliation { margin-top: 16px; }
  .meta, .section-description { color: #526174; font-size: .9rem; }
  .section-description { margin-top: 10px; }
  section { margin-top: 38px; scroll-margin-top: 20px; }
  .section-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .count, .badge { display: inline-block; border: 1px solid #d5dce1; background: #f2f5f8; color: #344b65; border-radius: 6px; padding: 3px 8px; font-size: .8rem; font-weight: 550; }
  .count { border-color: #ddcba9; background: #f7efdf; color: #6d4b18; }
  .callout { margin-top: 18px; padding: 16px 20px; border-left: 3px solid #ad864a; background: #f4eddf; border-radius: 0 8px 8px 0; }
  .callout h3 { margin-bottom: 5px; font-size: 1rem; }
  .callout p { font-size: .9rem; }
  .questions { display: grid; gap: 16px; }
  .question, .record { padding: 22px; background: white; border: 1px solid #dfe3e2; border-radius: 12px; min-width: 0; overflow-wrap: anywhere; }
  .question-header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; margin-bottom: 16px; }
  .question-header .meta { margin-top: 4px; }
  .question-body { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 24px; }
  .issue-list { list-style: none; margin: 0; padding: 0; }
  .issue-list li + li { border-top: 1px solid #e4e6e5; margin-top: 14px; padding-top: 14px; }
  .issue-list strong { font-size: .95rem; }
  .issue-list p { margin-top: 5px; font-size: .9rem; }
  .field-label { display: inline-block; color: #5a6a7a; margin-left: 8px; font-size: .8rem; }
  .issue-value { color: #485a6d; }
  .next-step { padding: 17px; background: #f1f5f8; border-radius: 9px; align-self: start; min-width: 0; }
  .next-step-heading { display: flex; flex-wrap: wrap; gap: 9px; justify-content: space-between; align-items: center; }
  .next-step .action { margin-top: 12px; }
  .next-step .meta { margin-top: 8px; }
  .note { margin-top: 13px; padding-top: 12px; border-top: 1px solid #d6dfe5; font-size: .9rem; }
  .unassigned { background: #f8f0e2; border: 1px dashed #b89b6b; }
  .unassigned h4 { color: #74521e; }
  .unassigned p { margin-top: 8px; font-size: .9rem; }
  .still-open { margin-top: 12px; color: #74521e; font-size: .85rem; }
  .record-link { display: inline-block; margin-top: 14px; font-size: .85rem; }
  .value { white-space: pre-wrap; overflow-wrap: anywhere; }
  .empty { color: #596777; font-style: italic; }
  .table-scroll { overflow-x: auto; border: 1px solid #dfe3e2; border-radius: 10px; background: white; }
  table { border-collapse: collapse; width: 100%; text-align: left; font-size: .9rem; }
  caption { text-align: left; padding: 14px 18px; color: #526174; }
  th, td { padding: 12px 16px; border-top: 1px solid #e4e6e5; vertical-align: top; overflow-wrap: anywhere; }
  thead th { background: #edf1f4; color: #344b65; font-size: .8rem; border-top: 0; }
  th[scope="row"] { font-weight: 600; }
  td p + p { margin-top: 6px; }
  .table-scroll small { display: block; color: #526174; margin-top: 5px; }
  details { padding: 18px 20px; border: 1px solid #dfe3e2; border-radius: 10px; background: white; }
  summary { cursor: pointer; font-weight: 600; }
  details[open] > summary { margin-bottom: 18px; }
  .records { display: grid; gap: 14px; }
  .record { background: #fbfaf7; }
  .record h3 { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 5px; }
  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px 24px; margin: 20px 0 0; }
  .fields div { min-width: 0; border-top: 1px solid #e0e3e1; padding-top: 10px; }
  dt { color: #526174; font-size: .8rem; margin-bottom: 4px; }
  dd { margin: 0; font-size: .9rem; }
  .original-value { margin-top: 5px; color: #596777; font-size: .8rem; }
  .activity { padding-left: 22px; }
  .activity li { padding: 6px 0 14px 5px; }
  .activity li p { margin: 4px 0; font-size: .9rem; }
  .activity .meta { font-size: .8rem; }
  .context { padding: 23px; background: #edf1f4; border-radius: 12px; }
  .context h2 { font-size: 1.2rem; }
  .context p { margin-top: 12px; font-size: .9rem; }
  footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; margin-top: 30px; padding-top: 18px; border-top: 1px solid #dfe3e2; color: #526174; font-size: .8rem; }
  @media (max-width: 680px) {
    .page { padding: 18px 14px 34px; }
    .hero { padding: 25px 22px; }
    .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .stat { padding: 15px; }
    .question-body, .fields { grid-template-columns: minmax(0, 1fr); }
    .question, .record { padding: 18px; }
    section { margin-top: 30px; }
    th, td { padding: 10px; min-width: 120px; }
    details { padding: 15px; }
  }
  @media print {
    :root, body { background: white; color: #17253b; }
    .page { width: auto; padding: 0; }
    .hero { background: white; color: #17253b; padding: 18px 0; border-radius: 0; }
    .hero .description, .hero .source, .hero .source strong, .hero .meta, .brand span, .fictional { color: #344b65; }
    .hero .source { border-color: #dfe3e2; }
    nav, .record-link { display: none; }
    h1 { font-size: 28pt; }
    h2 { font-size: 18pt; break-after: avoid; }
    section { margin-top: 24px; }
    .stat, .question, .record, .context { box-shadow: none; border-radius: 0; }
    .question, .record, .next-step, tr, .activity li { break-inside: avoid; }
    .question-body { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .table-scroll { overflow: visible; }
    table { table-layout: fixed; }
    details::details-content { display: block; content-visibility: visible; }
    details > :not(summary) { display: block !important; }
    details > summary { margin-bottom: 16px; }
    .records > .record + .record { margin-top: 14px; }
    a { color: inherit; text-decoration: none; }
  }
`;

/**
 * A portable, read-only HTML handoff. Uses only reviewed values, keeps every
 * source row, and leaves action status independent of information quality.
 * No scripts, assets, provider requests, or links derived from imported values.
 */
export function createHandoffReport(dataset, changes = {}, coordination, options = {}) {
  if (!dataset || !Array.isArray(dataset.rows) || !Array.isArray(dataset.headers)) {
    throw new Error('Open a source file before preparing a handoff.');
  }
  const preparedAt = preparedTimestamp(options.preparedAt ?? new Date().toISOString());
  const reviewed = createExports(dataset, changes);
  const decisions = listChanges(dataset, changes);
  const followUp = restoreCoordination(coordination, dataset);
  const source = validateSource(dataset.source);
  const nameColumn = getColumnIndex(dataset, 'name');
  const idColumn = getColumnIndex(dataset, 'id');
  const rowNumbers = new Map(reviewed.rows.map((row, index) => [row.key, index + 1]));
  const rowsByKey = new Map(reviewed.rows.map(row => [row.key, row]));
  const label = row => row.values[nameColumn]?.trim() || 'Source line ' + row.sourceLine;
  const sourceID = row => row.values[idColumn]?.trim() || 'ID not recorded';
  const reference = row => 'Source line ' + row.sourceLine + ' · ' + sourceID(row);
  const recordLink = row => '#record-' + rowNumbers.get(row.key);
  const unassigned = reviewed.exceptions.filter(row => !followUp.assignments[row.key]);
  const assignedRows = reviewed.rows.filter(row => followUp.assignments[row.key]);
  const unfinishedActions = assignedRows.filter(row => followUp.assignments[row.key].status !== 'done');
  const completedActions = assignedRows.length - unfinishedActions.length;
  const sourceFilename = source?.filename || dataset.filename;
  const sourceFormat = source?.format || 'csv';

  const questionHTML = reviewed.exceptions.map(row => {
    const issues = row.issues.map(issue => {
      const column = issue.column ?? (getColumnIndex(dataset, issue.field) >= 0
        ? getColumnIndex(dataset, issue.field) : dataset.headers.indexOf(issue.field));
      return `<li><strong>${escapeHTML(issue.title)}</strong>${column >= 0 ? '<span class="field-label">' + escapeHTML(dataset.headers[column]) + '</span>' : ''}
        <p>${escapeHTML(issue.detail)}</p>
        ${column >= 0 ? '<p class="issue-value">Reviewed value: ' + valueHTML(row.values[column]) + '</p>' : ''}</li>`;
    }).join('');
    return `<article class="question">
      <header class="question-header"><div><h3>${escapeHTML(label(row))}</h3><p class="meta">${escapeHTML(reference(row))}</p></div><span class="count">${row.issues.length} ${row.issues.length === 1 ? 'question' : 'questions'}</span></header>
      <div class="question-body"><ul class="issue-list">${issues}</ul>${assignmentHTML(followUp.assignments[row.key], true)}</div>
      <a class="record-link" href="${recordLink(row)}">See this record in the full list below</a>
    </article>`;
  }).join('');

  const actionsHTML = assignedRows.map(row => {
    const action = followUp.assignments[row.key];
    return `<tr><th scope="row">${escapeHTML(label(row))}<small>${escapeHTML(reference(row))}</small></th>
      <td><strong class="value">${escapeHTML(action.owner)}</strong><p class="value">${escapeHTML(action.action)}</p>${action.note ? '<p class="value"><strong>Note:</strong> ' + escapeHTML(action.note) + '</p>' : ''}</td>
      <td>${action.dueDate ? '<time datetime="' + escapeHTML(action.dueDate) + '">' + escapeHTML(action.dueDate) + '</time>' : 'No due date'}<small>${ACTION_STATUS[action.status]}</small></td>
      <td>${row.issues.length ? 'Information still needs attention' : 'Passes current checks'}</td></tr>`;
  }).join('');

  const decisionsHTML = decisions.map(change => {
    const row = rowsByKey.get(change.rowKey);
    return `<tr><th scope="row">${escapeHTML(label(row))}<small>Source line ${escapeHTML(row.sourceLine)} · ${escapeHTML(change.field)}</small></th>
      <td>${valueHTML(change.before)}</td><td>${valueHTML(change.after)}</td></tr>`;
  }).join('');

  const recordsHTML = reviewed.rows.map(row => {
    const columns = Math.max(dataset.headers.length, row.original.length, row.values.length);
    const fields = Array.from({ length: columns }, (_, index) => {
      const heading = dataset.headers[index] ?? 'Extra source value ' + (index + 1) + ' (no header)';
      const original = row.original[index];
      const value = row.values[index];
      return `<div><dt>${escapeHTML(heading)}</dt><dd>${valueHTML(value)}${value !== original ? '<p class="original-value">Original: ' + valueHTML(original) + '</p>' : ''}</dd></div>`;
    }).join('');
    return `<article class="record" id="record-${rowNumbers.get(row.key)}">
      <h3>${escapeHTML(label(row))}<span class="badge">${row.issues.length ? 'Needs attention' : 'Passes current checks'}</span></h3>
      <p class="meta">${escapeHTML(reference(row))} · Record ${rowNumbers.get(row.key)} of ${reviewed.rows.length}</p>
      <dl class="fields">${fields}</dl>
    </article>`;
  }).join('');

  const activityHTML = followUp.events.map(event => {
    const row = rowsByKey.get(event.rowKey);
    return `<li><strong>${EVENT_LABELS[event.type]}</strong><p class="value">${escapeHTML(event.detail)}</p>
      <p class="meta">${timestampHTML(event.at)} · Label: ${escapeHTML(event.actor)}${row ? ' · Source line ' + escapeHTML(row.sourceLine) : ''}</p></li>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>Handoff — ${escapeHTML(sourceFilename)} — Relay Station</title>
  <style>${STYLES}</style>
</head>
<body>
<main class="page">
  <header class="hero">
    <div class="brand">Relay Station <span>by Eternity Flux</span></div>
    <h1>A clear handoff.</h1>
    <p class="description">What is ready, what still needs a decision, and who takes the next step.</p>
    <p class="source"><strong>${escapeHTML(sourceFilename)}</strong> · ${sourceFormat.toUpperCase()}${source?.selectedSheet ? ' · Worksheet: ' + escapeHTML(source.selectedSheet) : ''}</p>
    <p class="meta">Prepared ${timestampHTML(preparedAt)}</p>
    ${dataset.synthetic ? '<span class="fictional">Fictional example · no real people</span>' : ''}
  </header>

  <nav aria-label="Handoff sections"><a href="#overview">Overview</a><a href="#questions">Outstanding questions</a><a href="#actions">Who does what next</a><a href="#changes">What changed</a><a href="#records">All reviewed records</a></nav>

  <section id="overview" aria-labelledby="overview-heading">
    <h2 id="overview-heading">Every record accounted for</h2>
    <div class="summary">
      <div class="stat"><strong>${reviewed.rows.length}</strong><span>Source records</span></div>
      <div class="stat"><strong>${reviewed.clean.length}</strong><span>Ready for handoff</span></div>
      <div class="stat needs"><strong>${reviewed.exceptions.length}</strong><span>Still need attention</span></div>
      <div class="stat needs"><strong>${unassigned.length}</strong><span>Unresolved, without an owner</span></div>
    </div>
    <p class="reconciliation"><strong>${reviewed.rows.length} imported = ${reviewed.clean.length} ready + ${reviewed.exceptions.length} unresolved.</strong> No source rows were deleted or merged.</p>
    <p class="meta">“Ready” means the reviewed information passes the configured checks. A next action can still be open. Passing a check does not confirm that a source fact is true.</p>
    ${unassigned.length ? '<div class="callout"><h3>' + unassigned.length + (unassigned.length === 1 ? ' record still needs an owner' : ' records still need an owner') + '</h3><p>These unresolved questions are included below. Decide who will handle each one and what they need to do.</p></div>' : reviewed.exceptions.length ? '<div class="callout"><h3>Every unresolved record has an owner label</h3><p>Review the recorded next actions below. Assignments describe responsibility; they do not confirm that anyone has been contacted.</p></div>' : '<div class="callout"><h3>No outstanding data questions under the current checks</h3><p>Review any recorded next actions before passing the work onward.</p></div>'}
  </section>

  <section id="questions" aria-labelledby="questions-heading">
    <div class="section-head"><h2 id="questions-heading">Outstanding questions</h2><span class="count">${reviewed.exceptions.length} ${reviewed.exceptions.length === 1 ? 'record' : 'records'}</span></div>
    ${reviewed.exceptions.length ? '<div class="questions">' + questionHTML + '</div>' : '<p>Every reviewed record passes the configured checks. All records remain available in the full list below.</p>'}
  </section>

  <section id="actions" aria-labelledby="actions-heading">
    <div class="section-head"><h2 id="actions-heading">Who does what next</h2><span class="count">${unfinishedActions.length} open or waiting</span></div>
    <p class="section-description">${assignedRows.length} recorded ${assignedRows.length === 1 ? 'assignment' : 'assignments'}; ${completedActions} marked action complete. This includes assigned work on records that already pass the data checks.</p>
    ${assignedRows.length ? '<div class="table-scroll" role="region" aria-label="Recorded next actions" tabindex="0"><table><caption>All recorded next actions, in source order</caption><thead><tr><th scope="col">Record</th><th scope="col">Owner and next action</th><th scope="col">Due date and action status</th><th scope="col">Information status</th></tr></thead><tbody>' + actionsHTML + '</tbody></table></div>' : '<p class="callout">No next actions have been recorded. Any unresolved records remain visible above as unassigned.</p>'}
    <p class="section-description">An action marked complete does not fix a data issue, verify a fact, or prove that contact occurred.</p>
  </section>

  <section id="changes" aria-labelledby="changes-heading">
    <div class="section-head"><h2 id="changes-heading">What changed</h2><span class="count">${decisions.length} approved ${decisions.length === 1 ? 'correction' : 'corrections'}</span></div>
    ${decisions.length ? '<div class="table-scroll" role="region" aria-label="Approved corrections" tabindex="0"><table><caption>Current approved corrections; original values remain unchanged in the source</caption><thead><tr><th scope="col">Record and field</th><th scope="col">Original value</th><th scope="col">Approved value</th></tr></thead><tbody>' + decisionsHTML + '</tbody></table></div>' : '<p>No current corrections have been recorded. The reviewed values match the source.</p>'}
    <p class="section-description">Checks used: ${escapeHTML(dataset.recipe?.name || 'Participant intake')}. Every correction in this report was explicitly approved in the workspace.</p>
  </section>

  <section id="records" aria-labelledby="records-heading">
    <div class="section-head"><h2 id="records-heading">All reviewed records</h2><span class="count">${reviewed.rows.length} retained</span></div>
    <details><summary>Open the complete list, including unresolved records</summary><div class="records">${recordsHTML}</div></details>
    <p class="section-description">Approved values are shown; changed fields also show their original values. Empty, missing, extra, and ambiguous source values remain visible. Record numbers distinguish rows even when source IDs repeat.</p>
  </section>

  ${followUp.events.length ? '<section aria-label="Recorded activity"><details><summary>Recorded activity · ' + followUp.events.length + ' entries</summary><ol class="activity">' + activityHTML + '</ol></details></section>' : ''}

  <section class="context" aria-labelledby="context-heading">
    <h2 id="context-heading">For the person receiving this handoff</h2>
    <p>This is a read-only snapshot. It opens without Relay Station and can be printed from your browser. It does not update when the workspace changes.</p>
    <p>The complete handoff ZIP also contains the exact original file, reviewed data, unresolved records, change log, assignments, activity, and a session backup. This HTML report does not embed those files.${sourceFormat === 'xlsx' ? ' It covers the selected worksheet only; the complete original workbook is preserved separately in that package.' : ''}</p>
    ${source?.warnings?.length ? '<p><strong>Source import notices:</strong></p><ul>' + source.warnings.map(warning => '<li>' + escapeHTML(warning) + '</li>').join('') + '</ul>' : ''}
    <p>Owners and activity actors are local labels. Activity records workspace actions; it is not an independently verified audit trail. No message is sent by preparing this handoff.</p>
    <p>This report contains source information and follow-up notes. Share it with the intended recipient.</p>
  </section>
  <footer><span>Relay Station by Eternity Flux</span><span>Preserve the context. Make the next step clear.</span></footer>
</main>
</body>
</html>`;
}
