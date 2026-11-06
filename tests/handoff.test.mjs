import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDataset, encodeCSV, EXAMPLE_CSV, normalizationEdits, stageEdits, approveChanges,
} from '../src/lib/intake.mjs';
import { createSource } from '../src/lib/source.mjs';
import { assignNextAction, emptyCoordination, recordEvent } from '../src/lib/coordination.mjs';
import { createHandoffReport } from '../src/lib/handoff.mjs';

const preparedAt = '2026-11-06T15:30:00.000Z';
const options = { preparedAt };
const headers = ['id', 'name', 'email', 'status', 'start_date', 'notes'];
const example = () => createDataset(EXAMPLE_CSV, 'fictional-cohort.csv', true);
const assignment = (overrides = {}) => ({
  owner: 'Program coordinator', action: 'Confirm the intended date with the source.',
  dueDate: '2026-11-09', status: 'waiting', note: 'Keep the original date until it is confirmed.',
  ...overrides,
});

test('handoff blocks pending proposals, then shows original and approved values without changing state', () => {
  const dataset = example();
  const changes = stageEdits(dataset, {}, normalizationEdits(dataset));
  const state = emptyCoordination();
  assert.throws(() => createHandoffReport(dataset, changes, state, options), /Approve or undo pending changes/);
  const approved = approveChanges(changes);
  const before = structuredClone({ dataset, approved, state });
  const html = createHandoffReport(dataset, approved, state, options);
  assert.match(html, /Original value/);
  assert.match(html, /Approved value/);
  assert.match(html, /<span class="value"> Active <\/span>/);
  assert.match(html, /<span class="value">active<\/span>/);
  assert.match(html, /12 imported = 6 ready \+ 6 unresolved/);
  assert.match(html, /Fictional example · no real people/);
  assert.deepEqual({ dataset, approved, state }, before);
});

test('unresolved records stay visible when an action is complete; ready records keep their next actions', () => {
  const dataset = createDataset(encodeCSV([
    headers,
    ['001', 'Dana', 'dana@example.com', 'active', '03/04/2026', 'Date not confirmed'],
    ['002', 'Eli', '', 'pending', '2026-11-06', 'No email yet'],
    ['003', 'Fern', 'fern@example.com', 'active', '2026-11-07', 'Ready data, open task'],
  ], false));
  let state = assignNextAction(emptyCoordination(), 'row-1', assignment({ status: 'done' }));
  state = assignNextAction(state, 'row-3', assignment({ owner: 'Welcome team', action: 'Prepare the welcome pack.', dueDate: '', status: 'open', note: '' }));
  const html = createHandoffReport(dataset, {}, state, options);
  assert.match(html, /3 imported = 1 ready \+ 2 unresolved/);
  assert.match(html, /1 record still needs an owner/);
  assert.match(html, /<h4>Unassigned<\/h4>/);
  assert.match(html, /The action is marked complete\. The information still needs attention/);
  assert.match(html, /1 open or waiting/);
  assert.match(html, /Welcome team/);
  assert.match(html, /Prepare the welcome pack/);
  assert.match(html, /No due date/);
  assert.match(html, /03\/04\/2026/);
  assert.match(html, /No interpretation is selected/);
  assert.doesNotMatch(html, /2026-03-04|2026-04-03/);
});

test('all rows and source values survive repeated IDs, mapped names, ragged rows, and blank records', () => {
  const raw = 'Identifier,Person,Address,State,Start,Note\n'
    + '001,First person,a@example.com,active,2026-11-06,Known\n'
    + '001,Second person,b@example.com,active,2026-11-07,Keep both,EXTRA SOURCE VALUE\n'
    + '003,Third person\n'
    + '\n';
  const dataset = createDataset(raw, 'partner-list.csv', false, {
    columnMap: { id: 'Identifier', name: 'Person', email: 'Address', status: 'State', start_date: 'Start' },
  });
  const html = createHandoffReport(dataset, {}, undefined, options);
  assert.equal(dataset.rows.length, 4);
  assert.equal((html.match(/<article class="record" id="record-\d+">/g) || []).length, 4);
  for (let row = 1; row <= 4; row++) assert.match(html, new RegExp('id="record-' + row + '"'));
  assert.match(html, /First person/);
  assert.match(html, /Second person/);
  assert.match(html, /Extra source value 7 \(no header\)/);
  assert.match(html, /EXTRA SOURCE VALUE/);
  assert.match(html, /Not present in the source row/);
  assert.match(html, /Source line 5/);
  assert.match(html, /4 imported = 0 ready \+ 4 unresolved/);
});

test('unmapped name columns use source-line labels rather than guessing a person', () => {
  const dataset = createDataset('Ticket,Description\nX1,An operational question', 'tickets.csv', false, {
    columnMap: {}, recipe: { version: 1, name: 'Ticket review', requiredFields: [], statuses: ['active'], rules: [] },
  });
  const html = createHandoffReport(dataset, {}, undefined, options);
  assert.match(html, /<h3>Source line 2<span class="badge">/);
  assert.match(html, /<dt>Description<\/dt><dd><span class="value">An operational question/);
  assert.match(html, /1 imported = 1 ready \+ 0 unresolved/);
});

test('imported text, metadata, decisions, owners and activity cannot become HTML or outgoing links', () => {
  const payload = '</style><script>alert("source")</script><img src="https://example.invalid/pixel" onerror="alert(1)"> & \'quoted\'';
  const source = createSource(new Uint8Array([80, 75, 3, 4]), 'source-' + payload + '.xlsx', 'xlsx', {
    selectedSheet: '</title><img src="x">', warnings: [payload],
  });
  const dataset = createDataset(encodeCSV([
    [...headers, payload],
    ['001', payload, 'invalid', 'active', '2026-11-06', 'javascript:alert(1)', payload],
  ], false), payload + '.csv', false, {
    source, recipe: { version: 1, name: '<svg onload="alert(1)">', requiredFields: ['id', 'name', 'email', 'status', 'start_date'], statuses: ['active'], rules: [] },
  });
  const changes = approveChanges(stageEdits(dataset, {}, [{ rowKey: 'row-1', column: 5, value: payload }]));
  let state = assignNextAction(emptyCoordination(), 'row-1', assignment({ owner: payload, action: 'javascript:alert(2)', note: payload }));
  state = recordEvent(state, { type: 'approve', detail: payload, actor: payload, rowKey: 'row-1' });
  const html = createHandoffReport(dataset, changes, state, options);
  assert.match(html, /&lt;script&gt;alert\(&quot;source&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&amp; &#39;quoted&#39;/);
  assert.match(html, /&lt;svg onload=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html, /<(?:script|img|svg|iframe|link|form|object|embed)\b/i);
  assert.doesNotMatch(html, /(?:src|action|data)="(?:https?:|javascript:|data:)/i);
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.ok(links.length > 0);
  assert.ok(links.every(link => /^#[a-z]+(?:-\d+)?$/.test(link)));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /style-src 'unsafe-inline'/);
  assert.match(html, /the selected worksheet only/);
});

test('TSV source metadata is retained while HTML remains independent of the original binary payload', () => {
  const tsv = 'id\tname\temail\tstatus\tstart_date\n1\tAlex\talex@example.com\tactive\t2026-11-06';
  const source = createSource(new TextEncoder().encode(tsv), 'partner.tsv', 'tsv');
  const dataset = createDataset(tsv.replaceAll('\t', ','), 'partner.tsv', false, { source });
  const html = createHandoffReport(dataset, {}, undefined, options);
  assert.match(html, /partner\.tsv<\/strong> · TSV/);
  assert.match(html, /datetime="2026-11-06T15:30:00\.000Z"/);
  assert.doesNotMatch(html, new RegExp(source.base64));
  assert.match(html, /This HTML report does not embed those files/);
});

test('malformed coordination and preparation times are rejected instead of silently losing context', () => {
  const dataset = example();
  const outside = assignNextAction(emptyCoordination(), 'row-13', assignment());
  assert.throws(() => createHandoffReport(dataset, {}, outside, options), /unknown source row/);
  assert.throws(() => createHandoffReport(dataset, {}, { assignments: {}, events: 'invalid' }, options), /assignments and an activity list/);
  for (const value of ['tomorrow', '2026-02-30T15:30:00.000Z', '<script>bad</script>', 0]) {
    assert.throws(() => createHandoffReport(dataset, {}, undefined, { preparedAt: value }), /real UTC timestamp/);
  }
  assert.throws(() => createHandoffReport(null), /Open a source file/);
});

test('the full supported row count is represented without a sample or truncation', () => {
  const dataset = createDataset(encodeCSV([
    headers,
    ...Array.from({ length: 2000 }, (_, index) => [String(index + 1), 'Person ' + (index + 1), 'person' + index + '@example.com', 'active', '2026-11-06', 'Source row ' + (index + 1)]),
  ], false));
  const html = createHandoffReport(dataset, {}, emptyCoordination(), options);
  assert.equal((html.match(/<article class="record" id="record-\d+">/g) || []).length, 2000);
  assert.match(html, /2000 imported = 2000 ready \+ 0 unresolved/);
  assert.match(html, /Record 2000 of 2000/);
  assert.match(html, /Source row 2000/);
});
