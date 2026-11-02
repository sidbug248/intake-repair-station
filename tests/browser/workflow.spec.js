import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { parseCSV } from '../../src/lib/intake.mjs';

const SOURCE = '\ufeffParticipant ID,Full name,Email address,Intake status,Start date,Notes\r\n'
  + '001,Amara Stone,amara@example.org,active,2026-11-01,Verified\r\n'
  + '002,Bennett Park,BENNETT@EXAMPLE.ORG, Active ,2026-11-02,=2+2\r\n'
  + '003,Casey Reed,casey.example.org,pending,11/06/2026,"Needs source\r\nconfirmation"\r\n'
  + '004,Drew Lane,drew@example.org,completed,2026-11-03,"Contains, comma"\r\n';

function workflow(page, name) {
  return page.getByRole('navigation', { name: 'Workflow', exact: true })
    .getByRole('button', { name: new RegExp('^' + name + '(?:\\s|$)') });
}

async function importSource(page, source = SOURCE) {
  await page.goto('/');
  await page.getByLabel('Choose intake CSV').setInputFiles({
    name: 'cohort.csv', mimeType: 'text/csv', buffer: Buffer.from(source),
  });
  await page.getByRole('button', { name: 'Inspect CSV', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirm column mapping.' })).toBeVisible();
  await expect(page.getByLabel('Source column for Source ID')).toHaveValue('Participant ID');
  await page.getByRole('button', { name: 'Open repair queue', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Put attention where it helps.');
}

async function downloadBytes(page, locator) {
  const pending = page.waitForEvent('download');
  await locator.click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return { name: download.suggestedFilename(), bytes: await readFile(await download.path()) };
}

function csvRows(zip, name) {
  return parseCSV(strFromU8(zip[name])).map(row => row.values);
}

test('mapped upload → assignment → reviewed corrections → complete ZIP → portable restore', async ({ page, browser }) => {
  const unexpectedRequests = [];
  const pageErrors = [];
  const allowedOrigin = new URL(process.env.TEST_BASE_URL || 'http://127.0.0.1:4173').origin;
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== allowedOrigin) {
      unexpectedRequests.push(request.url());
    }
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await importSource(page);
  await expect(page.getByRole('heading', { name: '2 records need a closer look.' })).toBeVisible();

  await page.getByRole('button', { name: /Assign next action for Casey Reed/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Owner/ }).fill('Morgan');
  await dialog.getByRole('textbox', { name: /^Next action/ }).fill('Confirm email and intended start date with the intake coordinator.');
  await dialog.getByLabel(/^Due date/).fill('2026-11-10');
  await dialog.getByLabel('Action status').selectOption('waiting');
  await dialog.getByRole('textbox', { name: /^Handoff note/ }).fill('Awaiting source confirmation.');
  await dialog.getByRole('button', { name: 'Save next action', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: '2 records need a closer look.' })).toBeVisible();
  await page.getByRole('button', { name: 'Waiting', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Casey Reed' })).toHaveCount(1);
  await expect(page.getByRole('row').filter({ hasText: 'Bennett Park' })).toHaveCount(0);

  await page.getByRole('button', { name: /^Preview formatting/ }).click();
  await dialog.getByRole('button', { name: 'Stage 2 suggestions', exact: true }).click();
  await workflow(page, 'Export handoff').click();
  await expect(page.getByRole('button', { name: 'Download handoff ZIP' })).toBeDisabled();
  await expect(page.getByText('Review 2 corrections before exporting.', { exact: true })).toBeVisible();
  await workflow(page, 'Review changes').click();
  await page.getByRole('button', { name: 'Approve all 2 pending changes', exact: true }).click();
  await workflow(page, 'Export handoff').click();
  const downloaded = await downloadBytes(page, page.getByRole('button', { name: 'Download handoff ZIP' }));
  expect(downloaded.name).toBe('cohort-handoff.zip');
  const zip = unzipSync(downloaded.bytes);
  expect(Object.keys(zip).sort()).toEqual([
    'README.txt', 'activity.csv', 'all-reviewed-rows.csv', 'assignments.csv',
    'change-log.csv', 'clean.csv', 'exceptions.csv', 'original.csv', 'session.json',
  ].sort());
  // Compare bytes: a normal UTF-8 text decoder deliberately strips a leading BOM.
  expect(Buffer.from(zip['original.csv'])).toEqual(Buffer.from(SOURCE));
  const clean = csvRows(zip, 'clean.csv');
  const exceptions = csvRows(zip, 'exceptions.csv');
  const all = csvRows(zip, 'all-reviewed-rows.csv');
  expect(clean).toHaveLength(4); // header + 3 ready records
  expect(exceptions).toHaveLength(2); // header + 1 unresolved record
  expect(all).toHaveLength(5);
  expect(clean[0]).toEqual(['Participant ID', 'Full name', 'Email address', 'Intake status', 'Start date', 'Notes']);
  expect(clean.find(row => row[0] === '002')).toEqual([
    '002', 'Bennett Park', 'BENNETT@example.org', 'active', '2026-11-02', "'=2+2",
  ]);
  expect(exceptions[1].join(' ')).toContain('casey.example.org');
  expect(exceptions[1].join(' ')).toContain('11/06/2026');
  expect(csvRows(zip, 'change-log.csv')).toHaveLength(3);
  const assignments = csvRows(zip, 'assignments.csv');
  expect(assignments).toHaveLength(5);
  expect(assignments.find(row => row[2] === '003').slice(4, 8)).toEqual([
    'Morgan', 'Confirm email and intended start date with the intake coordinator.', '2026-11-10', 'waiting',
  ]);
  const snapshot = JSON.parse(strFromU8(zip['session.json']));
  expect(snapshot.raw).toBe(SOURCE);
  expect(snapshot.coordination.events.map(event => event.type)).toEqual(['import', 'assignment', 'stage', 'approve', 'export']);
  expect(strFromU8(zip['README.txt'])).toContain('4 imported = 3 ready + 1 exceptions.');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);

  const secondContext = await browser.newContext();
  const restored = await secondContext.newPage();
  await restored.goto('/');
  await restored.getByLabel('Restore session JSON', { exact: true }).setInputFiles({
    name: 'cohort-session.json', mimeType: 'application/json', buffer: Buffer.from(zip['session.json']),
  });
  await restored.getByRole('dialog').getByRole('button', { name: 'Restore workspace' }).click();
  await expect(restored.getByRole('button', { name: 'Edit next action for Casey Reed' })).toContainText('Morgan');
  await workflow(restored, 'Export handoff').click();
  const restoredDownload = await downloadBytes(restored, restored.getByRole('button', { name: 'Download handoff ZIP' }));
  const restoredZip = unzipSync(restoredDownload.bytes);
  for (const name of ['original.csv', 'clean.csv', 'exceptions.csv', 'all-reviewed-rows.csv', 'change-log.csv', 'assignments.csv']) {
    expect(Buffer.from(restoredZip[name]), name).toEqual(Buffer.from(zip[name]));
  }
  await secondContext.close();
  expect(unexpectedRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('saving an assignment preserves an unstaged correction, and a new value requires approval again', async ({ page }) => {
  await importSource(page);
  await page.getByRole('row').filter({ hasText: 'Casey Reed' }).getByRole('button', { name: /^Review/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Email address/ }).fill('casey@example.org');
  await dialog.getByRole('button', { name: /^Owner & next action/ }).click();
  await dialog.getByRole('textbox', { name: /^Owner/ }).fill('Alex');
  await dialog.getByRole('textbox', { name: /^Next action/ }).fill('Verify the ambiguous start date.');
  await dialog.getByRole('button', { name: 'Save next action' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: /^Email address/ })).toHaveValue('casey@example.org');
  await dialog.getByRole('button', { name: 'Stage corrections' }).click();
  await page.getByRole('button', { name: 'Approve change', exact: true }).click();
  await workflow(page, 'Repair queue').click();
  await page.getByRole('row').filter({ hasText: 'Casey Reed' }).getByRole('button', { name: /^Review/ }).click();
  await dialog.getByRole('textbox', { name: /^Email address/ }).fill('casey.updated@example.org');
  await dialog.getByRole('button', { name: 'Stage corrections' }).click();
  await workflow(page, 'Export handoff').click();
  await expect(page.getByRole('button', { name: 'Download handoff ZIP' })).toBeDisabled();
  await workflow(page, 'Review changes').click();
  await page.getByRole('button', { name: 'Undo correction' }).click();
  await workflow(page, 'Repair queue').click();
  await page.getByRole('row').filter({ hasText: 'Casey Reed' }).getByRole('button', { name: /^Review/ }).click();
  await expect(dialog.getByRole('textbox', { name: /^Email address/ })).toHaveValue('casey.example.org');
});

test('invalid imports and backups leave the current workspace intact; persistence is opt-in and clearable', async ({ page }) => {
  await importSource(page);
  await page.getByLabel('Remember on this device').check();
  await expect.poll(() => page.evaluate(() => localStorage.length)).toBe(1);
  await page.reload();
  await workflow(page, 'Repair queue').click();
  await expect(page.getByRole('heading', { name: '2 records need a closer look.' })).toBeVisible();
  await workflow(page, 'Bring in data').click();
  await page.getByLabel('Or paste your CSV').fill('id,name\n"unclosed,x');
  await page.getByRole('button', { name: 'Inspect CSV' }).click();
  await expect(page.getByRole('alert')).toContainText('not closed');
  await page.getByLabel('Restore session JSON', { exact: true }).setInputFiles({
    name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"raw":"broken"}'),
  });
  await expect(page.getByRole('alert')).toContainText('Could not restore this backup');
  await workflow(page, 'Repair queue').click();
  await expect(page.getByRole('heading', { name: '2 records need a closer look.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear workspace & saved copy' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear workspace', exact: true }).click();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await expect(page.getByLabel('Or paste your CSV')).toHaveValue('');
});

test('oversized pasted input is rejected rather than silently truncated', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Or paste your CSV');
  expect(await input.getAttribute('maxlength')).toBeNull();
  const tooLarge = 'id,name,email,status,start_date\n1,' + 'x'.repeat(1_000_000);
  await input.fill(tooLarge);
  await page.getByRole('button', { name: 'Inspect CSV' }).click();
  await expect(page.getByRole('alert')).toContainText('smaller than 1 MB');
  await expect(input).toHaveValue(tooLarge);
  await expect(page.getByRole('button', { name: 'Open repair queue' })).toHaveCount(0);
});

test('desktop main views and record dialog have no detected WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  const scan = async () => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  };
  await scan();
  await importSource(page);
  await scan();
  await page.getByRole('button', { name: 'Assign next action for Casey Reed' }).click();
  await scan();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await workflow(page, 'Export handoff').click();
  await scan();
});

test('mobile workspace fits the viewport and dialogs support keyboard focus and Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importSource(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Assign next action for Casey Reed' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.getBoundingClientRect().width <= window.innerWidth)).toBe(true);
  for (let index = 0; index < 14; index++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign next action for Casey Reed' })).toBeFocused();
  await workflow(page, 'Export handoff').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('portable HTML opens and exports a fictional example with no network', async ({ browser }) => {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(resolve('release/intake-repair-station.html')).href);
  await page.getByRole('button', { name: 'Try fictional example', exact: true }).first().click();
  await page.getByRole('button', { name: 'Open repair queue' }).click();
  await workflow(page, 'Export handoff').click();
  const result = await downloadBytes(page, page.getByRole('button', { name: 'Download handoff ZIP' }));
  const zip = unzipSync(result.bytes);
  expect(csvRows(zip, 'all-reviewed-rows.csv')).toHaveLength(13);
  expect(errors).toEqual([]);
  await context.close();
});
