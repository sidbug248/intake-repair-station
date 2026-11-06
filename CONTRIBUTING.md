# Contributing to Relay Station

Relay Station by Eternity Flux helps people review incoming information and give unfinished work a clear owner. Small improvements are welcome, especially understandable issue explanations, reproducible parser fixes, easier keyboard interaction, and handoffs a recipient can read without learning the app.

## Start with a concrete example

For a bug report, describe what you tried, what happened, and what you expected. Include your browser and a small fictional CSV that reproduces the problem. Use addresses such as `person@example.com`.

Do not upload a real participant list, session backup, access token, or screenshot containing personal information. A few invented rows are usually enough to explain the issue.

For a larger feature, open an issue explaining who needs it and the difficult step it would improve. This helps keep the project focused and avoids building a complicated workflow before its purpose is clear.

## Develop and check your change

Follow the [README](README.md#run-from-source) to install and run the app. Keep a change focused enough that someone else can understand and review it.

- Run `npm test` when changing parsing, validation, corrections, exports, or saved sessions. Add a regression case for a real behavior or failure mode.
- Run `npm run build` before submitting a code change.
- For an interaction change, try the affected workflow in a browser, including keyboard use. Describe what you checked in the pull request.
- Update the relevant documentation when changing an input rule, exported field, or product limit.

The browser suite uses Playwright and Chromium. Install its browser with `npx playwright install chromium`, then run `npm run build` and `npm run test:e2e`. The test configuration starts its own local preview server. On Linux, `npx playwright install --with-deps chromium` can also install missing system libraries.

You do not need to write tests that simply repeat a label or a style value. Checks should protect behavior that could break a user's work.

## Behaviors to preserve

The source remains intact. Every row remains accounted for. Proposed corrections require review. Ambiguous data stays unresolved until someone confirms it. Assigning a follow-up does not change the underlying record.

Keep Start, Needs attention, What changed, and Handoff focused on those jobs. Preserve access to advanced controls without making the fictional example depend on configuration. A new capability should make a concrete task easier rather than add another required setup screen.

The product rename preserves legacy saved-session identifiers, companion settings, and license notices. Do not replace a protocol string or private storage path solely because it uses the earlier name. Check compatibility first.

Read [Architecture](docs/ARCHITECTURE.md) for the data model and [CSV format](docs/CSV_FORMAT.md) for input and export details.

## Submit a pull request

Explain the problem, the change, and the resulting behavior. Include a before-and-after example when it helps. State which checks you ran and any remaining limitation; do not claim verification you have not performed.

Contributions are made under the project's [MIT License](LICENSE). Keep existing copyright and license notices, and identify new dependencies and their licenses. After changing a runtime dependency, run `npm run notices` and review the generated [Third-party notices](THIRD_PARTY_NOTICES.md) alongside the lockfile changes.

For a security-sensitive issue, follow [Security](SECURITY.md) instead of posting exploit details in a public issue.
