import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataset, EXAMPLE_CSV, inspectDataset } from '../src/lib/intake.mjs';
import { mappingContext, rulesContext, handoffContext, selectedRowContext, validateAIRequest, validateAIResult, assertAIRevision, aiRevision } from '../src/lib/ai.mjs';
import { providersFromEnv, publicProviderConfig, runProviderRequest } from '../server/providers.mjs';

const mapping = () => ({ task: 'mapping', revision: 'revision-1', context: mappingContext(['id', 'name', 'email', 'status', 'start_date']) });
const mappingResult = () => ({ mappings: mapping().context.fields.map(field => ({ field: field.key, header: field.key, reason: 'The exact header matches.' })) });
const response = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('mapping scope accepts headers only and rejects unknown or reused model columns', () => {
  assert.deepEqual(validateAIRequest(mapping()), mapping());
  assert.throws(() => validateAIRequest({ ...mapping(), context: { ...mapping().context, raw: 'contact records' } }), /only headers/);
  const unknown = mappingResult(); unknown.mappings[0].header = 'hallucinated';
  assert.throws(() => validateAIResult(mapping(), unknown), /unknown or reused/);
  const duplicate = mappingResult(); duplicate.mappings[0].header = 'name';
  assert.throws(() => validateAIResult(mapping(), duplicate), /unknown or reused/);
  const uncertain = mappingResult(); uncertain.mappings[0].header = null;
  assert.equal(validateAIResult(mapping(), uncertain).mappings[0].header, null);
});

test('handoff uses approved review state and renders only supplied facts', () => {
  const dataset = createDataset(EXAMPLE_CSV);
  const context = handoffContext(dataset, {}, { assignments: {} });
  const request = { task: 'handoff', revision: 'r1', context };
  assert.equal(context.totals.ready + context.totals.exceptions, 12);
  assert.equal(JSON.stringify(context).includes('@example.com'), false);
  const result = validateAIResult(request, { highlightFactIds: ['count-ready', 'issue-duplicate_id'] });
  assert.match(result.summary, /12 records retained/);
  assert.match(result.summary, /Duplicate ID: 2 affected records/);
  assert.throws(() => validateAIResult(request, { highlightFactIds: ['invented-outreach'] }), /not in this workspace/);
  assert.throws(() => validateAIResult(request, { highlightFactIds: ['count-ready'], summary: 'Everyone was called.' }), /not in this workspace/);
});

test('plain-language rules remain declarative, refer to real headers, and reject code or invalid bounds', () => {
  const request = { task: 'rules', revision: 'rules-v1', context: rulesContext(['id', 'email', 'age', 'notes'], 'Require email and make age a number between 18 and 120.') };
  const result = { explanation: 'These checks express the requested validation.', rules: [{ column: 'email', type: 'required' }, { column: 'age', type: 'number', min: 18, max: 120 }] };
  assert.deepEqual(validateAIResult(request, result), result);
  assert.equal(request.context.rows, undefined);
  const invalidRules = [
    { column: 'unknown', type: 'required' },
    { column: 'notes', type: 'regex', pattern: '.*' },
    { column: 'notes', type: 'required', code: 'fetch(secret)' },
    { column: 'age', type: 'number', min: 120, max: 18 },
    { column: 'notes', type: 'max_length', length: -1 },
    { column: 'notes', type: 'enum', values: [] },
  ];
  for (const rule of invalidRules) assert.throws(() => validateAIResult(request, { explanation: 'Invalid suggestion.', rules: [rule] }), /unknown column, unsupported operation, or invalid/);
  assert.throws(() => validateAIRequest({ ...request, context: { ...request.context, rows: ['private data'] } }), /headers and a plain-language/);
  assert.deepEqual(validateAIResult(request, { explanation: 'That request needs a check outside the supported rule vocabulary.', rules: [] }).rules, []);
});

test('row explanations require issue references and do not silently include cell values', () => {
  const dataset = createDataset(EXAMPLE_CSV);
  const row = inspectDataset(dataset).exceptions[0];
  const context = selectedRowContext(row, dataset.headers);
  assert.equal(context.values, undefined);
  const request = { task: 'explain', revision: 'r2', context };
  assert.throws(() => validateAIResult(request, { explanation: 'Check the source.', nextAction: 'Confirm the source value.', evidenceRefs: ['unknown'] }), /valid issue references/);
  const result = validateAIResult(request, { explanation: 'Check the source.', nextAction: 'Confirm the source value.', evidenceRefs: [context.issues[0].id] });
  assert.equal(result.nextAction, 'Confirm the source value.');
});

test('large handoff context stays bounded and discloses omitted follow-up details', () => {
  const raw = 'id,name,email,status,start_date\n' + Array.from({ length: 60 }, (_, index) => `ID-${index},Person ${index},person${index}@example.com,active,2026-11-01`).join('\n');
  const dataset = createDataset(raw);
  const assignments = Object.fromEntries(dataset.rows.map(row => [row.key, { owner: 'Coordinator', action: '🚀'.repeat(1000), status: 'waiting', dueDate: '' }]));
  const context = handoffContext(dataset, {}, { assignments });
  assert.equal(context.totals.records, 60);
  assert.ok(context.facts.length <= 100);
  assert.ok(new TextEncoder().encode(JSON.stringify(context)).length <= 48_000);
  assert.ok(context.facts.some(fact => fact.id === 'scope-omissions'));
  const request = { task: 'handoff', revision: 'r-large', context };
  assert.doesNotThrow(() => validateAIRequest(request));
  const result = validateAIResult(request, { highlightFactIds: ['count-total'] });
  assert.match(result.summary, /This AI selection omits/);
});

test('duplicate assessment must quote actual selected values and cannot return a merge operation', () => {
  const request = { task: 'duplicates', revision: 'r3', context: { rows: [
    { rowKey: 'row-1', values: [{ field: 'id', value: 'same-id' }] },
    { rowKey: 'row-2', values: [{ field: 'id', value: 'same-id' }] },
  ] } };
  const result = { assessment: 'uncertain', reason: 'The ID matches but identity is unconfirmed.', nextAction: 'Confirm both source records.', evidence: [{ rowKey: 'row-1', field: 'id', value: 'same-id' }] };
  assert.deepEqual(validateAIResult(request, result), result);
  assert.throws(() => validateAIResult(request, { ...result, merge: true }), /unsupported/);
  assert.throws(() => validateAIResult(request, { ...result, evidence: [{ rowKey: 'row-1', field: 'id', value: 'invented' }] }), /does not match/);
});

test('AI revisions detect changed work without embedding the work in the revision', async () => {
  const before = await aiRevision({ value: 'first' });
  const after = await aiRevision({ value: 'second' });
  assert.match(before, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(before, after);
  assert.throws(() => assertAIRevision({ revision: before }, after), /workspace changed/);
  assert.equal(assertAIRevision({ revision: before }, before).revision, before);
});

test('provider configuration exposes models, never keys or credential-bearing URLs', () => {
  const config = providersFromEnv({ OPENAI_API_KEY: 'secret-value', OPENAI_MODEL: 'model-a,model-b', OLLAMA_MODEL: 'local-model' });
  assert.equal(JSON.stringify(publicProviderConfig(config)).includes('secret-value'), false);
  assert.deepEqual(publicProviderConfig(config).providers[0].models, ['model-a', 'model-b']);
  assert.throws(() => providersFromEnv({ COMPATIBLE_API_KEY: 'secret', COMPATIBLE_MODEL: 'model', COMPATIBLE_BASE_URL: 'http://remote.example/v1' }), /HTTPS/);
  assert.throws(() => providersFromEnv({ OLLAMA_MODEL: 'model:cloud' }), /cloud model names/);
  assert.throws(() => providersFromEnv({ OLLAMA_MODEL: 'model', OLLAMA_BASE_URL: 'https://ollama.com' }), /loopback/);
});

test('OpenAI adapter sends bounded structured requests and validates model output', async () => {
  const config = providersFromEnv({ OPENAI_API_KEY: 'fake-test-secret', OPENAI_MODEL: 'test-model' });
  let sent;
  const result = await runProviderRequest(mapping(), config, { fetchImpl: async (url, options) => {
    sent = { url, ...options, body: JSON.parse(options.body) };
    return response({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(mappingResult()) } }] });
  } });
  assert.equal(result.reviewState, 'pending');
  assert.equal(result.revision, 'revision-1');
  assert.equal(sent.body.response_format.type, 'json_schema');
  assert.equal(sent.body.max_completion_tokens, 1600);
  assert.equal(sent.redirect, 'error');
  assert.equal(JSON.stringify(result).includes('fake-test-secret'), false);
  await assert.rejects(runProviderRequest(mapping(), config, { fetchImpl: async () => response({ choices: [{ finish_reason: 'stop', message: { content: '{bad json' } }] }) }), /failed validation/);
});

test('Anthropic, compatible, and Ollama adapters parse their own response shapes', async () => {
  const config = providersFromEnv({ ANTHROPIC_API_KEY: 'test', ANTHROPIC_MODEL: 'test-claude', COMPATIBLE_API_KEY: 'test', COMPATIBLE_MODEL: 'test-compatible', COMPATIBLE_BASE_URL: 'https://models.example/v1', OLLAMA_MODEL: 'test-local' });
  for (const provider of ['anthropic', 'compatible', 'ollama']) {
    let sent;
    const result = await runProviderRequest({ ...mapping(), provider }, config, { fetchImpl: async (_url, options) => {
      sent = { ...options, body: JSON.parse(options.body) };
      const content = JSON.stringify(mappingResult());
      return response(provider === 'anthropic' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: content }] }
        : provider === 'ollama' ? { done: true, message: { content } }
          : { choices: [{ finish_reason: 'stop', message: { content } }] });
    } });
    assert.equal(result.provider, provider);
    if (provider === 'anthropic') assert.equal(sent.headers['anthropic-version'], '2023-06-01');
    if (provider === 'ollama') { assert.equal(sent.body.stream, false); assert.equal(sent.body.format.type, 'object'); assert.equal(sent.headers.Authorization, undefined); }
  }
});

test('provider failures do not reflect upstream secrets or record text', async () => {
  const config = providersFromEnv({ OPENAI_API_KEY: 'fake-test-secret', OPENAI_MODEL: 'test-model' });
  await assert.rejects(runProviderRequest(mapping(), config, { fetchImpl: async () => new Response('secret-value contact@example.com', { status: 401 }) }), problem => !problem.message.includes('secret-value') && !problem.message.includes('contact@example.com'));
  await assert.rejects(runProviderRequest({ ...mapping(), model: 'unconfigured-model' }, config), /model enabled/);
  const anthropic = providersFromEnv({ ANTHROPIC_API_KEY: 'test', ANTHROPIC_MODEL: 'test-model' });
  await assert.rejects(runProviderRequest(mapping(), anthropic, { fetchImpl: async () => response({ content: {} }) }), problem => problem.status === 502 && problem.code === 'provider_response');
});
