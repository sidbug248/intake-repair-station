/** Bounded, declarative validation recipes. No expressions or executable patterns. */
export const CANONICAL_FIELDS = Object.freeze(['id', 'name', 'email', 'status', 'start_date']);
export const DEFAULT_STATUSES = Object.freeze(['pending', 'active', 'completed', 'on_hold', 'withdrawn']);
export const RULE_TYPES = Object.freeze(['required', 'unique', 'email', 'date', 'number', 'enum', 'min_length', 'max_length']);
export const RECIPE_STORAGE_KEY = 'intake-repair-recipes-v1';
export const DEFAULT_RECIPE = Object.freeze({ version: 1, name: 'Participant intake', requiredFields: CANONICAL_FIELDS, statuses: DEFAULT_STATUSES, rules: Object.freeze([]) });

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const keys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));
const label = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export function validateRecipe(input = DEFAULT_RECIPE, headers) {
  if (!record(input) || !keys(input, ['version', 'name', 'requiredFields', 'statuses', 'rules', 'columnMap']) || input.version !== 1
    || !label(input.name, 100)) throw new Error('A recipe needs version 1 and a name of up to 100 characters.');
  if (!Array.isArray(input.requiredFields) || input.requiredFields.length > CANONICAL_FIELDS.length
    || input.requiredFields.some(field => !CANONICAL_FIELDS.includes(field))
    || new Set(input.requiredFields).size !== input.requiredFields.length) throw new Error('Required fields must be a unique list of the supported field roles.');
  if (!Array.isArray(input.statuses) || input.statuses.length < 1 || input.statuses.length > 50
    || input.statuses.some(status => !label(status, 80) || status !== status.trim())
    || new Set(input.statuses.map(status => status.trim().toLowerCase().replace(/[\s-]+/g, '_'))).size !== input.statuses.length) throw new Error('Choose 1–50 distinct status values of up to 80 characters.');
  if (!Array.isArray(input.rules) || input.rules.length > 60) throw new Error('Use at most 60 validation rules per recipe.');
  const rules = input.rules.map((rule, index) => {
    if (!record(rule) || !keys(rule, ['column', 'type', 'values', 'min', 'max', 'length'])
      || !label(rule.column, 1024) || !RULE_TYPES.includes(rule.type)) throw new Error(`Recipe rule ${index + 1} is invalid.`);
    if (headers && !headers.includes(rule.column)) throw new Error(`The recipe column “${rule.column}” is missing from this file.`);
    const result = { column: rule.column, type: rule.type };
    if (rule.type === 'enum') {
      if (!Array.isArray(rule.values) || !rule.values.length || rule.values.length > 100
        || rule.values.some(value => !label(value, 300)) || new Set(rule.values).size !== rule.values.length) throw new Error('An allowed-values rule needs 1–100 distinct text values.');
      result.values = [...rule.values];
    } else if (own(rule, 'values')) throw new Error('Only an allowed-values rule may include values.');
    if (['min_length', 'max_length'].includes(rule.type)) {
      if (!Number.isInteger(rule.length) || rule.length < 0 || rule.length > 10000) throw new Error('A length limit must be an integer between 0 and 10,000.');
      result.length = rule.length;
    } else if (own(rule, 'length')) throw new Error('Only a length rule may include a length.');
    for (const bound of ['min', 'max']) {
      if (own(rule, bound)) {
        if (rule.type !== 'number' || !Number.isFinite(rule[bound])) throw new Error('Only a numeric rule may include finite minimum or maximum values.');
        result[bound] = rule[bound];
      }
    }
    if (result.min !== undefined && result.max !== undefined && result.min > result.max) throw new Error('The numeric minimum cannot exceed its maximum.');
    return result;
  });
  let columnMap;
  if (input.columnMap !== undefined) {
    if (!record(input.columnMap) || !keys(input.columnMap, CANONICAL_FIELDS)
      || Object.values(input.columnMap).some(value => typeof value !== 'string' || value.length > 1024)) throw new Error('A saved column mapping is invalid.');
    const assigned = Object.values(input.columnMap).filter(Boolean);
    if (new Set(assigned).size !== assigned.length) throw new Error('A saved mapping cannot assign the same column twice.');
    columnMap = Object.fromEntries(CANONICAL_FIELDS.map(field => [field, own(input.columnMap, field) ? input.columnMap[field] : '']));
  }
  return { version: 1, name: input.name.trim(), requiredFields: [...input.requiredFields], statuses: [...input.statuses], rules,
    ...(columnMap ? { columnMap } : {}) };
}

export function recipeFromDataset(dataset, name = dataset.recipe?.name ?? 'My import recipe') {
  return validateRecipe({ ...validateRecipe(dataset.recipe), name, columnMap: { ...dataset.columnMap } }, dataset.headers);
}

export function applyRecipeMapping(headers, input) {
  const recipe = validateRecipe(input);
  return Object.fromEntries(CANONICAL_FIELDS.map(field => {
    const saved = recipe.columnMap?.[field];
    return [field, saved && headers.includes(saved) ? saved : (headers.includes(field) ? field : '')];
  }));
}

export function exportRecipe(recipe) { return JSON.stringify(validateRecipe(recipe), null, 2); }

export function importRecipe(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > 100_000) throw new Error('Choose a recipe JSON file smaller than 100 KB.');
  let input;
  try { input = JSON.parse(text); } catch { throw new Error('The recipe file is not valid JSON.'); }
  return validateRecipe(input);
}

/** Call only after an explicit recipe-save action. No record data is stored. */
export function loadSavedRecipes(storage = globalThis.localStorage) {
  const raw = storage?.getItem(RECIPE_STORAGE_KEY);
  if (!raw) return [];
  if (raw.length > 500_000) throw new Error('Saved recipe storage exceeds its limit. Export or remove recipes.');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('Saved recipes are unreadable.'); }
  if (!Array.isArray(value) || value.length > 20) throw new Error('Recipe storage supports at most 20 recipes.');
  const result = value.map(recipe => validateRecipe(recipe));
  if (new Set(result.map(recipe => recipe.name)).size !== result.length) throw new Error('Saved recipe names must be distinct.');
  return result;
}

export function saveRecipe(input, storage = globalThis.localStorage) {
  if (!storage) throw new Error('Browser storage is unavailable. Export the recipe as JSON instead.');
  const recipe = validateRecipe(input);
  const recipes = loadSavedRecipes(storage).filter(existing => existing.name !== recipe.name);
  if (recipes.length >= 20) throw new Error('Keep at most 20 saved recipes; remove one before saving a new recipe.');
  recipes.push(recipe);
  const raw = JSON.stringify(recipes);
  if (raw.length > 500_000) throw new Error('Saved recipes exceed the storage limit. Export this recipe instead.');
  storage.setItem(RECIPE_STORAGE_KEY, raw);
  return recipes;
}

export function removeSavedRecipe(name, storage = globalThis.localStorage) {
  if (!storage) throw new Error('Browser storage is unavailable.');
  const recipes = loadSavedRecipes(storage).filter(recipe => recipe.name !== name);
  storage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(recipes));
  return recipes;
}
