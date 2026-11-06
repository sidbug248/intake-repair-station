import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDataset, sessionSnapshot } from '../../src/lib/intake.mjs';

const SOURCE = 'id,name,email,status,start_date\n001,Amara Stone,amara@example.org,active,2026-11-01\n002,Casey Reed,,pending,2026-11-02\n';
const nav = (page, name) => page.getByRole('navigation', { name: 'Workflow', exact: true }).getByRole('button', { name: new RegExp('^' + name + '(?:\\s|$)') });

async function openSource(page) {
  await page.goto('/');
  await page.getByLabel('Choose intake CSV, TSV or Excel', { exact: true }).setInputFiles({ name: 'partner-list.csv', mimeType: 'text/csv', buffer: Buffer.from(SOURCE) });
  await page.getByRole('button', { name: 'Inspect CSV', exact: true }).click();
  await page.getByRole('button', { name: 'Open review', exact: true }).click();
}

test('a fresh start presents four main places and opens practice directly into issue cards', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Relay Station by Eternity Flux');
  await expect(page.getByRole('navigation', { name: 'Workflow', exact: true }).getByRole('button')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Import recipes', exact: true })).not.toBeVisible();
  await expect(page.getByLabel('Or paste your CSV')).not.toBeVisible();
  await page.getByRole('button', { name: 'Try fictional example', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What needs a decision?' })).toBeVisible();
  await expect(page.locator('.ir-issue-card').first()).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Confirm column mapping.' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Table view', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: 'Issue cards', exact: true }).click();
  await expect(page.locator('.ir-issue-card').first()).toBeVisible();
});

test('unfinished next actions remain visible even when values pass checks, and completion does not erase a data question', async ({ page }) => {
  await openSource(page);
  await page.getByRole('button', { name: 'All records', exact: true }).click();
  await page.getByRole('button', { name: 'Plan next action for Amara Stone', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Owner/ }).fill('Morgan');
  await dialog.getByRole('textbox', { name: /^Next action/ }).fill('Confirm the orientation time with the coordinator.');
  await dialog.getByRole('button', { name: 'Save next action', exact: true }).click();
  await page.getByRole('button', { name: 'Needs attention', exact: true }).click();
  await expect(page.locator('.ir-issue-card')).toHaveCount(2);
  await expect(page.locator('.ir-issue-card').filter({ hasText: 'Amara Stone' })).toContainText('A next step is still open.');
  await page.getByRole('button', { name: 'Plan next action for Casey Reed', exact: true }).click();
  await dialog.getByRole('textbox', { name: /^Owner/ }).fill('Taylor');
  await dialog.getByRole('textbox', { name: /^Next action/ }).fill('Check the source list; the email is still unavailable.');
  await dialog.getByRole('combobox', { name: 'Action status', exact: true }).selectOption('done');
  await dialog.getByRole('button', { name: 'Save next action', exact: true }).click();
  await expect(page.locator('.ir-issue-card').filter({ hasText: 'Casey Reed' })).toContainText('Action complete');
  await expect(page.locator('.ir-issue-card').filter({ hasText: 'Casey Reed' })).toContainText('Missing email');
  await nav(page, 'Handoff').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download readable handoff', exact: true }).click();
  const downloaded = await downloadPromise;
  expect(downloaded.suggestedFilename()).toBe('partner-list-handoff.html');
  const html = await readFile(await downloaded.path(), 'utf8');
  expect(html).toContain('Confirm the orientation time');
  expect(html).toContain('The action is marked complete. The information still needs attention.');
  expect(html).toContain('Amara Stone');
  expect(html).toContain('Casey Reed');
});

test('the readable report is blocked by pending corrections and becomes available after approval', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try fictional example', exact: true }).click();
  await page.getByRole('button', { name: /^Preview formatting/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Stage \d+ suggestions$/ }).click();
  await nav(page, 'Handoff').click();
  await expect(page.getByRole('button', { name: 'Download readable handoff', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download handoff ZIP', exact: true })).toBeDisabled();
  await nav(page, 'What changed').click();
  await page.getByRole('button', { name: /^Approve all \d+ pending changes$/ }).click();
  await nav(page, 'Handoff').click();
  await expect(page.getByRole('button', { name: 'Download readable handoff', exact: true })).toBeEnabled();
});

test('trying the example cannot silently replace a current workspace', async ({ page }) => {
  await openSource(page);
  await nav(page, 'Start').click();
  await page.getByRole('button', { name: 'Paste CSV instead', exact: true }).click();
  await page.getByRole('button', { name: 'Try fictional example', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Open the fictional example?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep working', exact: true }).click();
  await nav(page, 'Needs attention').click();
  await expect(page.locator('.ir-table-footer')).toContainText('partner-list.csv');
  await expect(page.locator('.ir-issue-card')).toHaveCount(1);
});

test('an earlier browser save still restores under the Relay Station name', async ({ page }) => {
  const snapshot = sessionSnapshot(createDataset(SOURCE, 'earlier-work.csv'), {});
  await page.addInitScript(value => localStorage.setItem('intake-repair-station-session-v1', JSON.stringify(value)), snapshot);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continue your workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue your workspace', exact: true }).click();
  await expect(page.locator('.ir-table-footer')).toContainText('earlier-work.csv');
  await expect(page.locator('.ir-issue-card')).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: 'Remember on this device', exact: true })).toBeChecked();
});
