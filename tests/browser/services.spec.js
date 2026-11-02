import { test, expect } from '@playwright/test';
import { createCompanion } from '../../server/companion.mjs';
import { providersFromEnv } from '../../server/providers.mjs';

const OWNER_TOKEN = 'browser-test-access-token-32-characters-minimum';
const workflow = (page, name) => page.getByRole('navigation', { name: 'Workflow', exact: true }).getByRole('button', { name: new RegExp('^' + name + '(?:\\s|$)') });

test('optional services save explicitly, keep credentials out of backups, and reject stale AI suggestions', async ({ page }) => {
  const requests = [];
  let releaseProvider;
  let delayNext = false;
  const app = createCompanion({ ownerToken: OWNER_TOKEN, providerConfig: providersFromEnv({ OPENAI_API_KEY: 'never-in-browser-provider-key', OPENAI_MODEL: 'fixture-model' }),
    allowedOrigins: [new URL(process.env.TEST_BASE_URL || 'http://127.0.0.1:4173').origin],
    fetchImpl: async (_url, options) => {
      const prompt = JSON.parse(JSON.parse(options.body).messages[1].content);
      requests.push(prompt);
      if (delayNext) { delayNext = false; await new Promise(resolve => { releaseProvider = resolve; }); }
      const result = prompt.task === 'rules' ? { explanation: 'Require email and limit notes to 500 characters.', rules: [{ column: 'email', type: 'required' }, { column: 'notes', type: 'max_length', length: 500 }] }
        : prompt.task === 'handoff' ? { highlightFactIds: ['count-total', 'count-exceptions'] }
        : { explanation: 'Confirm the flagged source information.', nextAction: 'Ask the coordinator to confirm the source record.', evidenceRefs: [prompt.data.issues[0].id] };
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] }), { status: 200 });
    },
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try fictional example', exact: true }).first().click();
    await page.getByRole('button', { name: 'Open repair queue', exact: true }).click();
    await workflow(page, 'Saved workspaces').click();
    await page.getByLabel('Companion address', { exact: true }).fill(`http://127.0.0.1:${app.server.address().port}`);
    await page.getByLabel('Companion access token', { exact: true }).fill(OWNER_TOKEN);
    await page.getByRole('button', { name: 'Connect locally', exact: true }).click();
    await expect(page.getByText('Connected locally', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save as new workspace', exact: true })).toBeEnabled();
    assertNoSavedData();
    await page.getByLabel('Name a new saved workspace').fill('Browser test review');
    await page.getByRole('button', { name: 'Save as new workspace', exact: true }).click();
    await expect(page.getByText('Connected to Browser test review · version 1 · owner', { exact: true })).toBeVisible();
    const saved = app.store.listWorkspaces(app.store.authenticate(OWNER_TOKEN))[0];
    const stored = app.store.getWorkspace(app.store.authenticate(OWNER_TOKEN), saved.id);
    expect(stored.session.raw).toContain('Amara Ellis');
    expect(JSON.stringify(stored.session)).not.toContain(OWNER_TOKEN);
    expect(JSON.stringify(stored.session)).not.toContain('never-in-browser-provider-key');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(OWNER_TOKEN);

    await workflow(page, 'AI assistance').click();
    await page.getByLabel('What would help?').selectOption('handoff');
    const consent = page.getByRole('checkbox', { name: /^Use this displayed data/ });
    await consent.check();
    await page.getByRole('button', { name: 'Draft handoff summary', exact: true }).click();
    await expect(page.locator('.ir-summary-text')).toContainText('12 records retained');
    await expect(consent).not.toBeChecked();
    expect(JSON.stringify(requests[0])).not.toContain('amara.ellis@example.com');
    expect(JSON.stringify(requests[0])).not.toContain(OWNER_TOKEN);
    expect(await page.getByRole('button', { name: 'Download reviewed summary', exact: true }).isEnabled()).toBe(true);

    await page.getByLabel('What would help?').selectOption('rules');
    await page.getByLabel('What should these columns require?').fill('Require email and limit notes to 500 characters.');
    await consent.check();
    await page.getByRole('button', { name: 'Draft validation rules', exact: true }).click();
    await expect(page.locator('.ir-ai-result')).toContainText('notes · max length');
    await expect(consent).not.toBeChecked();
    expect(requests[1].data).toEqual({ headers: ['id', 'name', 'email', 'status', 'start_date', 'notes'], requirement: 'Require email and limit notes to 500 characters.' });

    await page.getByLabel('What would help?').selectOption('next_action');
    const row = page.getByLabel('Choose a record with an unresolved issue');
    await row.selectOption('row-4');
    await consent.check();
    await page.getByRole('checkbox', { name: /^Include this record/ }).check();
    await expect(consent).not.toBeChecked();
    await consent.check();
    delayNext = true;
    await page.getByRole('button', { name: 'Draft a next action', exact: true }).click();
    await expect.poll(() => Boolean(releaseProvider)).toBe(true);
    await row.selectOption('row-5');
    releaseProvider();
    await expect(page.getByRole('alert')).toContainText('workspace changed');
    await expect(page.getByRole('button', { name: 'Use as a next-action draft', exact: true })).toHaveCount(0);
  } finally { releaseProvider?.(); await app.close(); }

  function assertNoSavedData() {
    expect(app.store.listWorkspaces(app.store.authenticate(OWNER_TOKEN))).toEqual([]);
    expect(requests).toEqual([]);
  }
});
