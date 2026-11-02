# Release-candidate validation

Verified on 2026-11-02 UTC for the initial 0.1.0 development release.

## Results

| Gate | Result |
| --- | --- |
| Core CSV and coordination tests | 30 passed |
| Production build | Passed |
| Browser workflow tests | 7 passed |
| Offline HTML | Opened and exported with browser networking disabled |
| Automated accessibility | No detected WCAG A/AA violations in the tested views |
| Mobile layout and keyboard | 390px viewport fits; dialog focus cycles and Escape returns focus |

The browser suite exercised a UTF-8 CSV with a BOM, CRLF line endings, mapped
headers, leading-zero IDs, a multiline field, spreadsheet-like content, and
unresolved email/date issues. It uploaded the file, saved a waiting next action,
staged and approved formatting corrections, downloaded the handoff ZIP, and
restored the included JSON into a separate browser context.

The ZIP retained the original CSV **byte for byte**. Four input records became
three ready rows and one exception; no records disappeared. The restored session
regenerated identical original, clean, exception, reviewed-row, change-log, and
assignment files. Formula protection was verified in the generated clean CSV.
No unexpected external application requests were observed during this workflow.

Other browser cases covered lost-draft prevention, approval invalidation after a
value changes, undo, rejected imports/backups, opt-in persistence and clearing,
oversized pasted input, and an offline fictional-example export.

Accessibility checks covered mapping, the queue before and after an assignment,
assignment and correction dialogs, formatting suggestions, staged and approved
reviews, export, and activity. Automated checks complement human review; they do
not constitute an accessibility certification or a substitute for assistive
technology testing.

## Reproduce

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The recorded local run used Node.js 24.22.1 and Chromium 153.0.8010.0. The Playwright
suite normally uses its managed Chromium. A separately installed browser can be
selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when required by a test environment.

The CI workflow repeats the core tests, build, offline packaging, and browser
suite. A local pass does not assert that a remote workflow or deployment passed;
inspect the relevant commit's checks separately.

## Deliberate limits

This is a single-browser workflow for small CSV files. It has not been tested as
a multi-user service and makes no claims about authenticated actor identities,
delivery of emails, source accuracy, or compatibility with every spreadsheet or
CRM importer. The activity history is local and editable, not tamper-proof.
See [CSV format](CSV_FORMAT.md) and [Architecture](ARCHITECTURE.md) for the full
input contract and boundaries.
