import { aiResponseSchema, aiSystemPrompt, validateAIRequest, validateAIResult } from '../src/lib/ai.mjs';
import { randomUUID } from 'node:crypto';

export class ServiceError extends Error {
  constructor(message, status = 400, code = 'invalid_request') { super(message); this.status = status; this.code = code; }
}

const loopback = hostname => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
function endpoint(value, suffix, localOnly = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error('A configured AI endpoint is not a valid URL.'); }
  if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)
    || (url.protocol === 'http:' && !loopback(url.hostname)) || (localOnly && !loopback(url.hostname))) throw new Error('AI endpoints must use HTTPS, except an explicitly configured loopback runtime.');
  return new URL(url.toString().replace(/\/$/, '') + suffix).toString();
}
const boundedInt = (value, fallback, min, max) => {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error('An AI limit is outside the supported range.');
  return number;
};

/** Read only named configuration. Keys never leave this server module. */
export function providersFromEnv(env = process.env) {
  const list = [];
  const add = (id, key, model, base, suffix, local = false) => {
    if ((!local && !key) || !model) return;
    const models = model.split(',').map(item => item.trim()).filter(Boolean);
    if (!models.length || models.length > 12 || models.some(item => item.length > 160 || /[\r\n\x00]/.test(item))) throw new Error('Configure one to twelve valid AI model IDs.');
    if (local && models.some(item => /(?:^|[:/-])cloud(?:$|[:/-])/i.test(item))) throw new Error('The local Ollama adapter does not accept cloud model names.');
    list.push({ id, key, models, url: endpoint(base, suffix, local), local });
  };
  add('openai', env.OPENAI_API_KEY, env.OPENAI_MODEL, 'https://api.openai.com/v1', '/chat/completions');
  add('anthropic', env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL, 'https://api.anthropic.com/v1', '/messages');
  add('compatible', env.COMPATIBLE_API_KEY, env.COMPATIBLE_MODEL, env.COMPATIBLE_BASE_URL || 'https://api.openai.com/v1', '/chat/completions');
  add('ollama', '', env.OLLAMA_MODEL, env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', '/api/chat', true);
  return {
    providers: list,
    limits: {
      dailyRequests: boundedInt(env.AI_DAILY_REQUESTS, 50, 1, 10_000),
      minuteRequests: boundedInt(env.AI_MINUTE_REQUESTS, 6, 1, 100),
      maxOutputTokens: boundedInt(env.AI_MAX_OUTPUT_TOKENS, 1600, 256, 4096),
      timeoutMs: boundedInt(env.AI_TIMEOUT_MS, 60_000, 1000, 180_000),
    },
  };
}

export function publicProviderConfig(config) {
  return { providers: config.providers.map(provider => ({
    id: provider.id, models: [...provider.models], local: provider.local,
    destination: provider.local ? 'Local Ollama runtime; disable its cloud features for local-only inference.' : new URL(provider.url).origin,
  })), limits: { ...config.limits } };
}

async function boundedResponse(response, maximum = 256_000) {
  if (response.headers?.get('content-length') && Number(response.headers.get('content-length')) > maximum) throw new ServiceError('The AI provider returned an oversized response.', 502, 'provider_response');
  const reader = response.body?.getReader?.();
  if (!reader) {
    const value = await response.text();
    if (new TextEncoder().encode(value).length > maximum) throw new ServiceError('The AI provider returned an oversized response.', 502, 'provider_response');
    return value;
  }
  const chunks = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > maximum) { await reader.cancel(); throw new ServiceError('The AI provider returned an oversized response.', 502, 'provider_response'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function runProviderRequest(input, config, { fetchImpl = fetch } = {}) {
  let request;
  try { request = validateAIRequest(input); } catch (problem) { throw new ServiceError(problem.message); }
  const provider = config.providers.find(item => item.id === (request.provider ?? config.providers[0]?.id));
  if (!provider) throw new ServiceError('This provider is not configured in the local companion. Configure its server environment and restart.', 503, 'provider_unavailable');
  const model = request.model ?? provider.models[0];
  if (!provider.models.includes(model)) throw new ServiceError('Choose a model enabled by this companion.', 400, 'model_not_allowed');
  const schema = aiResponseSchema(request.task);
  const system = aiSystemPrompt(request.task);
  const user = JSON.stringify({ task: request.task, data: request.context, responseSchema: schema });
  const headers = { 'Content-Type': 'application/json' };
  let body;
  if (provider.id === 'anthropic') {
    headers['x-api-key'] = provider.key;
    headers['anthropic-version'] = '2023-06-01';
    body = { model, max_tokens: config.limits.maxOutputTokens, system, messages: [{ role: 'user', content: user }] };
  } else if (provider.id === 'ollama') {
    body = { model, stream: false, format: schema, options: { num_predict: config.limits.maxOutputTokens, temperature: 0 }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  } else {
    headers.Authorization = `Bearer ${provider.key}`;
    body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      ...(provider.id === 'openai' ? { max_completion_tokens: config.limits.maxOutputTokens, response_format: { type: 'json_schema', json_schema: { name: `intake_${request.task}`, strict: true, schema } } }
        : { max_tokens: config.limits.maxOutputTokens, response_format: { type: 'json_object' } }),
    };
  }
  let response;
  try {
    response = await fetchImpl(provider.url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(config.limits.timeoutMs), redirect: 'error' });
  } catch (problem) {
    if (problem?.name === 'TimeoutError' || problem?.name === 'AbortError') throw new ServiceError('The AI provider timed out. Your review is unchanged.', 504, 'provider_timeout');
    throw new ServiceError('The AI provider could not be reached. Check the companion configuration and runtime.', 502, 'provider_unreachable');
  }
  if (!response.ok) {
    await response.body?.cancel?.().catch(() => {});
    throw new ServiceError(response.status === 429 ? 'The AI provider is rate-limited or its allowance is exhausted.' : 'The AI provider rejected the request. Check its key, model access, and configuration in the companion.', 502, 'provider_rejected');
  }
  let json;
  try { json = JSON.parse(await boundedResponse(response)); }
  catch (problem) { if (problem instanceof ServiceError) throw problem; throw new ServiceError('The AI provider returned malformed data.', 502, 'provider_response'); }
  let content;
  try {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Invalid provider wrapper.');
  if (provider.id === 'anthropic') {
    if (json.stop_reason === 'max_tokens') throw new ServiceError('The model response was cut off. Reduce the selected context.', 502, 'provider_truncated');
    if (!Array.isArray(json.content)) throw new Error('Invalid provider wrapper.');
    content = json.content.filter(item => item && item.type === 'text').map(item => item.text).join('');
  } else if (provider.id === 'ollama') {
    if (json.done === false || json.done_reason === 'length') throw new ServiceError('The model response was cut off. Reduce the selected context.', 502, 'provider_truncated');
    content = json.message?.content;
  } else {
    if (json.choices?.[0]?.finish_reason !== 'stop') throw new ServiceError('The model did not return a complete structured response.', 502, 'provider_truncated');
    content = json.choices?.[0]?.message?.content;
  }
  } catch (problem) { if (problem instanceof ServiceError) throw problem; throw new ServiceError('The AI provider returned an unsupported response shape.', 502, 'provider_response'); }
  try {
    if (typeof content !== 'string') throw new Error('No JSON content.');
    const result = validateAIResult(request, JSON.parse(content));
    return { id: `ai-${randomUUID()}`, task: request.task, revision: request.revision, provider: provider.id, model, createdAt: new Date().toISOString(), reviewState: 'pending', result };
  } catch { throw new ServiceError('The model response failed validation. Nothing was applied; try again with a smaller selection.', 502, 'invalid_ai_result'); }
}
