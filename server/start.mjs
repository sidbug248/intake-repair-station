import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createCompanion, connectorFromEnv } from './companion.mjs';
import { providersFromEnv } from './providers.mjs';

const dataDirectory = resolve(process.env.INTAKE_DATA_DIR || join(homedir(), '.intake-repair-station'));
await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
await chmod(dataDirectory, 0o700).catch(() => {});
const tokenPath = join(dataDirectory, 'access-token');
let token = process.env.INTAKE_ACCESS_TOKEN;
if (!token) {
  try { token = (await readFile(tokenPath, 'utf8')).trim(); }
  catch (problem) { if (problem.code !== 'ENOENT') throw problem; token = randomBytes(32).toString('base64url'); await writeFile(tokenPath, token + '\n', { mode: 0o600, flag: 'wx' }); }
}
const port = Number(process.env.INTAKE_PORT || 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('INTAKE_PORT must be between 1024 and 65535.');
const allowedOrigins = (process.env.INTAKE_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173').split(',').map(origin => origin.trim()).filter(Boolean);
for (const origin of allowedOrigins) {
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('INTAKE_ALLOWED_ORIGINS must contain exact origins without paths.');
}
const app = createCompanion({ ownerToken: token, ownerLabel: process.env.INTAKE_OWNER_LABEL || 'Workspace owner', database: join(dataDirectory, 'workspaces.sqlite'), providerConfig: providersFromEnv(), connector: connectorFromEnv(), allowedOrigins, allowFileOrigin: process.env.INTAKE_ALLOW_FILE_ORIGIN === '1' });
await new Promise((resolveListen, reject) => { app.server.once('error', reject); app.server.listen(port, '127.0.0.1', resolveListen); });
await chmod(join(dataDirectory, 'workspaces.sqlite'), 0o600).catch(() => {});
console.log(`Local companion ready at http://127.0.0.1:${port}`);
console.log(process.env.INTAKE_ACCESS_TOKEN ? 'Connect using the access token configured in INTAKE_ACCESS_TOKEN.' : `Your private access token is in ${tokenPath}. Copy it into the app's optional services connection.`);
console.log('Provider keys stay in this process. The companion accepts loopback connections only.');
let closing = false;
const shutdown = async () => { if (closing) return; closing = true; await app.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
