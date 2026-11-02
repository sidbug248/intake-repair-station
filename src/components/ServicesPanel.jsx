import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, Database, Download, KeyRound, Link2, RefreshCw, Save, Trash2, Users } from 'lucide-react';
import { createCompanionClient } from '../lib/companion.mjs';

export default function ServicesPanel({ connection, onConnection, snapshot, remote, onRemote, onLoad, onBackup }) {
  const [address, setAddress] = useState('http://127.0.0.1:4317');
  const [token, setToken] = useState('');
  const [name, setName] = useState('My review workspace');
  const [workspaces, setWorkspaces] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [members, setMembers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [label, setLabel] = useState('');
  const [role, setRole] = useState('viewer');
  const [memberToken, setMemberToken] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [loadId, setLoadId] = useState(null);
  const [connector, setConnector] = useState(null);
  const [includeAssignments, setIncludeAssignments] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);
  const operation = useRef(0);
  const liveConnection = useRef(connection); liveConnection.current = connection;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current++; }; }, []);
  async function run(action) {
    const sequence = ++operation.current; const startedConnection = liveConnection.current;
    const active = () => mounted.current && sequence === operation.current && startedConnection === liveConnection.current;
    setBusy(true); setError(''); setNotice('');
    try { await action(active); }
    catch (problem) { if (active()) setError(problem.message + (problem.status === 409 ? ' Your local work is still intact. Save a backup, then reopen the stored version before deciding what to keep.' : '')); }
    finally { if (active()) setBusy(false); }
  }
  async function refresh(client = connection?.client, active = () => mounted.current) {
    if (!client) return;
    const [list, inbox] = await Promise.all([client.listWorkspaces(), client.listNotifications()]);
    if (active()) { setWorkspaces(list); setNotifications(inbox); }
  }
  useEffect(() => {
    setWorkspaces([]); setNotifications([]); setMembers([]); setActivity([]); setMemberToken(null); setConnector(null); setConfirmSend(false); setDeleteId(null); setLoadId(null);
    if (connection) run(active => refresh(connection.client, active));
    else { operation.current++; setBusy(false); }
  }, [connection]);
  useEffect(() => { setMembers([]); setActivity([]); setConnector(null); setConfirmSend(false); setMemberToken(null); }, [remote?.id, remote?.version]);
  async function connect() { await run(async active => { const client = createCompanionClient({ baseUrl: address.trim(), token: token.trim() }); const config = await client.config(); if (!active()) return; setToken(''); setNotice('Connected. No workspace has been uploaded or saved by connecting.'); onRemote(null); onConnection({ client, config, address: address.trim() }); }); }
  async function create() { await run(async active => { const saved = await connection.client.createWorkspace({ name, session: snapshot }); if (!active()) return; onRemote(saved); await refresh(connection.client, active); if (active()) setNotice('Workspace saved to the local companion database.'); }); }
  async function save() { await run(async active => { const saved = await connection.client.saveWorkspace(remote.id, { name: remote.name, session: snapshot, expectedVersion: remote.version }); if (!active()) return; onRemote(saved); await refresh(connection.client, active); if (active()) setNotice('Saved version ' + saved.version + '. Competing edits cannot silently overwrite a newer version.'); }); }
  async function load(id) { await run(async active => { const saved = await connection.client.getWorkspace(id); if (!active()) return; onLoad(saved.session); onRemote(saved); setLoadId(null); setNotice('Stored workspace opened. Save explicitly when your local review is ready.'); }); }
  async function remove(id) { await run(async active => { const item = workspaces.find(workspace => workspace.id === id); if (!item) throw new Error('Refresh the list before deleting this workspace.'); await connection.client.deleteWorkspace(id, { expectedVersion: item.version }); if (!active()) return; if (remote?.id === id) onRemote(null); setDeleteId(null); await refresh(connection.client, active); if (active()) setNotice('Stored workspace deleted. The currently open browser copy is unchanged.'); }); }
  async function inspectTeam() { await run(async active => { const [list, events] = await Promise.all([connection.client.listMembers(remote.id), connection.client.listActivity(remote.id)]); if (active()) { setMembers(list); setActivity(events); } }); }
  async function addMember() { await run(async active => { const result = await connection.client.createMemberToken(remote.id, { label, role }); if (!active()) return; setMemberToken(result); setLabel(''); const list = await connection.client.listMembers(remote.id); if (active()) { setMembers(list); setNotice('Access created. This token is shown once; it is not included in app exports.'); } }); }
  async function revoke(id) { await run(async active => { await connection.client.revokeMember(remote.id, id); const list = await connection.client.listMembers(remote.id); if (active()) { setMembers(list); if (memberToken?.id === id) setMemberToken(null); setNotice('Member access revoked.'); } }); }
  function downloadStored() { run(async active => { const saved = await connection.client.getWorkspace(remote.id); if (!active()) return; const url = URL.createObjectURL(new Blob([JSON.stringify(saved.session, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'stored-workspace-session.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }); }
  return <>
    <section className="ir-panel ir-tool-panel">
      <div className="ir-section-head"><div><p className="ir-eyebrow">OPTIONAL LOCAL COMPANION</p><h2>A home for ongoing work.</h2></div><span className={'ir-pill ' + (connection ? 'green' : '')}>{connection ? 'Connected locally' : 'Not connected'}</span></div>
      <p>Keep named workspaces on this computer, use your own AI provider, or give another reviewer scoped access. The main review app remains independent and works offline.</p>
      {error && <div className="ir-inline-error" role="alert">{error}</div>}{notice && <p className="ir-tool-message" role="status">{notice}</p>}
      {!connection ? <>
        <details className="ir-setup" open><summary>Start the companion</summary><ol><li>In the project folder, install dependencies with <code>npm ci</code>.</li><li>Optionally copy <code>.env.example</code> to <code>.env</code> and configure a supported provider or local model.</li><li>Run <code>npm run companion</code>. Its startup message gives the local token-file location.</li><li>Read that token on your computer and connect below. The access token stays in this tab’s memory.</li></ol><p>Use <code>npm run dev</code> for the app. For the standalone HTML, enable <code>INTAKE_ALLOW_FILE_ORIGIN=1</code> in the companion configuration. Full instructions are in <code>docs/LOCAL_SERVICES.md</code>.</p></details>
        <form onSubmit={e => { e.preventDefault(); connect(); }}><div className="ir-form-grid"><label><span>Companion address</span><input type="url" required value={address} onChange={e => setAddress(e.target.value)}/></label><label><span>Companion access token</span><input type="password" required autoComplete="off" spellCheck={false} value={token} onChange={e => setToken(e.target.value)} placeholder="Local owner or member token"/></label></div><button className="ir-button primary" type="submit" disabled={busy}><Link2 size={16}/>{busy ? 'Connecting…' : 'Connect locally'}</button></form>
      </> : <div className="ir-connected"><p><strong>{connection.config.actor.label}</strong> · {connection.address}<br/>Workspace saves, AI requests, and connector deliveries happen only after your explicit action.</p><button className="ir-button secondary" disabled={busy} onClick={() => { setToken(''); onConnection(null); onRemote(null); setWorkspaces([]); setNotifications([]); setMembers([]); setActivity([]); setMemberToken(null); setConnector(null); }}>Disconnect and forget access</button></div>}
    </section>
    {connection && <>
      <section className="ir-panel ir-tool-panel">
        <div className="ir-section-head"><div><h2><Database size={22}/> Saved workspaces</h2><p>Saving is explicit. Your open browser session and stored version are separate until you save.</p></div><button className="ir-button secondary" disabled={busy} onClick={() => run(active => refresh(connection.client, active))}><RefreshCw size={15}/>Refresh list</button></div>
        {snapshot && connection.config.actor.isOwner && <div className="ir-save-workspace"><label><span>Name a new saved workspace</span><input value={name} maxLength={120} onChange={e => setName(e.target.value)}/></label><button className="ir-button primary" disabled={busy || !name.trim()} onClick={create}><Save size={15}/>Save as new workspace</button></div>}
        {!snapshot && <p className="ir-tool-message">Import a file or restore a session to create a saved workspace.</p>}
        {remote && <div className="ir-remote-current"><strong>Connected to {remote.name} · version {remote.version} · {remote.role}</strong><div className="ir-tool-actions"><button className="ir-button primary" disabled={busy || !snapshot || remote.role === 'viewer'} onClick={save}><Save size={15}/>Save current review</button><button className="ir-button secondary" disabled={busy} onClick={downloadStored}><Download size={15}/>Export stored version</button><button className="ir-button secondary" disabled={busy} onClick={inspectTeam}><Users size={15}/>Access & stored activity</button><button className="ir-text-button" disabled={busy} onClick={() => onRemote(null)}>Detach this browser copy</button></div><p className="ir-form-note">Unsaved browser changes do not appear in the stored export or connector preview.</p></div>}
        <ul className="ir-workspace-list">{workspaces.map(item => <li key={item.id}><div><strong>{item.name}</strong><small>Version {item.version} · {item.role} · {new Date(item.updatedAt).toLocaleString()}</small></div><div className="ir-tool-actions"><button className="ir-button secondary" disabled={busy} onClick={() => snapshot ? setLoadId(item.id) : load(item.id)}>Open</button>{item.role === 'owner' && <button className="ir-icon-button" aria-label={'Delete stored workspace ' + item.name} disabled={busy} onClick={() => setDeleteId(item.id)}><Trash2 size={16}/></button>}</div>
          {loadId === item.id && <div className="ir-inline-confirm"><p>Opening this stored version replaces the current browser review. Save a backup if you need to keep it.</p><button className="ir-button secondary" onClick={onBackup}>Back up current review</button><button className="ir-button primary" disabled={busy} onClick={() => load(item.id)}>Open stored version</button><button className="ir-text-button" onClick={() => setLoadId(null)}>Cancel</button></div>}
          {deleteId === item.id && <div className="ir-inline-confirm"><p>Delete this stored workspace and its access identities? Export it first if you need a copy. Your open browser review is kept.</p><button className="ir-button secondary" disabled={busy} onClick={() => remove(item.id)}>Delete stored copy</button><button className="ir-text-button" onClick={() => setDeleteId(null)}>Keep it</button></div>}
        </li>)}</ul>{!workspaces.length && <p>No stored workspaces yet.</p>}
      </section>
      {remote && <section className="ir-panel ir-tool-panel"><h2><Users size={22}/> Review access</h2><p>Revocable tokens identify local reviewers and enforce owner, editor, or viewer access. This is a local service; public signup, email delivery, and cross-device cloud hosting are not enabled.</p>
        {remote.role === 'owner' && <><div className="ir-form-grid"><label><span>Reviewer label</span><input value={label} maxLength={100} onChange={e => setLabel(e.target.value)} placeholder="Name shown in stored activity"/></label><label><span>Access role</span><select value={role} onChange={e => setRole(e.target.value)}><option value="viewer">Viewer · read and export</option><option value="editor">Editor · read, save, and export</option></select></label></div><button className="ir-button secondary" disabled={busy || !label.trim()} onClick={addMember}><KeyRound size={15}/>Create workspace access token</button></>}
        {memberToken && <div className="ir-token-reveal"><strong>One-time token for {memberToken.label}</strong><p>Give this only to the intended reviewer through your own secure channel. It grants {memberToken.role} access to this workspace.</p><input aria-label="New member access token" type="text" autoComplete="off" spellCheck={false} readOnly value={memberToken.token}/><button className="ir-text-button" onClick={() => setMemberToken(null)}>Hide token</button></div>}
        {!!members.length && <ul className="ir-rule-list">{members.map(member => <li key={member.id}><span>{member.label} · {member.role}</span>{remote.role === 'owner' && member.role !== 'owner' && <button className="ir-text-button" disabled={busy} onClick={() => revoke(member.id)}>Revoke access</button>}</li>)}</ul>}
        {!!activity.length && <><h3>Stored activity</h3><ol className="ir-stored-events">{activity.slice(0, 30).map((event, i) => <li key={event.id || i}><strong>{event.actorLabel || event.actor || event.label || 'Reviewer'}</strong> · {event.detail || event.type}<small>{new Date(event.createdAt || event.at).toLocaleString()}</small></li>)}</ol></>}
      </section>}
      <section className="ir-panel ir-tool-panel"><div className="ir-section-head"><h2><Bell size={22}/> Reviewer inbox</h2><button className="ir-text-button" disabled={busy} onClick={() => run(active => refresh(connection.client, active))}>Refresh</button></div><p>Stored workspace updates appear here for other access identities. These are in-app notifications, not emails.</p>{notifications.length ? <ul className="ir-rule-list">{notifications.map(item => <li key={item.id}><div><strong>{item.workspaceName}</strong><p>{item.detail}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div>{!item.readAt && <button className="ir-text-button" disabled={busy} onClick={() => run(async active => { await connection.client.markNotificationRead(item.id); await refresh(connection.client, active); })}>Mark read</button>}</li>)}</ul> : <p>No updates for this identity.</p>}</section>
      {remote && <section className="ir-panel ir-tool-panel"><h2><Link2 size={22}/> Handoff connector</h2><p>Preview a summary of the stored workspace before sending it to an HTTPS webhook configured in your companion. Raw participant rows are excluded.</p>{!connection.config.connectors.length ? <p className="ir-tool-message">No destination configured. Set the optional webhook URL and secret in the companion environment, then reconnect.</p> : <><label className="ir-inline-check"><input type="checkbox" disabled={busy} checked={includeAssignments} onChange={e => { setIncludeAssignments(e.target.checked); setConnector(null); setConfirmSend(false); }}/>Include entered owner and next-action text</label><button className="ir-button secondary" disabled={busy || remote.role === 'viewer'} onClick={() => run(async active => { const preview = await connection.client.previewConnector(remote.id, { includeAssignments }); if (active()) { setConnector(preview); setConfirmSend(false); } })}>Preview connector payload</button>{connector && <div className="ir-data-scope"><p><strong>Destination:</strong> {connector.connector?.destination || connector.connector?.url || connection.config.connectors[0].destination}</p><pre>{JSON.stringify(connector.payload, null, 2)}</pre><label className="ir-inline-check"><input type="checkbox" disabled={busy} checked={confirmSend} onChange={e => setConfirmSend(e.target.checked)}/>Send this displayed payload to the configured destination.</label><button className="ir-button primary" disabled={busy || !confirmSend || remote.role === 'viewer'} onClick={() => run(async active => { await connection.client.sendConnector(remote.id, { expectedVersion: connector.payload.workspace.revision, confirm: true, includeAssignments: connector.payload.includesAssignments }); if (active()) { setConnector(null); setConfirmSend(false); setNotice('The configured destination accepted the request. This does not prove any downstream action completed.'); } })}>Send reviewed handoff<ArrowRight size={15}/></button></div>}</>}</section>}
    </>}
  </>;
}
