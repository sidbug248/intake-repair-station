import http from 'node:http';
import { createHmac } from 'node:crypto';
import { createStore } from './store.mjs';
import { providersFromEnv, publicProviderConfig, runProviderRequest, ServiceError } from './providers.mjs';
import { handoffContext, validateAIRequest } from '../src/lib/ai.mjs';
import { restoreSession } from '../src/lib/intake.mjs';

const MAX_BODY = 8_500_000;
const DEFAULT_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173'];

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(JSON.stringify(value));
}

async function body(req) {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new ServiceError('Use an application/json request.', 415, 'content_type');
  const size = Number(req.headers['content-length']);
  if (Number.isFinite(size) && size > MAX_BODY) throw new ServiceError('The request is larger than the supported workspace limit.', 413, 'body_limit');
  let length = 0; const chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > MAX_BODY) throw new ServiceError('The request is too large.', 413, 'body_limit'); chunks.push(chunk); }
  try { const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(); return input; }
  catch { throw new ServiceError('The request must contain a JSON object.', 400, 'invalid_json'); }
}

export function connectorFromEnv(env = process.env) {
  if (!env.HANDOFF_WEBHOOK_URL) return null;
  let url;
  try { url = new URL(env.HANDOFF_WEBHOOK_URL); } catch { throw new Error('The handoff webhook URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('The handoff webhook must use HTTPS without URL credentials.');
  return { id: 'handoff-webhook', label: (env.HANDOFF_WEBHOOK_LABEL || 'Handoff webhook').slice(0, 120), url: url.toString(), secret: env.HANDOFF_WEBHOOK_SECRET || '' };
}

/** Loopback service only. Public identity/signup and Internet hosting are a separate deployment phase. */
export function createCompanion({ ownerToken, ownerLabel, database = ':memory:', providerConfig = providersFromEnv(), connector = null, allowedOrigins = DEFAULT_ORIGINS, allowFileOrigin = false, fetchImpl = fetch } = {}) {
  const store = createStore({ filename: database, ownerToken, ownerLabel });
  const origins = new Set(allowedOrigins);
  const inflightAI = new Set();
  const minuteRequests = new Map();
  const connectorInFlight = new Set();
  const generalRequests = new Map();
  let closing = false;

  function rateLimit(actor, key, limit, counter = generalRequests) {
    const minute = Math.floor(Date.now() / 60000);
    const counterKey = `${key}:${actor.id}`;
    const current = counter.get(counterKey);
    if (current?.minute === minute && current.count >= limit) throw new ServiceError('Too many requests. Wait a minute and try again.', 429, 'rate_limit');
    counter.set(counterKey, { minute, count: current?.minute === minute ? current.count + 1 : 1 });
    if (counter.size > 5000) for (const [entry, value] of counter) if (value.minute < minute - 1) counter.delete(entry);
  }

  function connectorPreview(actor, workspaceId, includeAssignments = false) {
    if (!connector) throw new ServiceError('No handoff connector is configured.', 503, 'connector_unavailable');
    const workspace = store.getWorkspace(actor, workspaceId);
    const restored = restoreSession(workspace.session);
    const context = handoffContext(restored.dataset, restored.changes, includeAssignments ? workspace.session.coordination : { assignments: {} });
    if (context.totals.pending) throw new ServiceError('Approve or undo all proposed corrections before sending a reviewed handoff.', 409, 'pending_review');
    return { connector: { id: connector.id, label: connector.label, destination: new URL(connector.url).origin }, payload: {
      type: 'intake.handoff.summary', version: 1, workspace: { id: workspace.id, name: workspace.name, revision: workspace.version },
      totals: context.totals, facts: context.facts, includesAssignments: includeAssignments,
    } };
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (closing) throw new ServiceError('The companion is shutting down.', 503, 'shutting_down');
      const host = req.headers.host || '';
      if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) throw new ServiceError('This companion only accepts loopback hosts.', 403, 'host_not_allowed');
      const origin = req.headers.origin;
      if (origin && !origins.has(origin) && !(allowFileOrigin && origin === 'null')) throw new ServiceError('This app origin is not allowed by the companion.', 403, 'origin_not_allowed');
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
        res.writeHead(204); res.end(); return;
      }
      const url = new URL(req.url, `http://${host}`);
      const route = url.pathname;
      if (route === '/api/health' && req.method === 'GET') { json(res, 200, { service: 'intake-local-companion', version: 1, localOnly: true }); return; }
      const authorization = req.headers.authorization;
      const actor = store.authenticate(authorization?.startsWith('Bearer ') ? authorization.slice(7) : '');
      if (!actor) throw new ServiceError('Connect with a valid companion access token.', 401, 'unauthorized');
      rateLimit(actor, 'http', 120);
      if (route === '/api/config' && req.method === 'GET') {
        json(res, 200, { ...publicProviderConfig(providerConfig), actor, usage: store.usage(), connectors: connector ? [{ id: connector.id, label: connector.label, destination: new URL(connector.url).origin }] : [], capabilities: ['saved-workspaces', 'revision-checks', 'member-access', 'activity', 'notifications', 'ai', 'handoff-webhook'] }); return;
      }
      if (route === '/api/ai' && req.method === 'POST') {
        if (!actor.canUseAI) throw new ServiceError('Viewer access is read-only. Connect with owner or editor access to use this companion’s AI allowance.', 403, 'ai_forbidden');
        const input = await body(req);
        try { validateAIRequest(input); } catch (problem) { throw new ServiceError(problem.message); }
        if (!providerConfig.providers.length) throw new ServiceError('Configure at least one AI provider or local model in the companion environment.', 503, 'provider_unavailable');
        const selectedProvider = providerConfig.providers.find(provider => provider.id === (input.provider ?? providerConfig.providers[0].id));
        if (!selectedProvider) throw new ServiceError('This provider is not configured in the local companion.', 503, 'provider_unavailable');
        if (input.model !== undefined && !selectedProvider.models.includes(input.model)) throw new ServiceError('Choose a model enabled by this companion.', 400, 'model_not_allowed');
        if (inflightAI.has(actor.id)) throw new ServiceError('An AI request is already running for this access token.', 429, 'ai_busy');
        rateLimit(actor, 'ai', providerConfig.limits.minuteRequests, minuteRequests);
        const usage = store.reserveAI(actor, providerConfig.limits.dailyRequests);
        inflightAI.add(actor.id);
        try { json(res, 200, { ...await runProviderRequest(input, providerConfig, { fetchImpl }), usage }); }
        finally { inflightAI.delete(actor.id); }
        return;
      }
      if (route === '/api/workspaces') {
        if (req.method === 'GET') { json(res, 200, { workspaces: store.listWorkspaces(actor) }); return; }
        if (req.method === 'POST') { json(res, 201, store.createWorkspace(actor, await body(req))); return; }
      }
      if (route === '/api/notifications' && req.method === 'GET') { json(res, 200, { notifications: store.listNotifications(actor) }); return; }
      const notification = route.match(/^\/api\/notifications\/([A-Za-z0-9-]+)\/read$/);
      if (notification && req.method === 'POST') { await body(req); json(res, 200, store.markNotificationRead(actor, notification[1])); return; }
      const match = route.match(/^\/api\/workspaces\/([A-Za-z0-9-]+)(?:\/(.*))?$/);
      if (match) {
        const workspaceId = match[1]; const tail = match[2];
        if (!tail) {
          if (req.method === 'GET') { json(res, 200, store.getWorkspace(actor, workspaceId)); return; }
          if (req.method === 'PUT') { json(res, 200, store.saveWorkspace(actor, workspaceId, await body(req))); return; }
          if (req.method === 'DELETE') { json(res, 200, store.deleteWorkspace(actor, workspaceId, await body(req))); return; }
        }
        if (tail === 'activity' && req.method === 'GET') { json(res, 200, { events: store.listActivity(actor, workspaceId) }); return; }
        if (tail === 'members' && req.method === 'GET') { json(res, 200, { members: store.listMembers(actor, workspaceId) }); return; }
        if (tail === 'members' && req.method === 'POST') { json(res, 201, store.createMemberToken(actor, workspaceId, await body(req))); return; }
        const member = tail?.match(/^members\/([A-Za-z0-9-]+)$/);
        if (member && req.method === 'DELETE') { await body(req); json(res, 200, store.revokeMember(actor, workspaceId, member[1])); return; }
        if (tail === 'connectors/handoff-webhook/preview' && req.method === 'POST') {
          const input = await body(req); json(res, 200, connectorPreview(actor, workspaceId, input.includeAssignments === true)); return;
        }
        if (tail === 'connectors/handoff-webhook/send' && req.method === 'POST') {
          const input = await body(req); const workspace = store.requireEditor(actor, workspaceId);
          if (input.expectedVersion !== workspace.version || input.confirm !== true) throw new ServiceError('Review the connector preview and confirm the current workspace version before sending.', 409, 'connector_confirmation');
          const preview = connectorPreview(actor, workspaceId, input.includeAssignments === true);
          if (connectorInFlight.has(workspaceId)) throw new ServiceError('A connector delivery is already running for this workspace.', 429, 'connector_busy');
          rateLimit(actor, 'connector', 3);
          connectorInFlight.add(workspaceId);
          try {
            const payload = JSON.stringify(preview.payload);
            const headers = { 'Content-Type': 'application/json' };
            if (connector.secret) headers['X-Handoff-Signature'] = `sha256=${createHmac('sha256', connector.secret).update(payload).digest('hex')}`;
            let delivered = false;
            try {
              const response = await fetchImpl(connector.url, { method: 'POST', body: payload, headers, redirect: 'error', signal: AbortSignal.timeout(15_000) });
              delivered = response.ok;
              await response.body?.cancel?.().catch(() => {});
            } catch { /* The response deliberately contains no credential or upstream message. */ }
            store.recordConnector(actor, workspaceId, connector.label, delivered);
            if (!delivered) throw new ServiceError('The connector did not confirm delivery. Check the destination before retrying; it may have received the request.', 502, 'connector_failed');
            json(res, 200, { delivered: true, workspaceId, version: workspace.version, connector: connector.id });
          } finally { connectorInFlight.delete(workspaceId); }
          return;
        }
      }
      throw new ServiceError('This companion route is unavailable.', 404, 'route_not_found');
    } catch (problem) {
      if (res.headersSent) { res.end(); return; }
      const expected = problem instanceof ServiceError;
      json(res, expected ? problem.status : 500, { error: { code: expected ? problem.code : 'server_error', message: expected ? problem.message : 'The companion could not complete this action. Your current browser session is unchanged.' } });
    }
  });
  server.requestTimeout = 90_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  return { server, store, async close() {
    closing = true;
    if (server.listening) await new Promise(resolve => server.close(resolve));
    store.close();
  } };
}
