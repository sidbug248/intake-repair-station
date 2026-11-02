import assert from 'node:assert/strict';
import test from 'node:test';
import { createDataset, parseCSV, sessionSnapshot, restoreSession, stageEdits, approveChanges, createExports } from '../src/lib/intake.mjs';
import { emptyCoordination, assignNextAction, recordEvent, restoreCoordination, coordinationCSV, activityCSV, COORDINATION_LIMITS } from '../src/lib/coordination.mjs';

const raw = 'Full Name,Participant ID,Start Date,Intake Status,Email Address\nA,001,2026-01-01,pending,a@example.com\nB,002,2026-01-02,active,b@example.com';
const columnMap = { id: 'Participant ID', name: 'Full Name', email: 'Email Address', status: 'Intake Status', start_date: 'Start Date' };
const dataset = createDataset(raw, 'mapped.csv', false, { columnMap });
const assignment = { owner: 'Coordinator', action: 'Confirm the source date with the intake team.', dueDate: '2026-11-03', status: 'open', note: 'Waiting for the original form.' };

test('next actions and events are immutable and preserve separate owner and actor labels', () => {
  const empty = emptyCoordination();
  const assigned = assignNextAction(empty, 'row-1', assignment, 'Reviewer label');
  assert.deepEqual(empty, { assignments: {}, events: [] });
  assert.equal(assigned.assignments['row-1'].owner, 'Coordinator');
  assert.equal(assigned.events.length, 1);
  assert.equal(assigned.events[0].actor, 'Reviewer label');
  assert.equal(assigned.events[0].rowKey, 'row-1');
  assert.equal(assigned.events[0].type, 'assignment');
  assert.equal(assigned.events[0].changes.before, null);
  assert.match(assigned.events[0].at, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(assigned.assignments['row-1'].updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  const done = assignNextAction(assigned, 'row-1', { ...assignment, status: 'done', note: 'Confirmed with the source.' });
  assert.equal(assigned.assignments['row-1'].status, 'open');
  assert.equal(done.assignments['row-1'].status, 'done');
  assert.equal(done.events[1].changes.before.status, 'open');
  assert.equal(done.events[1].changes.after.status, 'done');
  assert.notEqual(done.events[0].id, done.events[1].id);
});

test('all follow-up statuses work and a missing due date remains missing', () => {
  for (const status of ['open', 'waiting', 'done']) {
    const state = assignNextAction(emptyCoordination(), 'row-1', { ...assignment, status, dueDate: '' });
    assert.equal(state.assignments['row-1'].status, status);
    assert.equal(state.assignments['row-1'].dueDate, '');
  }
  const leapDay = assignNextAction(emptyCoordination(), 'row-1', { ...assignment, dueDate: '2028-02-29' });
  assert.equal(leapDay.assignments['row-1'].dueDate, '2028-02-29');
});

test('assignment validation rejects ambiguous dates, invalid calendar dates, unknown statuses, and empty responsibility', () => {
  for (const changed of [
    { owner: '' }, { owner: ' ' }, { action: '' }, { action: 22 }, { status: 'closed' },
    { dueDate: '11/03/2026' }, { dueDate: '2026-02-29' }, { dueDate: '2026-02-30' }, { dueDate: null },
    { owner: 'x'.repeat(COORDINATION_LIMITS.owner + 1) }, { note: 'x'.repeat(COORDINATION_LIMITS.note + 1) },
  ]) assert.throws(() => assignNextAction(emptyCoordination(), 'row-1', { ...assignment, ...changed }));
  for (const rowKey of ['__proto__', 'row-0', 'row-01', 'row-2001', null]) {
    assert.throws(() => assignNextAction(emptyCoordination(), rowKey, assignment), /unknown source row/);
  }
});

test('event details are cloned and chronological insertion order is preserved', () => {
  const detail = { before: { status: 'pending' }, after: { status: 'active' } };
  const first = recordEvent(emptyCoordination(), { type: 'import', detail: 'Imported a local CSV.' });
  const second = recordEvent(first, { type: 'stage', rowKey: 'row-2', detail: 'Staged a field correction.', changes: detail });
  detail.after.status = 'altered outside the state';
  assert.equal(first.events.length, 1);
  assert.equal(second.events.length, 2);
  assert.equal(second.events[1].changes.after.status, 'active');
  assert.equal(second.events[0].type, 'import');
  assert.equal(second.events[0].actor, 'You');
});

test('coordination exports include unassigned rows, mapped source references, and formula-safe user text', () => {
  const assigned = assignNextAction(emptyCoordination(), 'row-2', { ...assignment, owner: '=OWNER()', action: 'Call, then email', note: 'two\nlines with "quotes"' });
  const rows = parseCSV(coordinationCSV(dataset, assigned)).map(row => row.values);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][0], 'row-1');
  assert.equal(rows[1][4], '');
  assert.equal(rows[2][2], '002');
  assert.equal(rows[2][3], 'B');
  assert.equal(rows[2][4], "'=OWNER()");
  assert.equal(rows[2][5], 'Call, then email');
  assert.equal(rows[2][8], 'two\nlines with "quotes"');
  assert.equal(parseCSV(coordinationCSV(dataset, assigned, false))[2].values[4], '=OWNER()');
  const activity = parseCSV(activityCSV(assigned));
  assert.equal(activity.length, 2);
  assert.equal(activity[1].values[3], 'row-2');
  assert.equal(JSON.parse(activity[1].values[6]).after.owner, '=OWNER()');
  assert.equal(assigned.assignments['row-2'].owner, '=OWNER()');
});

test('full JSON backup restores mapping, reviewed corrections, next actions, history, and matching exports', () => {
  let changes = stageEdits(dataset, {}, [{ rowKey: 'row-1', column: 3, value: 'active' }]);
  changes = approveChanges(changes);
  let coordination = recordEvent(emptyCoordination(), { type: 'import', detail: 'Imported source.' });
  coordination = assignNextAction(coordination, 'row-1', assignment);
  coordination = recordEvent(coordination, { type: 'approve', rowKey: 'row-1', detail: 'Approved a confirmed correction.' });
  const backup = JSON.parse(JSON.stringify({ ...sessionSnapshot(dataset, changes), coordination }));
  const restored = restoreSession(backup);
  const restoredCoordination = restoreCoordination(backup.coordination, restored.dataset);
  assert.deepEqual(restored.dataset, dataset);
  assert.deepEqual(restored.changes, changes);
  assert.deepEqual(restoredCoordination, coordination);
  assert.deepEqual(createExports(restored.dataset, restored.changes), createExports(dataset, changes));
  assert.equal(coordinationCSV(restored.dataset, restoredCoordination), coordinationCSV(dataset, coordination));
  assert.equal(activityCSV(restoredCoordination), activityCSV(coordination));
  assert.deepEqual(restoreCoordination(undefined, dataset), emptyCoordination());
});

test('restore rejects unknown rows, duplicate IDs, malformed timestamps, and corrupted state', () => {
  const state = assignNextAction(emptyCoordination(), 'row-1', assignment);
  const mutate = change => { const next = structuredClone(state); change(next); return next; };
  const invalid = [null, {}, { assignments: [], events: [] },
    mutate(next => { next.assignments['row-3'] = next.assignments['row-1']; }),
    mutate(next => { next.assignments['row-1'].status = 'closed'; }),
    mutate(next => { next.assignments['row-1'].updatedAt = 'tomorrow'; }),
    mutate(next => { next.events[0].rowKey = 'row-3'; }),
    mutate(next => { next.events[0].at = '2026-02-30T00:00:00.000Z'; }),
    mutate(next => { next.events[0].type = 'execute-code'; }),
    mutate(next => { next.events.push(next.events[0]); }),
    mutate(next => { next.events[0].actor = ''; }),
    mutate(next => { next.events[0].unexpected = true; }),
  ];
  for (const value of invalid) assert.throws(() => restoreCoordination(value, dataset));
  assert.deepEqual(restoreCoordination(state, dataset), state);
  const otherDataset = createDataset('id,name,email,status,start_date\n1,A,a@example.com,active,2026-01-01');
  assert.throws(() => coordinationCSV(otherDataset, assignNextAction(emptyCoordination(), 'row-2', assignment)), /unknown source row/);
});

test('history bounds reject unsupported data without dropping existing events', () => {
  const state = recordEvent(emptyCoordination(), { type: 'import', detail: 'Keep this record.' });
  const circular = {}; circular.self = circular;
  for (const changes of [circular, { value: undefined }, { value: Infinity }, { value: () => {} }, { value: 'x'.repeat(COORDINATION_LIMITS.eventChanges + 1) }, JSON.parse('{"__proto__":{"polluted":true}}')]) {
    assert.throws(() => recordEvent(state, { type: 'stage', detail: 'Invalid details.', changes }));
  }
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].detail, 'Keep this record.');
  const oversized = { assignments: {}, events: Array.from({ length: COORDINATION_LIMITS.events + 1 }, () => state.events[0]) };
  assert.throws(() => restoreCoordination(oversized, dataset), /limit/);
});
