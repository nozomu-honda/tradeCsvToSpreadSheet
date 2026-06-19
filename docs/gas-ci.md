# GAS CI

This repository is a Google Apps Script / V8 project. The PR test workflow uses a test-only Apps Script project, pushes the PR source to that project with clasp, then runs the GAS test entry points.

## Repository check

At implementation time:

- `appsscript.json` exists.
- `.clasp.json` existed and contained a concrete project binding. This PR removes it from source control, adds `.clasp.example.json`, and generates `.clasp.json` from GitHub Secrets during CI.
- No existing `.github/workflows/*` workflow was present.
- `runSmokeTests()` and `runAllTests()` are source-managed in `src/test/test_runner.gs`. They are not expected to live only in the Apps Script editor.

## Added workflow

`.github/workflows/gas-tests.yml` runs on `pull_request` events for `develop`:

- `opened`
- `synchronize`
- `reopened`
- `ready_for_review`

The workflow uses `pull_request`, not `pull_request_target`. Fork and external PRs are guarded with `github.event.pull_request.head.repo.full_name == github.repository`, so Google secrets are not loaded for outside contributors.

Same-repository PRs can use these secrets by design. Keep `CLASPRC_JSON` scoped to a low-privilege test account, and restrict who can push branches to this repository.

## Why clasp first

The first CI version uses clasp because it is the smallest path for this repository:

1. Generate `.clasprc.json` from `CLASPRC_JSON`.
2. Generate `.clasp.json` from `GAS_TEST_SCRIPT_ID`.
3. Verify that source-controlled `.gs` / `.js` files define `runSmokeTests()` and `runAllTests()`.
4. Inject `executionApi` into the CI runner copy of `appsscript.json` so only the test Apps Script project receives the API-executable manifest.
5. Run `clasp push --force` against the test-only Apps Script project.
6. Run `clasp create-deployment` to create or update the API executable deployment required by `scripts.run`.
7. Run `clasp run runSmokeTests` in clasp's default devMode, so it uses the latest pushed code.
8. Run `clasp run runAllTests` in clasp's default devMode, so it uses the latest pushed code.

If `CLASP_USER` is set, the workflow runs clasp as `clasp --user "$CLASP_USER" ...`. This supports `.clasprc.json` files created with `clasp login --user <ci-user>` while keeping the no-user default login flow supported too.

The CI intentionally does not pass `--nondev`. The default `clasp run` mode runs the latest saved script content; `--nondev` runs the deployed version and can report `Script function not found` even after the repository files were pushed to the test project.

The Apps Script API `scripts.run` path is still a reasonable later option, but it would still need a safe way to update the target script content first. For the initial PR, clasp keeps authentication and execution behavior closer to the existing Apps Script tooling.

## Required GitHub Secrets

- `CLASPRC_JSON`: the JSON content of the CI account's `~/.clasprc.json`.
- `GAS_TEST_SCRIPT_ID`: the Script ID of the test-only Apps Script project.

Optional:

- `CLASP_USER`: the clasp user name/email to pass through `clasp --user`. Set this when `CLASPRC_JSON` was generated with `clasp login --user <ci-user>`.
- `GAS_TEST_DEPLOYMENT_ID`: an existing API executable deployment ID for the test Apps Script project. If omitted, CI creates a new deployment in the test project for the run.
- `CLASP_PROJECT_JSON`: full `.clasp.json` content, only if the CI project needs custom clasp settings beyond `GAS_TEST_SCRIPT_ID`.
- `GOOGLE_OAUTH_CLIENT_SECRET_JSON`: not used by the first workflow. Keep this for a later Apps Script API implementation if needed.

Do not commit real OAuth tokens, Script IDs, deployment IDs, spreadsheet IDs, Drive folder IDs, or production database IDs. `.clasp.json` is intentionally ignored and generated in CI.

## Test project requirements

Use a dedicated Apps Script project for CI. The CI account should have access only to test spreadsheets, test Drive folders, and other disposable test resources. It must not have access to production DBs, production spreadsheets, or production Drive folders.

Before enabling the workflow:

1. Create or choose a test-only Apps Script project.
2. Enable the Apps Script API for the Google account used by CI.
3. Run `clasp login` locally with the CI/test account and store the generated `~/.clasprc.json` content in `CLASPRC_JSON`.
4. If that login used `clasp login --user <ci-user>`, store the same user in `CLASP_USER`. Alternatively, regenerate `CLASPRC_JSON` with a default, no-`--user` clasp login.
5. If `clasp run` reports `Unable to run script function`, regenerate `CLASPRC_JSON` with the project scopes from `appsscript.json`, for example `clasp login --user <ci-user> --use-project-scopes --include-clasp-scopes --creds client_secret.json` plus `CLASP_USER=<ci-user>`, or the equivalent no-`--user` login.
6. Store the test Apps Script project ID in `GAS_TEST_SCRIPT_ID`.
7. Optionally create an API executable deployment in the test project and store its deployment ID in `GAS_TEST_DEPLOYMENT_ID` to avoid creating a new deployment on each run.
8. Confirm that test helper configuration points only to test spreadsheets, test Drive folders, and other non-production resources.

`clasp push --force` updates the target Apps Script project content from the repository. The test runner and test helpers must live in source control; this PR uses `src/test/test_runner.gs` for `runSmokeTests()` and `runAllTests()`.

The repository manifest is not broadened for production just to make CI work. Instead, `scripts/ci/run-gas-tests.sh` injects `executionApi: { access: 'ANYONE' }` into the CI runner copy of `appsscript.json` before pushing to the test Apps Script project.

## Logs and failures

`scripts/ci/run-gas-tests.sh` groups the Actions log by function name and writes each function result to the GitHub step summary. If either `runSmokeTests` or `runAllTests` exits non-zero, reports `NG`, or reports an Apps Script exception, the workflow emits an error with the failed function name and the GitHub check fails.

The script also fails explicitly when:

- either test entry point is missing from source-controlled `.gs` / `.js` files before `clasp push --force`;
- `clasp push`, `clasp create-deployment`, or `clasp run` output contains `No credentials found`;
- `clasp run` output contains `Script function not found` after the push and deployment;
- `clasp run` output contains `Unable to run script function`, which means the tests were not actually executed; or
- GAS test output contains `NG`, `Exception:`, or `Error:` even when `clasp run` itself returns exit code 0.

## Manual GAS testing

Existing manual GAS testing can continue in the Apps Script editor. For local clasp use, create an untracked `.clasp.json` from `.clasp.example.json` and point it at the intended non-production project.

## Current status

This PR adds the workflow and wrapper script. `runSmokeTests()` and `runAllTests()` are source-managed through `src/test/test_runner.gs`, so CI does not depend on editor-only test functions.

Observed CI runs confirmed that `clasp push --force` pushed `src/test/test_runner.gs` and the rest of the source-managed test files to the test Apps Script project. The wrapper now fails explicitly if clasp says credentials are missing, a test function is missing, a test function cannot be executed, or the GAS test runner output reports failures.

If the next CI run reports `No credentials found`, set `CLASP_USER` when `CLASPRC_JSON` was generated with `clasp login --user`, or regenerate `CLASPRC_JSON` with a no-`--user` login. If it reports `Unable to run script function`, update `CLASPRC_JSON` with a clasp login that includes the manifest project scopes. If it reports `NG` test failures, the CI wiring is working and the remaining work is fixing the failing tests or their test-only resource setup.
