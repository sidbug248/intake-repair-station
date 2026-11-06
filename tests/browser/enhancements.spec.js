import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { parseCSV } from '../../src/lib/intake.mjs';
import { createCompanion } from '../../server/companion.mjs';
import { providersFromEnv } from '../../server/providers.mjs';
import { createCompanionClient } from '../../src/lib/companion.mjs';

const OWNER = 'browser-test-owner-access-token-not-a-real-secret';
const PROVIDER_KEY = 'browser-test-provider-key-never-export';
const SOURCE = 'id,name,email,status,start_date,notes\n001,Amara Stone,amara@example.org,active,2026-11-01,Confirmed\n002,Bennett Park,bennett@example.org,pending,2026-11-02,Follow up\n';
const test = base.extend({
  companion: async ({}, use) => {
    const calls = [];
    const providerConfig = providersFromEnv({ OPENAI_API_KEY: PROVIDER_KEY, OPENAI_MODEL: 'fixture-model', AI_DAILY_REQUESTS: '20' });
    const app = createCompanion({ ownerToken: OWNER, ownerLabel: 'Fictional owner', providerConfig,
      allowedOrigins: [new URL(process.env.TEST_BASE_URL || 'http://127.0.0.1:4173').origin],
      fetchImpl: async (url, options) => {
        const payload = JSON.parse(JSON.parse(options.body).messages.at(-1).content);
        calls.push(payload);
        const output = payload.task === 'mapping'
          ? { mappings: payload.data.fields.map(field => ({ field: field.key, header: payload.data.headers.includes(field.key) ? field.key : null, reason: 'Exact matching source heading.' })) }
          : { highlightFactIds: payload.data.facts.slice(0, 3).map(fact => fact.id) };
        return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }), { status: 200 });
      },
    });
    await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
    const address = `http://127.0.0.1:${app.server.address().port}`;
    try { await use({ address, calls, client: createCompanionClient({ baseUrl: address, token: OWNER }) }); }
    finally { app.server.closeAllConnections(); await app.close(); }
  },
});

async function navigate(page, label) {
  if (['Import recipes', 'Compare versions', 'AI assistance', 'Saved workspaces'].includes(label)) {
    const advanced = page.locator('details.ir-advanced-nav');
    if (await advanced.getAttribute('open') === null) await advanced.locator('summary').click();
    await page.getByRole('navigation', { name: 'Advanced tools', exact: true }).getByRole('button', { name: label, exact: true }).click();
  } else if (label === 'Quick start') {
    await page.locator('.ir-sidebar').getByRole('button', { name: label, exact: true }).click();
  } else {
    await page.getByRole('navigation', { name: 'Workflow', exact: true }).getByRole('button', { name: new RegExp('^' + label + '(?:\\s|$)') }).click();
  }
}
async function upload(page, source = SOURCE, name = 'cohort.csv', open = true) {
  await page.getByLabel('Choose intake CSV, TSV or Excel', { exact: true }).setInputFiles({ name, mimeType: name.endsWith('.tsv') ? 'text/tab-separated-values' : 'text/csv', buffer: Buffer.from(source) });
  await page.getByRole('button', { name: 'Inspect CSV', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirm column mapping.' })).toBeVisible();
  if (open) {
    await page.getByRole('button', { name: 'Open review', exact: true }).click();
    await page.getByRole('button', { name: 'Table view', exact: true }).click();
  }
}
async function downloaded(page, button) {
  const pending = page.waitForEvent('download'); await button.click(); const item = await pending;
  expect(await item.failure()).toBeNull(); return { name: item.suggestedFilename(), bytes: await readFile(await item.path()) };
}
async function handoff(page) {
  await navigate(page, 'Handoff');
  return unzipSync((await downloaded(page, page.getByRole('button', { name: 'Download handoff ZIP', exact: true }))).bytes);
}
async function connect(page, companion, token = OWNER) {
  await navigate(page, 'Saved workspaces');
  await page.getByLabel('Companion address', { exact: true }).fill(companion.address);
  await page.getByLabel('Companion access token', { exact: true }).fill(token);
  await page.getByRole('button', { name: 'Connect locally', exact: true }).click();
  await expect(page.getByText('Connected locally', { exact: true })).toBeVisible();
}
const csvRows = (zip, name) => parseCSV(strFromU8(zip[name])).map(row => row.values);
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function workbook() {
  const table = rows => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    'xl/workbook.xml': strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Read me" sheetId="1" r:id="rId1"/><sheet name="Cohort" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(table([['Instructions'], ['This extra sheet must remain in the original.']])),
    'xl/worksheets/sheet2.xml': strToU8(table([['id', 'name', 'email', 'status', 'start_date', 'notes'], ['001', 'Amara Stone', 'amara@example.org', 'active', '2026-11-01', 'A & B, with a comma'], ['002', 'Bennett Park', 'bennett@example.org', 'pending', '2026-11-02', 'Two\nlines']])),
  }));
}

test('guided example reaches a reviewed handoff and keyboard navigation stays useful', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await navigate(page, 'Quick start');
  await page.getByRole('button', { name: 'Start guided example', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided example progress' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What needs a decision?');
  await page.getByRole('button', { name: 'Table view', exact: true }).click();
  await page.keyboard.press('/');
  await expect(page.locator('#record-search')).toBeFocused();
  await page.locator('#record-search').fill('Dana');
  await expect(page.getByRole('row').filter({ hasText: 'Dana Vale' })).toHaveCount(1);
  await page.getByRole('button', { name: /Assign next action for Dana Vale/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Owner/ }).fill('Intake coordinator');
  await dialog.getByRole('textbox', { name: /^Next action/ }).fill('Confirm the source ID and intended start date.');
  await dialog.getByRole('combobox', { name: 'Action status', exact: true }).selectOption('waiting');
  await dialog.getByRole('button', { name: 'Save next action', exact: true }).click();
  await page.locator('#record-search').fill('');
  await page.getByRole('button', { name: /^Preview formatting/ }).click();
  await dialog.getByRole('button', { name: 'Stage 4 suggestions', exact: true }).click();
  await page.keyboard.press('Alt+3');
  await page.getByRole('button', { name: 'Approve all 4 pending changes', exact: true }).click();
  await page.keyboard.press('Alt+4');
  const zip = await handoff(page);
  expect(csvRows(zip, 'clean.csv')).toHaveLength(7);
  expect(csvRows(zip, 'exceptions.csv')).toHaveLength(7);
  expect(csvRows(zip, 'all-reviewed-rows.csv')).toHaveLength(13);
  expect(strFromU8(zip['assignments.csv'])).toContain('Confirm the source ID and intended start date.');
  await expect(page.getByRole('region', { name: 'Guided example progress' })).toContainText('Handoff prepared.');
  expect(errors).toEqual([]);
});

test('custom column recipe is applied, saved without records, and reused after reload', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'Ticket,Contact,Score\nT1,Amara Stone,90\nT2,Bennett Park,140\n', 'scores.csv', false);
  await navigate(page, 'Import recipes');
  await page.getByLabel('Recipe name', { exact: true }).fill('Training scores');
  for (const label of ['Email', 'Status', 'Start date']) await page.getByRole('checkbox', { name: label, exact: true }).uncheck();
  await page.getByRole('combobox', { name: 'Source column', exact: true }).selectOption('Score');
  await page.getByRole('combobox', { name: 'Check', exact: true }).selectOption('number');
  await page.getByLabel('Minimum (optional)', { exact: true }).fill('0');
  await page.getByLabel('Maximum (optional)', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Add rule', exact: true }).click();
  await navigate(page, 'Start');
  await page.getByLabel('Source column for Source ID', { exact: true }).selectOption('Ticket');
  await page.getByLabel('Source column for Name', { exact: true }).selectOption('Contact');
  await navigate(page, 'Import recipes');
  await page.getByRole('button', { name: 'Save recipe on device', exact: true }).click();
  const exported = await downloaded(page, page.getByRole('button', { name: 'Export recipe', exact: true }));
  const recipe = JSON.parse(exported.bytes.toString());
  expect(recipe.requiredFields).toEqual(['id', 'name']);
  expect(recipe.rules).toEqual([{ column: 'Score', type: 'number', min: 0, max: 100 }]);
  expect(recipe.columnMap.id).toBe('Ticket');
  expect(exported.bytes.toString()).not.toContain('Bennett Park');
  await navigate(page, 'Start');
  await page.getByRole('button', { name: 'Open review', exact: true }).click();
  await page.getByRole('button', { name: 'Table view', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Bennett Park' })).toHaveCount(1);
  await expect(page.getByRole('row').filter({ hasText: 'Amara Stone' })).toHaveCount(0);
  const zip = await handoff(page);
  expect(csvRows(zip, 'clean.csv')).toHaveLength(2);
  expect(csvRows(zip, 'exceptions.csv')).toHaveLength(2);
  expect(JSON.parse(strFromU8(zip['session.json'])).recipe.name).toBe('Training scores');
  await page.reload();
  await navigate(page, 'Import recipes');
  await page.getByRole('combobox', { name: 'Saved recipes on this device', exact: true }).selectOption('Training scores');
  await navigate(page, 'Start');
  await upload(page, 'Contact,Score,Ticket\nCasey Reed,88,T3\n', 'next-scores.csv', false);
  await expect(page.getByLabel('Source column for Source ID', { exact: true })).toHaveValue('Ticket');
  await expect(page.getByLabel('Source column for Name', { exact: true })).toHaveValue('Contact');
  await page.getByRole('button', { name: 'Open review', exact: true }).click();
  const next = await handoff(page);
  expect(csvRows(next, 'clean.csv')[1]).toEqual(['Casey Reed', '88', 'T3']);
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toContain('Amara Stone');
  expect(storage).not.toContain('Bennett Park');
  expect(storage).not.toContain('Casey Reed');
});

test('TSV with quoted tabs and lines retains exact source through reviewed export', async ({ page }) => {
  const source = '\ufeffid\tname\temail\tstatus\tstart_date\tnotes\r\n001\tAmara Stone\tamara@example.org\tactive\t2026-11-01\t"A\ttab and\r\na line"\r\n';
  await page.goto('/'); await upload(page, source, 'participants.tsv');
  const zip = await handoff(page);
  expect(Buffer.from(zip['original.tsv'])).toEqual(Buffer.from(source));
  expect(csvRows(zip, 'all-reviewed-rows.csv')[1]).toEqual(['001', 'Amara Stone', 'amara@example.org', 'active', '2026-11-01', 'A\ttab and\r\na line']);
  expect(zip['working-source.csv']).toBeDefined();
});

test('XLSX sheet choice exports selected records and preserves the complete workbook', async ({ page }) => {
  const bytes = workbook();
  await page.goto('/');
  await upload(page, SOURCE, 'prior-preview.csv', false);
  await page.getByLabel('Choose intake CSV, TSV or Excel', { exact: true }).setInputFiles({ name: 'participants.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes });
  await expect(page.getByRole('button', { name: 'Inspect CSV', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Confirm column mapping.' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Workbook sheet', exact: true }).selectOption('Cohort');
  await page.getByRole('button', { name: 'Read selected sheet', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect CSV', exact: true }).click();
  await page.getByRole('button', { name: 'Open review', exact: true }).click();
  const zip = await handoff(page);
  expect(Buffer.from(zip['original.xlsx'])).toEqual(bytes);
  const rows = csvRows(zip, 'all-reviewed-rows.csv');
  expect(rows).toHaveLength(3);
  expect(rows[1][0]).toBe('001');
  expect(rows[1][5]).toBe('A & B, with a comma');
  expect(rows[2][5]).toBe('Two\nlines');
  expect(strFromU8(zip['working-source.csv'])).not.toContain('This extra sheet');
});

test('version comparison reports duplicates as ambiguous and never changes the active source', async ({ page }) => {
  const previous = SOURCE + '003,Casey Reed,casey@example.org,active,2026-11-03,First duplicate\n003,Dana Vale,dana@example.org,active,2026-11-04,Second duplicate\n';
  const next = 'id,name,email,status,start_date,notes\n001,Amara Stone,amara@example.org,completed,2026-11-01,Confirmed\n003,Casey Reed,casey@example.org,active,2026-11-03,First duplicate\n004,Eli Hart,eli@example.org,pending,2026-11-05,New record\n';
  await page.goto('/'); await upload(page, previous);
  await navigate(page, 'Compare versions');
  await page.getByLabel('Choose comparison file', { exact: true }).setInputFiles({ name: 'next.csv', mimeType: 'text/csv', buffer: Buffer.from(next) });
  await page.getByRole('main').getByRole('button', { name: 'Compare versions', exact: true }).click();
  await expect(page.getByRole('button', { name: '1 changed', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '1 added', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '1 removed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '1 ambiguous groups', exact: true }).click();
  await expect(page.getByText('This key occurs more than once. Confirm the identity relationship at the source.', { exact: true })).toBeVisible();
  const report = await downloaded(page, page.getByRole('button', { name: 'Download comparison CSV', exact: true }));
  expect(report.bytes.toString()).toContain('duplicate_key');
  const zip = await handoff(page);
  expect(Buffer.from(zip['original.csv'])).toEqual(Buffer.from(previous));
  expect(csvRows(zip, 'all-reviewed-rows.csv')).toHaveLength(5);
});

test('local workspace save, conflict, viewer access and exports preserve explicit boundaries', async ({ page, browser, companion }) => {
  await page.goto('/'); await upload(page); await connect(page, companion);
  expect(await companion.client.listWorkspaces()).toHaveLength(0);
  await page.getByLabel('Name a new saved workspace', { exact: true }).fill('Fictional training review');
  await page.getByRole('button', { name: 'Save as new workspace', exact: true }).click();
  await expect(page.getByText('Connected to Fictional training review · version 1 · owner', { exact: true })).toBeVisible();
  const saved = (await companion.client.listWorkspaces())[0];
  const serverCopy = await companion.client.getWorkspace(saved.id);
  await companion.client.saveWorkspace(saved.id, { name: serverCopy.name, session: serverCopy.session, expectedVersion: 1 });
  await page.getByRole('button', { name: 'Save current review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your local work is still intact.');
  expect((await companion.client.getWorkspace(saved.id)).version).toBe(2);
  await page.getByRole('button', { name: 'Refresh list', exact: true }).click();
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('button', { name: 'Open stored version', exact: true }).click();
  await expect(page.getByText('Connected to Fictional training review · version 2 · owner', { exact: true })).toBeVisible();
  await page.getByLabel('Reviewer label', { exact: true }).fill('Fictional viewer');
  await page.getByRole('combobox', { name: 'Access role', exact: true }).selectOption('viewer');
  await page.getByRole('button', { name: 'Create workspace access token', exact: true }).click();
  const memberToken = await page.getByLabel('New member access token', { exact: true }).inputValue();
  const context = await browser.newContext(); const viewer = await context.newPage();
  try {
    await viewer.goto('/'); await connect(viewer, companion, memberToken);
    await viewer.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(viewer.getByRole('button', { name: 'Save current review', exact: true })).toBeDisabled();
    await expect(viewer.getByRole('button', { name: 'Create workspace access token', exact: true })).toHaveCount(0);
    const exported = await downloaded(viewer, viewer.getByRole('button', { name: 'Export stored version', exact: true }));
    expect(JSON.parse(exported.bytes.toString()).raw).toBe(SOURCE);
    for (const secret of [OWNER, memberToken, PROVIDER_KEY]) expect(exported.bytes.toString()).not.toContain(secret);
    expect(await viewer.evaluate(() => JSON.stringify(localStorage))).not.toContain(memberToken);
    await viewer.getByRole('button', { name: 'Disconnect and forget access', exact: true }).click();
    await expect(viewer.getByLabel('Companion access token', { exact: true })).toHaveValue('');
  } finally { await context.close(); }
});

test('AI maps headers only and applies suggestions only after explicit review', async ({ page, companion }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await upload(page, SOURCE, 'cohort.csv', false); await connect(page, companion);
  await navigate(page, 'AI assistance');
  await expect(page.getByRole('button', { name: 'Suggest column matches', exact: true })).toBeDisabled();
  expect(companion.calls).toHaveLength(0);
  await page.getByRole('checkbox', { name: /^Use this displayed data/ }).check();
  await page.getByRole('button', { name: 'Suggest column matches', exact: true }).click();
  await page.getByRole('button', { name: 'Use these matches in the import screen', exact: true }).click();
  expect(companion.calls).toHaveLength(1);
  expect(companion.calls[0].data.headers).toEqual(['id', 'name', 'email', 'status', 'start_date', 'notes']);
  expect(JSON.stringify(companion.calls[0])).not.toContain('Amara Stone');
  await expect(page.getByRole('heading', { name: 'Confirm column mapping.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open review', exact: true }).click();
  const zip = await handoff(page);
  expect(Buffer.from(zip['original.csv'])).toEqual(Buffer.from(SOURCE));
  expect(csvRows(zip, 'change-log.csv')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('new tools fit a 390px viewport without page errors', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await upload(page);
  for (const label of ['Import recipes', 'Compare versions', 'AI assistance', 'Saved workspaces', 'Quick start']) {
    await navigate(page, label);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), label).toBe(true);
  }
  expect(errors).toEqual([]);
});
