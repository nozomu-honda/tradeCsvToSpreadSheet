# GAS CI

This repository is a Google Apps Script / V8 project. The GAS CI workflow pushes source to a test-only Apps Script project with clasp, then runs the GAS test entry points.

## Goal

The workflow is intended to protect `develop` without running expensive GAS tests on every commit during normal development.

The current policy is:

- do not run GAS tests on every `synchronize` push;
- run GAS tests when a draft PR is marked ready for review;
- allow a manual final run with `workflow_dispatch`;
- support GitHub merge queue with `merge_group` for automatic pre-merge validation; and
- keep the required check present while skipping the heavy GAS execution for docs-only / Markdown-only changes.

## Workflow

`.github/workflows/gas-tests.yml` runs for `develop` on:

- `pull_request` `ready_for_review`
- `pull_request` `reopened`
- `workflow_dispatch`
- `merge_group`

It intentionally does not run on `pull_request` `synchronize`. This keeps GAS tests from running on every commit pushed to a PR branch.

## Required Check Behavior

The required check name remains:

- `Push test GAS project and run tests`

Keep this as the required status check in the `develop` branch ruleset.

If a PR receives new commits after the last successful GAS run, GitHub may require the check to pass again on the new head commit before merge. In that case, run the workflow manually from the branch, or use merge queue so GitHub runs the final `merge_group` validation automatically.

## Recommended Merge Flow

### Without Merge Queue

1. Develop normally without running GAS tests on every commit.
2. When the PR is ready, mark it ready for review if it is a draft.
3. If more commits are pushed after that, run `GAS Tests` manually with `workflow_dispatch` on the PR branch.
4. Merge only after `Push test GAS project and run tests` is green.

### With Merge Queue

For the closest "run once immediately before merge" behavior, enable GitHub merge queue for `develop` in the branch ruleset. This workflow supports the `merge_group` event.

With merge queue enabled:

1. PR development does not run GAS tests on every commit.
2. When the PR enters the merge queue, GitHub creates a merge group.
3. `GAS Tests` runs against that merge group.
4. `develop` is updated only if the required check passes.

This is the safest automatic mode because the test runs against the actual merge candidate.

## Docs-Only Changes

The workflow starts so the required check can complete, but it skips the heavy GAS execution when all changed files are under `docs/` or are Markdown files.

Examples that skip GAS execution:

- `docs/gas-ci.md`
- `README.md`
- `docs/**/*.png`

Examples that still run GAS tests:

- `src/**`
- `scripts/**`
- `.github/workflows/**`
- `appsscript.json`
- `Index.html`
- `.claspignore`
- `.clasp.example.json`

Do not use `paths-ignore` for docs-only changes while this workflow is a required check. If the workflow is skipped entirely, GitHub can leave the required check pending and block merge.

## Security Notes

- The workflow uses `pull_request`, not `pull_request_target`.
- Fork and external PRs skip the secret-backed GAS job.
- `workflow_dispatch` and `merge_group` run in the base repository context and can use repository secrets.
- CI targets only a test Apps Script project.
- `.clasp.json` and `.clasprc.json` are generated from GitHub Secrets and are not committed.
- The workflow injects `executionApi` only into the CI runner copy of `appsscript.json` before pushing to the test project.
- The CI Google account should be low-privilege and limited to test-only Apps Script, Spreadsheet, and Drive resources.

## Required GitHub Secrets

Required:

- `CLASPRC_JSON`: the JSON content of the CI account's `~/.clasprc.json`.
- `GAS_TEST_SCRIPT_ID`: the Script ID of the test-only Apps Script project.

Optional:

- `CLASP_USER`: the clasp user name/email to pass through `clasp --user`. Set this when `CLASPRC_JSON` was generated with `clasp login --user <ci-user>`.
- `GAS_TEST_DEPLOYMENT_ID`: an existing API executable deployment ID for the test Apps Script project. If omitted, CI creates a new deployment in the test project for the run.
- `CLASP_PROJECT_JSON`: full `.clasp.json` content, only if the CI project needs custom clasp settings beyond `GAS_TEST_SCRIPT_ID`.
- `GOOGLE_OAUTH_CLIENT_SECRET_JSON`: not used by the current clasp workflow. Keep this for a later Apps Script API implementation if needed.

Do not commit real OAuth tokens, Script IDs, deployment IDs, spreadsheet IDs, Drive folder IDs, or production database IDs.

## Execution Flow

When GAS execution is required, the workflow:

1. Generates `~/.clasprc.json` from `CLASPRC_JSON`.
2. Generates `.clasp.json` from `GAS_TEST_SCRIPT_ID`, unless `CLASP_PROJECT_JSON` is supplied.
3. Runs clasp as `clasp --user "$CLASP_USER" ...` when `CLASP_USER` is set.
4. Verifies that source-controlled `.gs` / `.js` files define `runSmokeTests()` and `runAllTests()`.
5. Injects `executionApi: { access: 'ANYONE' }` into the CI runner copy of `appsscript.json`.
6. Runs `clasp push --force` against the test-only Apps Script project.
7. Creates or updates the API executable deployment.
8. Runs `clasp run runSmokeTests` and `clasp run runAllTests` in clasp's default devMode, using the latest pushed code.

## Logs and Failures

`scripts/ci/run-gas-tests.sh` groups the Actions log by function name and writes each function result to the GitHub step summary.

The workflow fails explicitly when:

- either test entry point is missing from source-controlled `.gs` / `.js` files;
- `clasp push`, `clasp create-deployment`, or `clasp run` output contains `No credentials found`;
- `clasp run` output contains `Script function not found`;
- `clasp run` output contains `Unable to run script function`; or
- GAS test output contains `NG`, `Exception:`, or `Error:` even when `clasp run` exits 0.

## Manual GAS Testing

Existing manual GAS testing can continue in the Apps Script editor. For local clasp use, create an untracked `.clasp.json` from `.clasp.example.json` and point it at the intended non-production project.
