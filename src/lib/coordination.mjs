import { encodeCSV, getColumnIndex, MAX_ROWS, validISODate } from './intake.mjs';

export const FOLLOW_UP_STATUSES = ['open', 'waiting', 'done'];
export const EVENT_TYPES = ['import', 'stage', 'approve', 'undo', 'export', 'backup', 'restore', 'assignment'];
export const COORDINATION_LIMITS = Object.freeze({
  owner: 200, action: 2000, note: 4000, actor: 200, detail: 4000,
  events: 10_000, eventChanges: 100_000, totalText: 4_000_000,
});

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const knownKeys = (value, keys) => Object.keys(value).every(key => keys.includes(key));

function textField(value, field, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new Error(`The ${field} must be ${required ? 'nonempty text' : 'text'} of at most ${max.toLocaleString()} characters.`);
  }
  return value;
}

function rowReference(value, rowKeys) {
  if (typeof value !== 'string' || !/^row-[1-9]\d*$/.test(value) || Number(value.slice(4)) > MAX_ROWS
    || (rowKeys && !rowKeys.has(value))) throw new Error('A follow-up or activity item refers to an unknown source row.');
  return value;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(new Date(value).valueOf()) || new Date(value).toISOString() !== value) throw new Error('A follow-up or activity timestamp is invalid.');
  return value;
}

function assignmentFields(value, saved = false) {
  if (!isRecord(value) || !knownKeys(value, ['owner', 'action', 'dueDate', 'status', 'note', ...(saved ? ['updatedAt'] : [])])) {
    throw new Error('A next-action assignment is malformed.');
  }
  const result = {
    owner: textField(value.owner, 'owner label', COORDINATION_LIMITS.owner, true),
    action: textField(value.action, 'next action', COORDINATION_LIMITS.action, true),
    dueDate: value.dueDate,
    status: value.status,
    note: textField(value.note, 'next-action note', COORDINATION_LIMITS.note),
  };
  if (typeof result.dueDate !== 'string' || (result.dueDate !== '' && !validISODate(result.dueDate))) {
    throw new Error('Use a real due date in YYYY-MM-DD format, or leave the due date empty.');
  }
  if (!FOLLOW_UP_STATUSES.includes(result.status)) throw new Error('Next-action status must be open, waiting, or done.');
  if (saved) result.updatedAt = timestamp(value.updatedAt);
  return result;
}

/** Clone bounded JSON details without dropping unsupported values. */
function changeDetails(value) {
  const ancestors = new Set();
  let size = 0;
  const copy = (item, depth) => {
    if (depth > 6) throw new Error('Activity change details are too deeply nested.');
    if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) { size += 16; return item; }
    if (typeof item === 'string') { size += item.length; return item; }
    if (!Array.isArray(item) && !isRecord(item)) throw new Error('Activity change details must contain only JSON-compatible values.');
    if (ancestors.has(item)) throw new Error('Activity change details cannot contain a circular reference.');
    ancestors.add(item);
    const entries = Array.isArray(item) ? item : Object.entries(item);
    if (entries.length > MAX_ROWS) throw new Error('Activity change details contain too many entries.');
    let result;
    if (Array.isArray(item)) {
      if (Object.keys(item).length !== item.length) throw new Error('Activity change details cannot contain sparse arrays.');
      result = item.map(child => copy(child, depth + 1));
    } else {
      result = Object.fromEntries(entries.map(([key, child]) => {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Activity change details contain an unsupported property.');
        size += key.length;
        return [key, copy(child, depth + 1)];
      }));
    }
    ancestors.delete(item);
    if (size > COORDINATION_LIMITS.eventChanges) throw new Error('Activity change details are too large; record a concise description.');
    return result;
  };
  if (!Array.isArray(value) && !isRecord(value)) throw new Error('Activity change details must be an object or a list.');
  return copy(value, 0);
}

function savedEvent(value, rowKeys) {
  if (!isRecord(value) || !knownKeys(value, ['id', 'at', 'type', 'rowKey', 'actor', 'detail', 'changes'])) throw new Error('A saved activity item is malformed.');
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value.id)) throw new Error('A saved activity ID is invalid.');
  if (!EVENT_TYPES.includes(value.type)) throw new Error('An activity item has an unsupported event type.');
  return {
    id: value.id, at: timestamp(value.at), type: value.type,
    ...(value.rowKey !== undefined ? { rowKey: rowReference(value.rowKey, rowKeys) } : {}),
    actor: textField(value.actor, 'actor label', COORDINATION_LIMITS.actor, true),
    detail: textField(value.detail, 'activity description', COORDINATION_LIMITS.detail, true),
    ...(value.changes !== undefined ? { changes: changeDetails(value.changes) } : {}),
  };
}

function validateState(value, dataset) {
  if (!isRecord(value) || !knownKeys(value, ['assignments', 'events']) || !isRecord(value.assignments) || !Array.isArray(value.events)) {
    throw new Error('Saved follow-up data must contain assignments and an activity list.');
  }
  if (Object.keys(value.assignments).length > MAX_ROWS || value.events.length > COORDINATION_LIMITS.events) {
    throw new Error('Saved follow-up data exceeds the supported row or activity limit.');
  }
  const rowKeys = dataset ? new Set(dataset.rows.map(row => row.key)) : undefined;
  const assignments = Object.fromEntries(Object.entries(value.assignments).map(([rowKey, value]) => [rowReference(rowKey, rowKeys), assignmentFields(value, true)]));
  const seen = new Set();
  const events = value.events.map(event => {
    const copy = savedEvent(event, rowKeys);
    if (seen.has(copy.id)) throw new Error('Saved activity contains a duplicate event ID.');
    seen.add(copy.id);
    return copy;
  });
  const result = { assignments, events };
  if (JSON.stringify(result).length > COORDINATION_LIMITS.totalText) throw new Error('Follow-up history is too large. Export a backup before starting a new session.');
  return result;
}

export function emptyCoordination() { return { assignments: {}, events: [] }; }

/** Actor names are local attribution labels, not authenticated identities. */
export function recordEvent(state, input) {
  const next = validateState(state);
  if (!isRecord(input) || !knownKeys(input, ['type', 'rowKey', 'actor', 'detail', 'changes'])) throw new Error('The activity item is malformed.');
  if (next.events.length >= COORDINATION_LIMITS.events) throw new Error('The activity limit has been reached. Export a backup before starting a new session.');
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${next.events.length}-${Math.random().toString(36).slice(2)}`;
  const event = savedEvent({
    id: `event-${random}`, at: new Date().toISOString(), type: input.type,
    ...(input.rowKey !== undefined ? { rowKey: input.rowKey } : {}),
    actor: input.actor ?? 'You', detail: input.detail,
    ...(input.changes !== undefined ? { changes: input.changes } : {}),
  });
  next.events.push(event);
  return validateState(next);
}

export function assignNextAction(state, rowKey, input, actor = 'You') {
  const next = validateState(state);
  rowReference(rowKey);
  const fields = assignmentFields(input);
  const before = next.assignments[rowKey] ?? null;
  next.assignments[rowKey] = { ...fields, updatedAt: new Date().toISOString() };
  return recordEvent(next, {
    type: 'assignment', rowKey, actor,
    detail: before ? 'Updated the next action and owner.' : 'Assigned a next action and owner.',
    changes: { before, after: next.assignments[rowKey] },
  });
}

/** Missing data is supported for legacy backups; malformed data is not discarded. */
export function restoreCoordination(value, dataset) {
  if (value === undefined) return emptyCoordination();
  if (!dataset || !Array.isArray(dataset.rows)) throw new Error('Import the source dataset before restoring follow-up data.');
  return validateState(value, dataset);
}

/** One row per original source record, including records without an assignment. */
export function coordinationCSV(dataset, state, protectFormulas = true) {
  const value = restoreCoordination(state, dataset);
  const idColumn = getColumnIndex(dataset, 'id');
  const nameColumn = getColumnIndex(dataset, 'name');
  return encodeCSV([
    ['row_ref', 'source_line', 'source_id', 'source_name', 'owner', 'next_action', 'due_date', 'follow_up_status', 'notes', 'updated_at'],
    ...dataset.rows.map(row => {
      const assignment = value.assignments[row.key];
      return [row.key, row.sourceLine, row.original[idColumn] ?? '', row.original[nameColumn] ?? '', assignment?.owner ?? '', assignment?.action ?? '', assignment?.dueDate ?? '', assignment?.status ?? '', assignment?.note ?? '', assignment?.updatedAt ?? ''];
    }),
  ], protectFormulas);
}

/** Activity is preserved in recorded order, oldest first. It remains locally editable. */
export function activityCSV(state, protectFormulas = true) {
  const value = validateState(state);
  return encodeCSV([
    ['recorded_at', 'event_id', 'event_type', 'row_ref', 'actor_label', 'detail', 'changes_json'],
    ...value.events.map(event => [event.at, event.id, event.type, event.rowKey ?? '', event.actor, event.detail, event.changes === undefined ? '' : JSON.stringify(event.changes)]),
  ], protectFormulas);
}
