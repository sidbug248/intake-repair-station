import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { restoreSession, sessionSnapshot } from '../src/lib/intake.mjs';
import { restoreCoordination } from '../src/lib/coordination.mjs';
import { ServiceError } from './providers.mjs';

export const hashToken = token => createHash('sha256').update(token).digest('hex');
const now = () => new Date().toISOString();
const id = prefix => `${prefix}-${randomUUID()}`;
const fail = (message, status = 400, code) => { throw new ServiceError(message, status, code); };
const nameText = (value, label = 'name', max = 120) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) fail(`Use a ${label} with 1–${max} printable characters.`);
  return value.trim();
};

export function validatedSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input), 'utf8') > 8_000_000) fail('The workspace snapshot is invalid or larger than 8 MB.');
  try {
    const restored = restoreSession(input);
    const coordination = restoreCoordination(input.coordination, restored.dataset);
    return { ...sessionSnapshot(restored.dataset, restored.changes), coordination };
  } catch (problem) { fail(`The workspace was not saved: ${problem.message}`); }
}

export function createStore({ filename = ':memory:', ownerToken, ownerLabel = 'Workspace owner' }) {
  if (typeof ownerToken !== 'string' || ownerToken.length < 32 || ownerToken.length > 512) throw new Error('The companion access token must have at least 32 characters.');
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS identities (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, label TEXT NOT NULL, is_owner INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, session_json TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS memberships (workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE, identity_id TEXT REFERENCES identities(id), role TEXT NOT NULL, PRIMARY KEY(workspace_id, identity_id));
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE, actor_id TEXT NOT NULL, actor_label TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE, recipient_id TEXT REFERENCES identities(id), detail TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT);
    CREATE TABLE IF NOT EXISTS usage (day TEXT NOT NULL, subject TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, subject));
  `);
  db.prepare(`INSERT INTO identities(id,token_hash,label,is_owner,created_at) VALUES('owner',?,?,1,?) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,label=excluded.label,revoked=0`).run(hashToken(ownerToken), nameText(ownerLabel, 'owner label'), now());

  const transaction = callback => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = callback(); db.exec('COMMIT'); return value; }
    catch (problem) { db.exec('ROLLBACK'); throw problem; }
  };
  const authenticate = token => {
    if (typeof token !== 'string' || token.length < 32 || token.length > 512) return null;
    const found = db.prepare('SELECT id,label,is_owner FROM identities WHERE token_hash=? AND revoked=0').get(hashToken(token));
    return found ? { id: found.id, label: found.label, isOwner: Boolean(found.is_owner),
      canUseAI: Boolean(found.is_owner) || Boolean(db.prepare("SELECT 1 AS allowed FROM memberships WHERE identity_id=? AND role='editor' LIMIT 1").get(found.id)),
    } : null;
  };
  const access = (actor, workspaceId, roles = ['owner', 'editor', 'viewer']) => {
    const row = db.prepare(`SELECT w.*,m.role FROM workspaces w JOIN memberships m ON m.workspace_id=w.id WHERE w.id=? AND m.identity_id=?`).get(workspaceId, actor.id);
    if (!row) fail('This workspace is unavailable to this access token.', 404, 'workspace_not_found');
    if (!roles.includes(row.role)) fail('This access token does not have permission for that action.', 403, 'forbidden');
    return row;
  };
  const metadata = row => ({ id: row.id, name: row.name, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, role: row.role });
  const event = (actor, row, type, detail) => {
    const at = now();
    db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)').run(id('event'), row.id, actor.id, actor.label, type, detail, row.version, at);
    // Retain recent service history, independently from editable session activity.
    db.prepare('DELETE FROM events WHERE workspace_id=? AND id NOT IN (SELECT id FROM events WHERE workspace_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1000)').run(row.id, row.id);
    for (const recipient of db.prepare('SELECT identity_id FROM memberships WHERE workspace_id=? AND identity_id<>?').all(row.id, actor.id)) {
      db.prepare('INSERT INTO notifications VALUES(?,?,?,?,?,NULL)').run(id('notification'), row.id, recipient.identity_id, `${actor.label}: ${detail}`, at);
      db.prepare('DELETE FROM notifications WHERE recipient_id=? AND id NOT IN (SELECT id FROM notifications WHERE recipient_id=? ORDER BY created_at DESC,rowid DESC LIMIT 500)').run(recipient.identity_id, recipient.identity_id);
    }
  };
  return {
    authenticate,
    close: () => db.close(),
    listWorkspaces(actor) { return db.prepare('SELECT w.*,m.role FROM workspaces w JOIN memberships m ON m.workspace_id=w.id WHERE m.identity_id=? ORDER BY w.updated_at DESC').all(actor.id).map(metadata); },
    createWorkspace(actor, input) {
      if (!actor.isOwner) fail('Only the companion owner can create a new workspace.', 403, 'forbidden');
      const name = nameText(input.name, 'workspace name');
      const session = validatedSnapshot(input.session);
      if (db.prepare('SELECT COUNT(*) AS count FROM workspaces').get().count >= 100) fail('This companion supports 100 saved workspaces. Export and remove an older workspace first.', 409, 'workspace_limit');
      return transaction(() => {
        const row = { id: id('workspace'), name, version: 1, created_at: now(), updated_at: now(), role: 'owner' };
        db.prepare('INSERT INTO workspaces VALUES(?,?,?,?,?,?)').run(row.id, name, JSON.stringify(session), row.version, row.created_at, row.updated_at);
        db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(row.id, actor.id, 'owner');
        event(actor, row, 'created', 'Created a saved workspace.');
        return { ...metadata(row), session };
      });
    },
    getWorkspace(actor, workspaceId) {
      const row = access(actor, workspaceId); return { ...metadata(row), session: JSON.parse(row.session_json) };
    },
    saveWorkspace(actor, workspaceId, input) {
      const existing = access(actor, workspaceId, ['owner', 'editor']);
      if (!Number.isInteger(input.expectedVersion) || input.expectedVersion !== existing.version) fail('A newer saved version exists. Reload it or save a separate workspace; no changes were overwritten.', 409, 'version_conflict');
      const session = validatedSnapshot(input.session);
      const name = input.name === undefined ? existing.name : nameText(input.name, 'workspace name');
      return transaction(() => {
        const updatedAt = now();
        const result = db.prepare('UPDATE workspaces SET name=?,session_json=?,version=version+1,updated_at=? WHERE id=? AND version=?').run(name, JSON.stringify(session), updatedAt, workspaceId, input.expectedVersion);
        if (!result.changes) fail('A newer saved version exists. Reload before saving.', 409, 'version_conflict');
        const row = { ...existing, name, version: existing.version + 1, updated_at: updatedAt };
        event(actor, row, 'saved', `Saved workspace revision ${row.version}.`);
        return { ...metadata(row), session };
      });
    },
    deleteWorkspace(actor, workspaceId, input) {
      const row = access(actor, workspaceId, ['owner']);
      if (input.expectedVersion !== row.version) fail('The workspace changed. Reload it before deleting.', 409, 'version_conflict');
      return transaction(() => {
        const members = db.prepare('SELECT identity_id FROM memberships WHERE workspace_id=? AND identity_id<>?').all(workspaceId, actor.id);
        db.prepare('DELETE FROM workspaces WHERE id=?').run(workspaceId);
        for (const member of members) db.prepare('UPDATE identities SET revoked=1 WHERE id=? AND is_owner=0').run(member.identity_id);
        return { deleted: true, id: workspaceId };
      });
    },
    listActivity(actor, workspaceId) {
      access(actor, workspaceId);
      return db.prepare('SELECT id,actor_id AS actorId,actor_label AS actorLabel,type,detail,version,created_at AS createdAt FROM events WHERE workspace_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100').all(workspaceId);
    },
    listMembers(actor, workspaceId) {
      access(actor, workspaceId);
      return db.prepare('SELECT i.id,i.label,m.role,i.created_at AS createdAt FROM identities i JOIN memberships m ON m.identity_id=i.id WHERE m.workspace_id=? AND i.revoked=0 ORDER BY i.created_at').all(workspaceId);
    },
    createMemberToken(actor, workspaceId, input) {
      const row = access(actor, workspaceId, ['owner']);
      const label = nameText(input.label, 'collaborator label');
      if (!['editor', 'viewer'].includes(input.role)) fail('Collaborator role must be editor or viewer.');
      if (db.prepare('SELECT COUNT(*) AS count FROM memberships WHERE workspace_id=?').get(workspaceId).count >= 25) fail('A workspace supports at most 25 access identities.', 409, 'member_limit');
      return transaction(() => {
        const token = randomBytes(32).toString('base64url'); const identityId = id('member'); const createdAt = now();
        db.prepare('INSERT INTO identities VALUES(?,?,?,0,0,?)').run(identityId, hashToken(token), label, createdAt);
        db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(workspaceId, identityId, input.role);
        event(actor, row, 'member_added', `Created ${input.role} access for ${label}.`);
        return { id: identityId, label, role: input.role, createdAt, token };
      });
    },
    revokeMember(actor, workspaceId, memberId) {
      const row = access(actor, workspaceId, ['owner']);
      const member = db.prepare('SELECT i.* FROM identities i JOIN memberships m ON m.identity_id=i.id WHERE m.workspace_id=? AND i.id=?').get(workspaceId, memberId);
      if (!member || member.is_owner) fail('Only a collaborator access token can be revoked.', 400, 'invalid_member');
      return transaction(() => {
        db.prepare('UPDATE identities SET revoked=1 WHERE id=?').run(memberId);
        db.prepare('DELETE FROM memberships WHERE workspace_id=? AND identity_id=?').run(workspaceId, memberId);
        db.prepare('DELETE FROM notifications WHERE recipient_id=?').run(memberId);
        event(actor, row, 'member_revoked', `Revoked access for ${member.label}.`);
        return { revoked: true, id: memberId };
      });
    },
    listNotifications(actor) { return db.prepare('SELECT n.id,n.workspace_id AS workspaceId,w.name AS workspaceName,n.detail,n.created_at AS createdAt,n.read_at AS readAt FROM notifications n JOIN workspaces w ON w.id=n.workspace_id JOIN memberships m ON m.workspace_id=w.id AND m.identity_id=n.recipient_id WHERE n.recipient_id=? ORDER BY n.created_at DESC,n.rowid DESC LIMIT 100').all(actor.id); },
    markNotificationRead(actor, notificationId) {
      const result = db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND recipient_id=?').run(now(), notificationId, actor.id);
      if (!result.changes) fail('The notification is unavailable.', 404, 'notification_not_found');
      return { read: true, id: notificationId };
    },
    reserveAI(actor, limit) {
      const day = now().slice(0, 10);
      return transaction(() => {
        const total = db.prepare("SELECT requests FROM usage WHERE day=? AND subject='all'").get(day)?.requests ?? 0;
        if (total >= limit) fail('The companion’s daily AI request budget has been reached.', 429, 'daily_budget');
        for (const subject of ['all', actor.id]) db.prepare('INSERT INTO usage VALUES(?,?,1) ON CONFLICT(day,subject) DO UPDATE SET requests=requests+1').run(day, subject);
        db.prepare('DELETE FROM usage WHERE day<?').run(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
        return { day, requests: total + 1, remaining: Math.max(0, limit - total - 1) };
      });
    },
    usage() { const day = now().slice(0, 10); return { day, requests: db.prepare("SELECT requests FROM usage WHERE day=? AND subject='all'").get(day)?.requests ?? 0 }; },
    recordConnector(actor, workspaceId, connectorLabel, delivered) {
      const row = access(actor, workspaceId, ['owner', 'editor']);
      event(actor, row, delivered ? 'connector_delivered' : 'connector_failed', `${delivered ? 'Delivered' : 'Attempted'} a summary to configured connector ${connectorLabel}.`);
    },
    requireEditor(actor, workspaceId) { return metadata(access(actor, workspaceId, ['owner', 'editor'])); },
  };
}
