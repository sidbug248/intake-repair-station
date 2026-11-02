import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request as httpRequest } from 'node:http';
import { createStore } from '../server/store.mjs';
import { createCompanion } from '../server/companion.mjs';
import { providersFromEnv } from '../server/providers.mjs';
import { createCompanionClient } from '../src/lib/companion.mjs';
import { createDataset, EXAMPLE_CSV, sessionSnapshot } from '../src/lib/intake.mjs';
import { emptyCoordination } from '../src/lib/coordination.mjs';
import { mappingContext } from '../src/lib/ai.mjs';

const ownerToken = 'test-owner-token-that-is-at-least-32-characters';
const session = () => ({ ...sessionSnapshot(createDataset(EXAMPLE_CSV), {}), coordination: emptyCoordination() });

test('workspace permissions isolate members, preserve snapshots, and reject stale updates', () => {
  const store = createStore({ ownerToken });
  try {
    const owner = store.authenticate(ownerToken);
    const first = store.createWorkspace(owner, { name: 'First', session: { ...session(), token: 'must-not-persist' } });
    const second = store.createWorkspace(owner, { name: 'Second', session: session() });
    assert.equal(JSON.stringify(first).includes('must-not-persist'), false);
    const viewerToken = store.createMemberToken(owner, first.id, { label: 'Reviewer', role: 'viewer' });
    const viewer = store.authenticate(viewerToken.token);
    assert.equal(viewer.canUseAI, false);
    assert.deepEqual(store.listWorkspaces(viewer).map(row => row.id), [first.id]);
    assert.throws(() => store.getWorkspace(viewer, second.id), problem => problem.status === 404);
    assert.throws(() => store.saveWorkspace(viewer, first.id, { session: session(), expectedVersion: 1 }), problem => problem.status === 403);
    assert.throws(() => store.deleteWorkspace(viewer, first.id, { expectedVersion: 1 }), problem => problem.status === 403);
    const editorToken = store.createMemberToken(owner, first.id, { label: 'Editor', role: 'editor' });
    const editor = store.authenticate(editorToken.token);
    assert.equal(editor.canUseAI, true);
    const updated = store.saveWorkspace(editor, first.id, { name: 'Reviewed', session: session(), expectedVersion: 1 });
    assert.equal(updated.version, 2);
    assert.throws(() => store.saveWorkspace(owner, first.id, { name: 'Stale', session: session(), expectedVersion: 1 }), problem => problem.status === 409);
    assert.equal(store.getWorkspace(owner, first.id).name, 'Reviewed');
    assert.equal(store.listActivity(owner, first.id)[0].actorLabel, 'Editor');
    assert.ok(store.listNotifications(viewer).some(item => item.detail.includes('revision 2')));
    const notification = store.listNotifications(viewer)[0];
    assert.throws(() => store.markNotificationRead(editor, notification.id), problem => problem.status === 404);
    assert.equal(store.markNotificationRead(viewer, notification.id).read, true);
    store.revokeMember(owner, first.id, editor.id);
    assert.equal(store.authenticate(editorToken.token), null);
    assert.throws(() => store.deleteWorkspace(owner, first.id, { expectedVersion: 1 }), problem => problem.status === 409);
    store.deleteWorkspace(owner, first.id, { expectedVersion: 2 });
    assert.equal(store.authenticate(viewerToken.token), null);
  } finally { store.close(); }
});

test('SQLite persists reviewed sessions and global AI request budget across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'intake-store-test-'));
  const filename = join(dir, 'state.sqlite');
  let store;
  try {
    store = createStore({ ownerToken, filename });
    const owner = store.authenticate(ownerToken);
    const saved = store.createWorkspace(owner, { name: 'Persisted', session: session() });
    store.reserveAI(owner, 1); store.close();
    store = createStore({ ownerToken, filename });
    const restoredOwner = store.authenticate(ownerToken);
    assert.equal(store.getWorkspace(restoredOwner, saved.id).session.raw, EXAMPLE_CSV);
    assert.equal(store.usage().requests, 1);
    assert.throws(() => store.reserveAI(restoredOwner, 1), problem => problem.status === 429);
  } finally { store?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('local HTTP routes require token, exact Origin, loopback Host and explicit saves', async () => {
  const app = createCompanion({ ownerToken, providerConfig: providersFromEnv({}), allowFileOrigin: true });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  try {
    assert.equal((await fetch(`${baseUrl}/api/workspaces`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/config`, { headers: { Authorization: `Bearer ${ownerToken}`, Origin: 'https://evil.example' } })).status, 403);
    const rebindingStatus = await new Promise((resolve, reject) => {
      const req = httpRequest(`${baseUrl}/api/config`, { headers: { Authorization: `Bearer ${ownerToken}`, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(rebindingStatus, 403);
    const file = await fetch(`${baseUrl}/api/config`, { headers: { Authorization: `Bearer ${ownerToken}`, Origin: 'null' } });
    assert.equal(file.status, 200); assert.equal(file.headers.get('access-control-allow-origin'), 'null');
    const client = createCompanionClient({ baseUrl, token: ownerToken });
    assert.deepEqual(await client.listWorkspaces(), []);
    assert.equal((await client.config()).actor.isOwner, true);
    const saved = await client.createWorkspace({ name: 'HTTP saved', session: session() });
    assert.equal((await client.getWorkspace(saved.id)).session.raw, EXAMPLE_CSV);
    const member = await client.createMemberToken(saved.id, { label: 'Read only', role: 'viewer' });
    const viewer = createCompanionClient({ baseUrl, token: member.token });
    await assert.rejects(viewer.saveWorkspace(saved.id, { session: session(), expectedVersion: 1 }), problem => problem.status === 403);
    await assert.rejects(viewer.runAI({ task: 'mapping', revision: 'r1', context: mappingContext(['id', 'name', 'email', 'status', 'start_date']) }), problem => problem.status === 403 && problem.code === 'ai_forbidden');
    await assert.rejects(client.runAI({ task: 'mapping', revision: 'r1', context: mappingContext(['id', 'name', 'email', 'status', 'start_date']) }), problem => problem.code === 'provider_unavailable');
    assert.equal((await client.config()).usage.requests, 0);
    assert.throws(() => createCompanionClient({ baseUrl: 'https://other.example', token: ownerToken }), /loopback/);
  } finally { await app.close(); }
});

test('AI requests are budgeted and structured results never gain approval authority', async () => {
  const providerConfig = providersFromEnv({ OPENAI_API_KEY: 'test-secret', OPENAI_MODEL: 'test-model', AI_DAILY_REQUESTS: '1' });
  let providerCalls = 0;
  const app = createCompanion({ ownerToken, providerConfig, fetchImpl: async () => {
    providerCalls++;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ mappings: ['id', 'name', 'email', 'status', 'start_date'].map(field => ({ field, header: field, reason: 'Exact header.' })) }) } }] }), { status: 200 });
  } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const client = createCompanionClient({ baseUrl: `http://127.0.0.1:${app.server.address().port}`, token: ownerToken });
  try {
    const request = { task: 'mapping', revision: 'r1', context: mappingContext(['id', 'name', 'email', 'status', 'start_date']) };
    const result = await client.runAI(request);
    assert.equal(result.reviewState, 'pending'); assert.equal(result.usage.remaining, 0);
    await assert.rejects(client.runAI(request), problem => problem.status === 429 && problem.code === 'daily_budget');
    assert.equal(providerCalls, 1);
    assert.deepEqual(await client.listWorkspaces(), []);
  } finally { await app.close(); }
});

test('webhooks never send on save, require current explicit confirmation, and omit record values', async () => {
  let delivery;
  const app = createCompanion({ ownerToken, providerConfig: providersFromEnv({}), connector: { id: 'handoff-webhook', label: 'Test sink', url: 'https://sink.example/handoff', secret: 'test-signature-secret' }, fetchImpl: async (url, options) => { delivery = { url, ...options }; return new Response(null, { status: 204 }); } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const client = createCompanionClient({ baseUrl: `http://127.0.0.1:${app.server.address().port}`, token: ownerToken });
  try {
    const saved = await client.createWorkspace({ name: 'Send reviewed summary', session: session() });
    assert.equal(delivery, undefined);
    const preview = await client.previewConnector(saved.id);
    assert.equal(preview.payload.includesAssignments, false);
    assert.equal(JSON.stringify(preview).includes('@example.com'), false);
    await assert.rejects(client.sendConnector(saved.id, { expectedVersion: 1 }), problem => problem.code === 'connector_confirmation');
    assert.equal(delivery, undefined);
    const sent = await client.sendConnector(saved.id, { expectedVersion: 1, confirm: true, includeAssignments: false });
    assert.equal(sent.delivered, true);
    assert.equal(delivery.headers['X-Handoff-Signature'].startsWith('sha256='), true);
    assert.deepEqual(JSON.parse(delivery.body), preview.payload);
  } finally { await app.close(); }
});
