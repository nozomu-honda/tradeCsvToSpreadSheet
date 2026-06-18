# GAS CI

This repository is a Google Apps Script / V8 project. The PR test workflow uses a test-only Apps Script project, pushes the PR source to that project with clasp, then runs the GAS test entry points.

## Repository check

At implementation time:

- `appsscript.json` exists.
- `.clasp.json` existed and contained a concrete project binding. This PR removes it from source control, adds `.clasp.example.json`, and generates `.clasp.json` from GitHub Secrets during CI.
- No existing `.github/workflows/*` workflow was present.

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
3. Run `clasp push --force` against the test-only Apps Script project.
4. Run `clasp run runSmokeTests`.
5. Run `clasp run runAllTests`.

The Apps Script API `scripts.run` path is still a reasonable later option, but it would still need a safe way to update the target script content first. For the initial PR, clasp keeps authentication and execution behavior closer to the existing Apps Script tooling.

## Required GitHub Secrets

- `CLASPRC_JSON`: the JSON content of the CI account's `~/.clasprc.json`.
- `GAS_TEST_SCRIPT_ID`: the Script ID of the test-only Apps Script project.

Optional:

- `CLASP_PROJECT_JSON`: full `.clasp.json` content, only if the CI project needs custom clasp settings beyond `GAS_TEST_SCRIPT_ID`.
- `GOOGLE_OAUTH_CLIENT_SECRET_JSON`: not used by the first workflow. Keep this for a later Apps Script API implementation if needed.

Do not commit real OAuth tokens, Script IDs, spreadsheet IDs, Drive folder IDs, or production database IDs. `.clasp.json` is intentionally ignored and generated in CI.

## Test project requirements

Use a dedicated Apps Script project for CI. The CI account should have access only to test spreadsheets, test Drive folders, and other disposable test resources. It must not have access to production DBs, production spreadsheets, or production Drive folders.

Before enabling the workflow:

1. Create or choose a test-only Apps Script project.
2. Enable the Apps Script API for the Google account used by CI.
3. Run `clasp login` locally with the CI/test account and store the generated `~/.clasprc.json` content in `CLASPRC_JSON`.
4. Store the test Apps Script project ID in `GAS_TEST_SCRIPT_ID`.
5. Confirm that `runSmokeTests` and `runAllTests` are available after the repository source is pushed to the test project.
6. Confirm that those test functions use only test spreadsheets, test Drive folders, and other non-production resources.

`clasp push --force` updates the target Apps Script project content. If test-only helper files currently exist only in the Apps Script editor, move them into source control or provide a safe follow-up strategy before requiring this workflow.

## Logs and failures

`scripts/ci/run-gas-tests.sh` groups the Actions log by function name and writes each function result to the GitHub step summary. If either `runSmokeTests` or `runAllTests` exits non-zero, the workflow emits an error with the failed function name and the GitHub check fails.

## Manual GAS testing

Existing manual GAS testing can continue in the Apps Script editor. For local clasp use, create an untracked `.clasp.json` from `.clasp.example.json` and point it at the intended non-production project.

## Current status

This PR adds the workflow and wrapper script, but the local checkout does not contain GitHub Secrets or access to the test Apps Script project. The first real `clasp push` and `clasp run` results must be verified after `CLASPRC_JSON` and `GAS_TEST_SCRIPT_ID` are configured in GitHub.
