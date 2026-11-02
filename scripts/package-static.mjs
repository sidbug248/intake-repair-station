import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await Promise.all(['LICENSE', 'THIRD_PARTY_NOTICES.md'].map(name =>
  copyFile(resolve(root, name), resolve(root, 'dist', name))
));
