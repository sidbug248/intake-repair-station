import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packages = ['react', 'react-dom', 'scheduler', 'lucide-react', 'fflate'];
const sections = ['# Third-party notices\n\nRelay Station by Eternity Flux is licensed under the MIT license in `LICENSE`.\nThe following third-party libraries are included in the browser application.\nTheir original notices are reproduced below. Build and test dependencies retain\ntheir own licenses in their distributed packages.\n'];
for (const name of packages) {
  const directory = resolve(root, 'node_modules', name);
  const pkg = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  const license = await readFile(resolve(directory, 'LICENSE'), 'utf8');
  sections.push(`## ${pkg.name} ${pkg.version}\n\n\`\`\`text\n${license.trim()}\n\`\`\`\n`);
}
await writeFile(resolve(root, 'THIRD_PARTY_NOTICES.md'), sections.join('\n'));
console.log('Updated THIRD_PARTY_NOTICES.md');
