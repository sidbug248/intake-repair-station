import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run after `npm run build`. Embed the production assets so the whole app can
// be opened from a downloaded HTML file, without a server or a network request.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(project, 'dist');
let html = await readFile(resolve(dist, 'index.html'), 'utf8');

async function readAsset(relative) {
  const path = resolve(dist, relative.replace(/^\.\//, ''));
  if (!path.startsWith(dist + sep)) throw new Error('Asset escaped the build directory.');
  return readFile(path, 'utf8');
}

const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
if (scripts.length !== 1) throw new Error('Expected exactly one production JavaScript bundle.');
for (const match of scripts) {
  const script = (await readAsset(match[1])).replace(/<\/script/gi, '<\\/script');
  html = html.replace(match[0], () => `<script type="module">${script}</script>`);
}
const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)];
if (!styles.length) throw new Error('The production stylesheet is missing.');
for (const match of styles) {
  const css = await readAsset(match[1]);
  html = html.replace(match[0], () => `<style>${css}</style>`);
}
const icon = await readFile(resolve(project, 'public/favicon.svg'), 'utf8');
html = html.replace(/href="\.\/favicon\.svg"/, `href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}"`);
const license = await readFile(resolve(project, 'LICENSE'), 'utf8');
const notices = await readFile(resolve(project, 'THIRD_PARTY_NOTICES.md'), 'utf8');
html += `\n<!--\n${license}\n${notices}\n-->\n`;
const output = resolve(project, 'release');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'relay-station.html'), html);
await writeFile(resolve(dist, 'relay-station.html'), html);
// Remove the previous generated filename so a new build cannot ship a stale app.
await rm(resolve(output, 'intake-repair-station.html'), { force: true });
await rm(resolve(dist, 'intake-repair-station.html'), { force: true });
console.log(`Offline app written: release/relay-station.html (${Buffer.byteLength(html).toLocaleString()} bytes)`);
