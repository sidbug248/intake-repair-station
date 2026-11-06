# Relay Station: optional local services and AI

Relay Station's core remains complete without an account, an API key, or a running server. Imports, review, assignments, readable handoffs, exports, and local session backups continue in the browser. Nothing connects to this companion automatically. Open **Advanced tools → Saved workspaces** for the service connection and **Advanced tools → AI assistance** for AI tasks.

The companion adds explicit saved workspaces, version checks, scoped collaborator access, a notification inbox, optional AI, and an optional handoff webhook. It runs on the user's computer using Node.js 24 and SQLite. No Supabase account is required for these local features.

## Start the companion

1. Install the project dependencies with `npm ci` and start the application with `npm run dev`.
2. To configure AI or a connector, copy `.env.example` to `.env` and fill only the services you intend to use. Never use a `VITE_` prefix for credentials: Vite exposes such values to frontend code.
3. In another terminal, run `npm run companion`.
4. Open **Advanced tools → Saved workspaces** and enter `http://127.0.0.1:4317` plus the companion access token. The startup message tells you which private local file contains that token. If you configured `INTAKE_ACCESS_TOKEN`, use that value instead.
5. Choose a provider and task, or explicitly save a workspace. Connecting alone does not save the current dataset or send an AI request.

After installing dependencies and configuring any optional services, `npm run local` starts the app and companion together in one terminal. It uses the same local settings and shuts down both processes when stopped.

The service binds to `127.0.0.1`. It does not open a public endpoint. The default app origins are localhost/127.0.0.1 ports 5173 and 4173; set `INTAKE_ALLOWED_ORIGINS` to exact origins if using another development port.

For the downloaded HTML opened directly with `file://`, set `INTAKE_ALLOW_FILE_ORIGIN=1` and restart the companion. This explicitly permits an opaque browser origin (`Origin: null`), which can also describe sandboxed frames. The bearer token remains required; do not give it to untrusted pages. Local HTTP hosting is the narrower default.

### Storage and access

The default private data folder is `~/.intake-repair-station`, outside the repository. It contains `workspaces.sqlite`, SQLite journal files, and the generated `access-token`. `INTAKE_DATA_DIR` can select a different private folder. The startup script requests owner-only filesystem permissions where supported by the OS. The SQLite contents are not independently encrypted; the machine's user account and disk protection remain relevant.

The earlier folder name and `INTAKE_` environment variables are retained for compatibility with existing installations. They are configuration identifiers, not the visible product name. Renaming the app does not require moving a database, replacing credentials, or editing old session files.

The browser client holds its connection token in memory. Provider keys and webhook secrets stay in the companion environment. None are added to session backups or CSV exports. Workspace saves rebuild a validated application snapshot instead of persisting arbitrary request fields.

The service supports up to 100 saved workspaces, each with a bounded snapshot. Saves require an `expectedVersion`. If another reviewer saved a newer revision, the stale write fails with a conflict instead of replacing their work. Reload the saved version or create a separate workspace to preserve a competing draft.

Deletion requires owner access and the current version. It removes that workspace's saved content, server activity, memberships, and notifications. It does not retrieve files someone previously exported.

## Collaboration without a public signup service

The companion owner can create scoped access tokens labeled for a collaborator:

| Role | Access |
| --- | --- |
| Owner | Create, read, save, delete, manage collaborator tokens, use configured services |
| Editor | Read and save the shared workspace, read service history, use configured services, explicitly deliver a reviewed handoff |
| Viewer | Read/export the shared workspace and service history; cannot save, delete, manage members, spend the companion's AI allowance, or deliver a webhook |

A collaborator token belongs to one workspace. The service returns its plaintext value only when it is created and stores a SHA-256 hash. The owner can revoke it. Copying a token transfers its authority; the collaborator label is attribution to that token, not verification of a person's real identity.

This supplies local collaboration primitives and separate browser-profile review. Because the server binds only to loopback, cross-device collaboration, Internet signup, Google OAuth, password recovery, email verification, and cloud synchronization are not enabled. A future hosted edition needs a real identity system, transport configuration, operational controls, and a separate deployment review. Do not expose this local service to the Internet by removing its checks.

Service activity records saved revisions and access changes using the authenticated token identity. It is separate from the editable activity embedded in a session. The service retains the most recent 1,000 events per workspace and 500 notifications per identity. This is useful operational history, not a tamper-proof external audit. The notification inbox reports service changes; it does not send email, text messages, or calendar invitations.

## AI capabilities

All six tasks are optional and return pending suggestions. The assistant has no tool execution, direct edit, merge, approval, messaging, or permission-changing capability.

| Task | Data scope | Result |
| --- | --- | --- |
| Column mapping | Exact source headers and target field definitions | Proposed header-to-field matches with reasons; uncertain matches can be null |
| Draft validation rules | Exact source headers and the user's written requirement | Up to twenty bounded declarative rules for review in the recipe editor; no regex or code |
| Handoff summary | Reviewed counts, issue categories, and explicit owner/action text | Model-selected facts, rendered into a summary using the exact supplied text |
| Explain an issue | One selected record's issue descriptions; values only when explicitly included | Explanation and proposed next action with issue references |
| Draft next action | One selected record's issue descriptions | A proposed action for a reviewer to accept or edit |
| Compare possible duplicates | Two to eight explicitly selected records and field values | Advisory assessment and exact-value evidence; never a merge or deletion |

Handoff summaries cannot introduce model-written facts: the model selects known fact IDs, and application code renders the counts and facts. Summaries use approved corrections; pending changes remain pending. Up to 50 assignments are considered for inclusion; fact-count and UTF-8 byte limits can reduce that selection further. An explicit omission notice remains in both the request and rendered summary when any issue categories or assignments are omitted. Record totals remain complete. Per-record assistance uses at most 30 selected issue descriptions; the exact scope is shown before sending.

Issue and next-action prose is still model-generated advice. Valid references do not prove the prose is correct. Review it before using it. Duplicate assessments do not verify identity.

Rule suggestions can express required values, uniqueness, email/date/number checks, allowed-value lists, and string-length limits. They are validated against the source headers and the same recipe validator used by manual rules. Unknown operations, extra executable fields, invalid bounds, and invented column references are rejected. The user first reviews the proposal, then reviews it in the recipe editor before applying it. Requirements beyond this vocabulary need a different implementation; the model may return an empty list and explain the limitation.

Requests carry a SHA-256 workspace revision. The interface must compare it with the current workspace before using a result. A changed workspace invalidates the old suggestion. Column suggestions still require a user's mapping decision; next-action suggestions still require an assignment decision.

### Provider setup

| Adapter | Required environment | Network behavior |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL` | Sends the selected scope to OpenAI's Chat Completions endpoint with a JSON schema |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Sends the selected scope to the Messages API, then validates the JSON result |
| OpenAI-compatible | `COMPATIBLE_API_KEY`, `COMPATIBLE_MODEL`, `COMPATIBLE_BASE_URL` | Uses a configured HTTPS Chat Completions-compatible service and JSON mode |
| Ollama | `OLLAMA_MODEL`; optional loopback `OLLAMA_BASE_URL` | Uses the local `/api/chat` endpoint and a structured-output schema |

Models are explicit, server-configured IDs. The frontend can only select models on that allowlist. Configure a model available to your account; no subscription or API credit is supplied by this repository. Compatible services vary in response-format support, so successful operation with every provider is not promised.

For a fully local Ollama setup, install the runtime, download the desired model, and disable Ollama's cloud features in the runtime's own environment (`OLLAMA_NO_CLOUD=1`). This application rejects cloud-labeled model IDs and remote Ollama hosts, but cannot independently verify an administrator's runtime internals. Local model performance and memory needs depend on the model and computer.

Remote BYOK is not offline: selected content leaves the machine for the configured provider. Choose the task and inspect the scope before sending. Provider retention and use policies apply to that selected service. Core processing remains local when optional services are unused.

### Limits and failure behavior

The default budget is 50 AI requests per UTC day across the companion, six requests per minute per identity, one in-flight request per identity, a 48,000-byte context cap, and at most 1,600 generated tokens per request. These are request/output limits, not an exact dollar-denominated spending cap. Set billing controls at the provider and adjust these limits deliberately.

The daily request budget persists across restarts. Failed attempted provider requests count against it. A provider outage, timeout, invalid JSON, unknown evidence reference, reused mapping column, or stale revision leaves the current review unchanged. The service does not echo provider errors that could contain record values or credentials. It does not log raw prompts or responses.

## Optional handoff webhook

Set `HANDOFF_WEBHOOK_URL` to a trusted HTTPS destination, with an optional `HANDOFF_WEBHOOK_SECRET`. The connector URL and secret stay server-side. The app exposes a preview containing the exact payload and destination origin.

The payload contains reviewed totals and issue facts. Owner and next-action text are included only when explicitly selected. It does not contain the source CSV or raw contact fields. If pending corrections remain, delivery is blocked.

Sending requires an explicit action, the current saved workspace version, and editor/owner access. Saving a workspace, importing a file, or receiving an AI result never sends a webhook. When configured, `X-Handoff-Signature` carries an HMAC-SHA256 signature of the exact request body. Redirects are not followed and failed requests are not automatically retried. A failed response does not prove non-delivery; check the destination before retrying.

## Developer API

The browser wrapper is `createCompanionClient({ baseUrl, token })` from `src/lib/companion.mjs`. Keep that client and its token in memory. All `/api` routes except `/api/health` require `Authorization: Bearer ...`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/config` | Non-secret provider models, limits, usage, identity, connectors |
| GET / POST | `/api/workspaces` | List visible workspaces / explicitly create one |
| GET / PUT / DELETE | `/api/workspaces/:id` | Read / save with expectedVersion / delete with expectedVersion |
| GET | `/api/workspaces/:id/activity` | Service-recorded history |
| GET / POST | `/api/workspaces/:id/members` | List access identities / create scoped collaborator token |
| DELETE | `/api/workspaces/:id/members/:memberId` | Revoke collaborator access |
| GET | `/api/notifications` | Current identity's inbox |
| POST | `/api/notifications/:id/read` | Mark an owned notification read |
| POST | `/api/ai` | Scoped task with revision, context, provider, and model |
| POST | `/api/workspaces/:id/connectors/handoff-webhook/preview` | Exact handoff payload preview |
| POST | `/api/workspaces/:id/connectors/handoff-webhook/send` | Explicit confirmed delivery |

The companion uses only Node.js built-in server/database/crypto modules. Provider adapters use native fetch. The default application bundle does not contain the server or server configuration.

## Validation and references

`tests/ai.test.mjs` verifies scope boundaries, response schemas, grounded facts, evidence references, revisions, provider adapters, and secret-safe failures. `tests/companion.test.mjs` verifies persisted state, stale-write rejection, role/workspace isolation, revocation, notifications, loopback/Origin/token checks, budgets, and explicit webhook behavior. Provider HTTP is mocked; no paid inference or outbound messages are needed by the test suite.

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [Anthropic API overview](https://platform.claude.com/docs/en/api/overview)
- [Ollama Chat API](https://docs.ollama.com/api/chat)
- [Ollama local/cloud configuration](https://github.com/ollama/ollama/blob/main/docs/faq.mdx)
