import { useRef, useState } from 'react';
import { Download, Plus, Save, Trash2, Upload, RotateCcw } from 'lucide-react';
import { DEFAULT_RECIPE, CANONICAL_FIELDS, RULE_TYPES, validateRecipe, loadSavedRecipes, saveRecipe, removeSavedRecipe, exportRecipe, importRecipe, applyRecipeMapping } from '../lib/recipes.mjs';

const labels = { id: 'ID', name: 'Name', email: 'Email', status: 'Status', start_date: 'Start date' };
const ruleLabels = { required: 'Must be present', unique: 'Must be unique', email: 'Email format', date: 'ISO calendar date', number: 'Number / range', enum: 'Allowed values', min_length: 'Minimum length', max_length: 'Maximum length' };
function download(text, name) { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

export default function RecipeEditor({ recipe, onChange, headers = [], columnMap = {}, onMapping, onApply, hasDataset }) {
  const [saved, setSaved] = useState(() => { try { return loadSavedRecipes(); } catch { return []; } });
  const [selected, setSelected] = useState('');
  const [rule, setRule] = useState({ column: '', type: 'required', values: '', min: '', max: '', length: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const run = action => { try { action(); setError(''); } catch (problem) { setError(problem.message); } };
  const cleanRecipe = () => validateRecipe({ ...recipe, columnMap });
  const useSaved = value => run(() => {
    const next = value ? saved.find(item => item.name === value) : structuredClone(DEFAULT_RECIPE);
    if (!next) return;
    onChange(structuredClone(next)); setSelected(value);
    if (headers.length) onMapping(applyRecipeMapping(headers, next));
    setMessage('Recipe loaded for the next import. Apply explicitly to change the current workspace.');
  });
  function addRule() {
    run(() => {
      const next = { column: rule.column, type: rule.type };
      if (rule.type === 'enum') next.values = rule.values.split(',').map(value => value.trim()).filter(Boolean);
      if (rule.type === 'number') { if (rule.min !== '') next.min = Number(rule.min); if (rule.max !== '') next.max = Number(rule.max); }
      if (rule.type.endsWith('_length')) next.length = Number(rule.length);
      const checked = validateRecipe({ ...recipe, rules: [...recipe.rules, next] }, headers.length ? headers : undefined);
      onChange(checked); setMessage('Rule added to this recipe.');
    });
  }
  async function read(file) {
    if (!file) return;
    try { if (file.size > 100_000) throw new Error('Choose a recipe smaller than 100 KB.'); const next = importRecipe(await file.text()); onChange(next); if (headers.length) onMapping(applyRecipeMapping(headers, next)); setError(''); setMessage('Recipe imported. Save it here to reuse on this device.'); }
    catch (problem) { setError(problem.message); }
  }
  return <section className="ir-panel ir-tool-panel" aria-labelledby="recipe-title">
    <div className="ir-section-head"><div><p className="ir-eyebrow">REUSABLE REVIEW RULES</p><h2 id="recipe-title">Your data. Your recipe.</h2></div><span className="ir-pill blue">No record data saved in recipes</span></div>
    <p>Save column matches, choose required fields, and add checks for any source column. Rules flag issues; they never invent values or approve a correction.</p>
    {error && <div className="ir-inline-error" role="alert">{error}</div>}
    {message && <p className="ir-tool-message" role="status">{message}</p>}
    <div className="ir-form-grid">
      <label><span>Recipe name</span><input maxLength={100} value={recipe.name} onChange={e => onChange({ ...recipe, name: e.target.value })}/></label>
      <label><span>Saved recipes on this device</span><select value={selected} onChange={e => useSaved(e.target.value)}><option value="">Participant intake (default)</option>{saved.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
    </div>
    <fieldset className="ir-fieldset"><legend>Required field roles</legend><div className="ir-checkbox-row">{CANONICAL_FIELDS.map(field => <label key={field}><input type="checkbox" checked={recipe.requiredFields.includes(field)} onChange={e => onChange({ ...recipe, requiredFields: e.target.checked ? [...recipe.requiredFields, field] : recipe.requiredFields.filter(item => item !== field) })}/>{labels[field]}</label>)}</div><p>Unchecked roles can be left unmapped. Add source-column rules below for other kinds of lists.</p></fieldset>
    <label className="ir-block-label"><span>Allowed statuses, separated by commas</span><textarea rows={2} value={recipe.statuses.join(', ')} onChange={e => onChange({ ...recipe, statuses: e.target.value.split(',').map(value => value.trim()) })}/></label>
    <fieldset className="ir-fieldset"><legend>Additional column rules</legend>
      <div className="ir-rule-builder">
        <label><span>Source column</span>{headers.length ? <select value={rule.column} onChange={e => setRule({ ...rule, column: e.target.value })}><option value="">Choose a column</option>{headers.map(header => <option key={header}>{header}</option>)}</select> : <input value={rule.column} placeholder="Exact column heading" onChange={e => setRule({ ...rule, column: e.target.value })}/>}</label>
        <label><span>Check</span><select value={rule.type} onChange={e => setRule({ ...rule, type: e.target.value })}>{RULE_TYPES.map(type => <option key={type} value={type}>{ruleLabels[type]}</option>)}</select></label>
        {rule.type === 'enum' && <label><span>Allowed values (comma separated)</span><input value={rule.values} onChange={e => setRule({ ...rule, values: e.target.value })}/></label>}
        {rule.type === 'number' && <><label><span>Minimum (optional)</span><input type="number" value={rule.min} onChange={e => setRule({ ...rule, min: e.target.value })}/></label><label><span>Maximum (optional)</span><input type="number" value={rule.max} onChange={e => setRule({ ...rule, max: e.target.value })}/></label></>}
        {rule.type.endsWith('_length') && <label><span>Length</span><input type="number" min="0" max="10000" value={rule.length} onChange={e => setRule({ ...rule, length: e.target.value })}/></label>}
        <button className="ir-button secondary" onClick={addRule}><Plus size={15}/>Add rule</button>
      </div>
      {!!recipe.rules.length && <ul className="ir-rule-list">{recipe.rules.map((item, index) => <li key={index}><span><strong>{item.column}</strong> · {ruleLabels[item.type]}{item.values && ': ' + item.values.join(', ')}{item.length !== undefined && ': ' + item.length}{item.min !== undefined && ' ≥ ' + item.min}{item.max !== undefined && ' ≤ ' + item.max}</span><button className="ir-icon-button" aria-label={'Remove rule ' + (index + 1)} onClick={() => onChange({ ...recipe, rules: recipe.rules.filter((_, i) => i !== index) })}><Trash2 size={15}/></button></li>)}</ul>}
    </fieldset>
    <div className="ir-tool-actions">
      <button className="ir-button primary" onClick={() => run(() => { const next = cleanRecipe(); setSaved(saveRecipe(next)); setSelected(next.name); setMessage('Recipe saved on this device. It contains rules and headings, not participant records.'); })}><Save size={15}/>Save recipe on device</button>
      <button className="ir-button secondary" onClick={() => run(() => download(exportRecipe(cleanRecipe()), 'intake-recipe.json'))}><Download size={15}/>Export recipe</button>
      <button className="ir-button secondary" onClick={() => fileRef.current.click()}><Upload size={15}/>Import recipe</button>
      <button className="ir-button secondary" onClick={() => useSaved('')}><RotateCcw size={15}/>Reset recipe</button>
      {selected && <button className="ir-text-button" onClick={() => run(() => { setSaved(removeSavedRecipe(selected)); setSelected(''); setMessage('Saved recipe removed from this device.'); })}>Remove saved recipe</button>}
      {hasDataset && <button className="ir-button secondary" onClick={() => run(() => { onApply(validateRecipe(recipe)); setMessage('Rules applied to the current workspace. Review the updated issue counts.'); })}>Apply rules to current workspace</button>}
    </div>
    <input ref={fileRef} type="file" accept=".json,application/json" hidden tabIndex={-1} aria-label="Import recipe JSON" onChange={e => { read(e.target.files?.[0]); e.target.value = ''; }}/>
  </section>;
}
