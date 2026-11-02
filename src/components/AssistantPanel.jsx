import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Download, Sparkles } from 'lucide-react';
import { REQUIRED_COLUMNS, inspectDataset } from '../lib/intake.mjs';
import { aiRevision, mappingContext, rulesContext, handoffContext, selectedRowContext, assertAIRevision, validateAIResult } from '../lib/ai.mjs';

const tasks = { mapping: 'Suggest column matches', rules: 'Draft validation rules', handoff: 'Draft handoff summary', explain: 'Explain a record’s issues', next_action: 'Draft a next action', duplicates: 'Compare possible duplicates' };
export default function AssistantPanel({ connection, dataset, changes, coordination, importPreview, recipe, snapshot, onMapping, onRules, onNextAction, onConnect }) {
  const [task, setTask] = useState(importPreview ? 'mapping' : 'handoff');
  const [provider, setProvider] = useState(connection?.config.providers[0]?.id || '');
  const [model, setModel] = useState('');
  const [rowKeys, setRowKeys] = useState([]);
  const [includeValues, setIncludeValues] = useState(false);
  const [requirement, setRequirement] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const rows = useMemo(() => dataset ? inspectDataset(dataset, changes).rows : [], [dataset, changes]);
  const providerInfo = connection?.config.providers.find(item => item.id === provider);
  useEffect(() => {
    if (!connection?.config.providers.some(item => item.id === provider)) setProvider(connection?.config.providers[0]?.id || '');
    setResponse(null); setConsent(false);
  }, [connection]);
  useEffect(() => { setModel(providerInfo?.models?.[0] || ''); setConsent(false); }, [providerInfo]);
  const context = useMemo(() => {
    if (task === 'mapping') { const headers = importPreview?.headers || dataset?.headers; return headers ? mappingContext(headers, REQUIRED_COLUMNS.map(key => ({ key, label: key.replaceAll('_', ' '), required: (recipe?.requiredFields || REQUIRED_COLUMNS).includes(key) }))) : null; }
    if (task === 'rules') { const headers = importPreview?.headers || dataset?.headers; return headers && requirement.trim() ? rulesContext(headers, requirement.trim()) : null; }
    if (task === 'handoff') return dataset ? handoffContext(dataset, changes, coordination) : null;
    const selected = rows.filter(row => rowKeys.includes(row.key));
    if (task === 'duplicates') return selected.length >= 2 ? { rows: selected.map(row => ({ rowKey: row.key, values: dataset.headers.map((field, index) => ({ field, value: row.values[index] ?? '' })) })) } : null;
    return selected[0] ? selectedRowContext(selected[0], dataset.headers, { includeValues }) : null;
  }, [task, dataset, changes, coordination, importPreview, recipe, rows, rowKeys, includeValues, requirement]);
  const identity = connection ? `${connection.address}:${connection.config.actor.id}` : '';
  const state = useMemo(() => ({ snapshot, task, context, provider, model, identity }), [snapshot, task, context, provider, model, identity]);
  const current = useRef(state); current.current = state;
  useEffect(() => { setConsent(false); }, [context, provider, model, identity]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function checkCurrent(result) {
    const checked = current.current;
    const revision = await aiRevision(checked);
    if (!mounted.current || checked !== current.current) throw new Error('The selection changed while the suggestion was being checked. Review the current selection and try again.');
    assertAIRevision(result, revision);
  }
  async function request() {
    if (!connection || connection.config.actor.canUseAI === false || !context || !consent) return;
    setBusy(true); setConsent(false); setError(''); setNotice(''); setResponse(null);
    try {
      const originalState = current.current;
      const revision = await aiRevision(originalState);
      const requestInput = { task, revision, context, provider, model };
      const result = await connection.client.runAI(requestInput);
      if (result.task !== task || result.provider !== provider || result.model !== model || result.reviewState !== 'pending') throw new Error('The companion returned a result for a different task or model. Nothing was applied.');
      const validatedResult = validateAIResult(requestInput, task === 'handoff' ? { highlightFactIds: result.result?.highlightFactIds } : result.result);
      await checkCurrent(result);
      setResponse({ ...result, result: validatedResult });
    } catch (problem) { if (mounted.current) setError(problem.message); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function useResult(action) {
    try { await checkCurrent(response); action(response.result); setError(''); }
    catch (problem) { if (mounted.current) setError(problem.message); }
  }
  function downloadSummary(result) {
    const text = result.summary + '\n\nPrepared from this workspace’s supplied facts. Review before sharing.\nProvider: ' + response.provider + ' · Model: ' + response.model + '\n';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'handoff-summary.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Summary prepared for download. Your source records and corrections are unchanged.');
  }
  if (!connection) return <section className="ir-panel ir-tool-panel ir-ai-intro"><Sparkles size={30}/><h2>An optional second pair of eyes.</h2><p>Get help matching columns, explaining issues, drafting next actions, and preparing a handoff. Use your own provider credits or a model running on your machine.</p><p>The local companion keeps provider keys out of the app, your session backups, and the repository. The complete review workflow works without AI.</p><button className="ir-button primary" onClick={onConnect}>Set up local companion<ArrowRight size={16}/></button></section>;
  return <>
    <section className="ir-panel ir-tool-panel">
      <div className="ir-section-head"><div><p className="ir-eyebrow">OPTIONAL ASSISTANCE · HUMAN DECISIONS</p><h2>Help with the next useful step.</h2></div><span className="ir-pill blue">{response?.usage?.requests ?? connection.config.usage?.requests ?? 0} requests used today</span></div>
      {!connection.config.providers.length && <p className="ir-tool-message">No model provider is configured yet. Follow LOCAL_SERVICES.md to add provider credentials or a local Ollama model to the companion, then reconnect.</p>}
      {connection.config.actor.canUseAI === false && <p className="ir-tool-message">This viewer token can read and export its workspace. Owner or editor access is required to use the companion’s AI allowance.</p>}
      <div className="ir-form-grid">
        <label><span>What would help?</span><select value={task} onChange={e => { setTask(e.target.value); setResponse(null); setRowKeys([]); }}>{Object.entries(tasks).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label><span>Provider</span><select value={provider} onChange={e => { setProvider(e.target.value); setResponse(null); }}><option value="">Choose a configured provider</option>{connection.config.providers.map(item => <option key={item.id} value={item.id}>{item.id}{item.local ? ' · local runtime' : ' · remote API'}</option>)}</select></label>
        <label><span>Model</span><select value={model} onChange={e => setModel(e.target.value)}><option value="">Choose a configured model</option>{providerInfo?.models.map(item => <option key={item}>{item}</option>)}</select></label>
      </div>
      {task === 'rules' && <label className="ir-block-label"><span>What should these columns require?</span><textarea rows={3} maxLength={2000} value={requirement} onChange={e => { setRequirement(e.target.value); setResponse(null); }} placeholder="For example: require the email column, make IDs unique, and limit notes to 500 characters."/><span className="ir-form-note">Use the column names in your file. Proposed rules can check required values, uniqueness, email/date/number formats, allowed values, and length limits.</span></label>}
      {['explain', 'next_action', 'duplicates'].includes(task) && <div className="ir-ai-row-choice">
        <label className="ir-block-label"><span>{task === 'duplicates' ? 'Choose two to eight records (use Ctrl/Cmd to select)' : 'Choose a record with an unresolved issue'}</span><select multiple={task === 'duplicates'} size={task === 'duplicates' ? 6 : undefined} value={task === 'duplicates' ? rowKeys : rowKeys[0] || ''} onChange={e => { const selected = [...e.target.selectedOptions].map(option => option.value).filter(Boolean); setRowKeys(selected.slice(0, task === 'duplicates' ? 8 : 1)); setResponse(null); }}>{task !== 'duplicates' && <option value="">Choose a record</option>}{rows.filter(row => task === 'duplicates' || row.issues.length).map(row => <option key={row.key} value={row.key}>Source line {row.sourceLine} · {row.values[dataset.headers.indexOf(dataset.columnMap?.name)] || row.values[0] || row.key}</option>)}</select></label>
        {task !== 'duplicates' && <label className="ir-inline-check"><input type="checkbox" checked={includeValues} onChange={e => { setIncludeValues(e.target.checked); setResponse(null); }}/>Include this record’s values as well as its issue descriptions</label>}
      </div>}
      <div className="ir-data-scope"><h3>Review what will be sent.</h3><p>{providerInfo?.local ? 'Destination: your local Ollama runtime. Disable its cloud features for local-only inference, as described in the setup guide.' : 'Destination: ' + (providerInfo?.destination || 'choose a provider') + '. Selected content leaves this device for remote inference.'}</p><p>{task === 'mapping' ? 'Headers and field definitions only. No participant rows.' : task === 'rules' ? 'Headers and your written requirement only. No participant rows are added.' : task === 'handoff' ? 'Verified counts, issue categories, and entered follow-up text. Owner names or personal details in follow-ups may be included.' : task === 'duplicates' ? 'Values from the selected records. Evidence is checked against these values.' : includeValues ? 'The selected record’s values and issue descriptions.' : 'Up to 30 issue descriptions for the selected record; no separate source-value list.'}</p><details><summary>Inspect the exact request data</summary><pre>{context ? JSON.stringify(context, null, 2) : 'Load a file or select the required records first.'}</pre></details></div>
      <label className="ir-inline-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={!context || !provider}/>Use this displayed data for this AI request{providerInfo?.local ? '' : ' with the selected remote provider'}.</label>
      <div className="ir-tool-actions"><button className="ir-button primary" disabled={busy || connection.config.actor.canUseAI === false || !consent || !context || !provider || !model} onClick={request}><Sparkles size={16}/>{busy ? 'Preparing a suggestion…' : tasks[task]}</button><span className="ir-form-note">Suggestions never approve edits, merge records, or send messages.</span></div>
      {error && <div className="ir-inline-error" role="alert">{error}</div>}
      {notice && <p className="ir-tool-message" role="status">{notice}</p>}
    </section>
    {response && <section className="ir-panel ir-tool-panel ir-ai-result" aria-live="polite"><p className="ir-eyebrow">REVIEW THIS SUGGESTION</p><h2>{tasks[response.task]}</h2><p className="ir-form-note">{response.provider} · {response.model} · {new Date(response.createdAt).toLocaleString()}</p>
      {response.task === 'mapping' && <><ul className="ir-rule-list">{response.result.mappings.map(item => <li key={item.field}><div><strong>{item.field} → {item.header || 'No confident match'}</strong><p>{item.reason}</p></div></li>)}</ul><button className="ir-button primary" onClick={() => useResult(result => { onMapping(Object.fromEntries(result.mappings.map(item => [item.field, item.header || '']))); setNotice('Suggested matches copied to the import screen for your confirmation.'); })}>Use these matches in the import screen<ArrowRight size={15}/></button></>}
      {response.task === 'rules' && <><p>{response.result.explanation}</p><ul className="ir-rule-list">{response.result.rules.map((rule, index) => <li key={index}><div><strong>{rule.column} · {rule.type.replaceAll('_', ' ')}</strong><p>{rule.values ? 'Allowed: ' + rule.values.join(', ') : rule.length !== undefined ? 'Length: ' + rule.length : rule.type === 'number' ? 'Bounds: ' + (rule.min ?? 'no minimum') + ' to ' + (rule.max ?? 'no maximum') : 'Apply this check to the selected column.'}</p></div></li>)}</ul><button className="ir-button primary" disabled={!response.result.rules.length || !onRules} onClick={() => useResult(result => onRules(result.rules, { provider: response.provider, model: response.model, id: response.id }))}>Use proposed rules in recipe editor<ArrowRight size={15}/></button><p className="ir-form-note">The recipe editor gives you a second review before applying rules to the workspace.</p></>}
      {response.task === 'handoff' && <><pre className="ir-summary-text">{response.result.summary}</pre><button className="ir-button secondary" onClick={() => useResult(downloadSummary)}><Download size={15}/>Download reviewed summary</button></>}
      {['explain', 'next_action'].includes(response.task) && <><p>{response.result.explanation}</p><blockquote>{response.result.nextAction}</blockquote><p className="ir-form-note">Issue references: {response.result.evidenceRefs.join(', ')}</p><button className="ir-button primary" onClick={() => useResult(result => onNextAction(rowKeys[0], result.nextAction, { provider: response.provider, model: response.model, id: response.id }))}>Use as a next-action draft<ArrowRight size={15}/></button></>}
      {response.task === 'duplicates' && <><span className="ir-pill gold">{response.result.assessment.replaceAll('_', ' ')}</span><p>{response.result.reason}</p><blockquote>{response.result.nextAction}</blockquote><ul>{response.result.evidence.map((item, i) => <li key={i}>{item.rowKey} · {item.field}: {item.value}</li>)}</ul><p className="ir-form-note">This assessment is not identity verification. No records have been merged or deleted.</p></>}
    </section>}
  </>;
}
