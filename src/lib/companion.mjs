export class CompanionError extends Error {
  constructor(message, status = 0, code = 'connection_error') { super(message); this.status = status; this.code = code; }
}

export function createCompanionClient({ baseUrl = 'http://127.0.0.1:4317', token, fetchImpl = globalThis.fetch } = {}) {
  let base;
  try { base = new URL(baseUrl); } catch { throw new CompanionError('Enter a valid companion address.'); }
  if (!['http:', 'https:'].includes(base.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new CompanionError('Connect to a loopback companion address, such as http://127.0.0.1:4317.');
  if (typeof token !== 'string' || token.length < 32 || token.length > 512 || /[\r\n]/.test(token)) throw new CompanionError('Enter the companion access token from its local configuration.');
  const encode = value => encodeURIComponent(value);
  const request = async (route, method = 'GET', value) => {
    let response;
    try { response = await fetchImpl(new URL(route, base), { method, headers: { Authorization: `Bearer ${token}`, ...(value === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }), credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(190_000) }); }
    catch { throw new CompanionError('The local companion could not be reached. Start it, check the address and allowed app origin, then reconnect.'); }
    let json;
    try { json = await response.json(); } catch { throw new CompanionError('The companion returned an invalid response.', response.status, 'invalid_response'); }
    if (!response.ok) throw new CompanionError(json.error?.message || 'The companion could not complete this action.', response.status, json.error?.code || 'request_failed');
    return json;
  };
  return Object.freeze({
    health: () => request('/api/health'),
    config: () => request('/api/config'),
    listWorkspaces: () => request('/api/workspaces').then(result => result.workspaces),
    createWorkspace: input => request('/api/workspaces', 'POST', input),
    getWorkspace: id => request(`/api/workspaces/${encode(id)}`),
    saveWorkspace: (id, input) => request(`/api/workspaces/${encode(id)}`, 'PUT', input),
    deleteWorkspace: (id, input) => request(`/api/workspaces/${encode(id)}`, 'DELETE', input),
    listActivity: id => request(`/api/workspaces/${encode(id)}/activity`).then(result => result.events),
    listMembers: id => request(`/api/workspaces/${encode(id)}/members`).then(result => result.members),
    createMemberToken: (id, input) => request(`/api/workspaces/${encode(id)}/members`, 'POST', input),
    revokeMember: (id, memberId) => request(`/api/workspaces/${encode(id)}/members/${encode(memberId)}`, 'DELETE', {}),
    listNotifications: () => request('/api/notifications').then(result => result.notifications),
    markNotificationRead: id => request(`/api/notifications/${encode(id)}/read`, 'POST', {}),
    runAI: input => request('/api/ai', 'POST', input),
    previewConnector: (id, { includeAssignments = false } = {}) => request(`/api/workspaces/${encode(id)}/connectors/handoff-webhook/preview`, 'POST', { includeAssignments }),
    sendConnector: (id, input) => request(`/api/workspaces/${encode(id)}/connectors/handoff-webhook/send`, 'POST', input),
  });
}
