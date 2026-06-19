# GAS CI

このリポジトリは Google Apps Script / V8 のプロジェクトです。GAS CI は、GitHub Actions からテスト専用 Apps Script プロジェクトへ clasp でソースを反映し、GAS 上の `runSmokeTests` / `runAllTests` を実行します。

## 目的

個人アカウント所有の公開リポジトリでは GitHub Merge Queue を利用できないため、マージ直前の最終確認は `run-gas-tests` ラベルで明示的に起動します。

現在の方針は次のとおりです。

- PR作成時には重いGASテストを実行しない。
- PRブランチへのpushごとには重いGASテストを実行しない。
- 最終レビュー後に `run-gas-tests` ラベルを付けた時だけGAS CIを起動する。
- docs-only / Markdown-only / GASに影響しない変更では、workflow jobは成功させつつ重いGAS実行をスキップする。
- テスト成功後に追加コミットした場合は、`run-gas-tests` ラベルを外して再度付けることで新しいheadに対して再実行する。
- `pull_request_target` は使わない。
- forkや外部PRにはGoogle Secretsを渡さない。

## Workflow

`.github/workflows/gas-tests.yml` は `develop` 向けPRの次のイベントだけで起動します。

- `pull_request` `labeled`

対象ラベルは次の1つです。

- `run-gas-tests`

`opened`、`synchronize`、`reopened`、`ready_for_review`、`workflow_dispatch`、`merge_group` では起動しません。

## 推奨マージフロー

1. 実装を完了する。
2. 最終レビューを行う。
3. PRに `run-gas-tests` ラベルを付ける。
4. `Push test GAS project and run tests` が成功することを確認する。
5. 以降コード変更せずにマージする。

テスト成功後に追加コミットした場合は、古い成功結果を使わず、`run-gas-tests` ラベルを一度外してから再度付けてください。これにより、新しいPR headでGAS CIを再実行できます。

## Required Check

required check 名は次のまま維持します。

- `Push test GAS project and run tests`

`develop` のrulesetでは、このcheckを必須にしてください。

`run-gas-tests` 以外のラベルでworkflowが起動した場合、このcheckは冒頭で失敗します。これは、別ラベル追加によるskipped/success扱いでrequired checkが誤って通るのを避けるためです。

## GAS実行対象の判定

`run-gas-tests` ラベルが付いた場合でも、すべての変更でGASを実行するわけではありません。workflow内で `develop` との差分を確認し、次のようなGAS影響ファイルがある場合だけ `clasp push --force` と `runSmokeTests` / `runAllTests` を実行します。

- `src/**`
- `scripts/**`
- `.github/workflows/**`
- `appsscript.json`
- `Index.html`
- `.claspignore`
- `.clasp.example.json`
- `package.json`
- `package-lock.json`

次のような変更だけの場合、workflow jobは成功しますが、重いGAS実行はスキップします。

- `docs/**`
- `*.md`
- GASコード、CIスクリプト、workflow、設定に影響しないファイル

`paths-ignore` は使いません。workflow自体をスキップすると、required check が pending のままになりマージをブロックすることがあるためです。

## セキュリティ

- workflowは `pull_request` を使い、`pull_request_target` は使いません。
- `run-gas-tests` ラベルが付いた同一リポジトリPRだけがsecret-backed GAS jobに進めます。
- forkや外部PRでは冒頭のガードで失敗し、Google Secretsを使うstepへ進みません。
- CIの対象はテスト専用 Apps Script プロジェクトだけです。
- `.clasp.json` と `.clasprc.json` はGitHub Secretsから生成し、リポジトリにはコミットしません。
- workflowはCI runner上の `appsscript.json` にだけ `executionApi` を注入してから、テスト専用Apps Scriptへpushします。
- CI用Googleアカウントには、本番GAS、本番Spreadsheet、本番Driveフォルダへの権限を持たせないでください。

## 必要なGitHub Secrets

必須:

- `CLASPRC_JSON`: CIアカウントの `~/.clasprc.json` のJSON内容。
- `GAS_TEST_SCRIPT_ID`: テスト専用 Apps Script プロジェクトのScript ID。

任意:

- `CLASP_USER`: `clasp --user` に渡すユーザー名またはメールアドレス。`CLASPRC_JSON` を `clasp login --user <ci-user>` で生成した場合に設定します。
- `GAS_TEST_DEPLOYMENT_ID`: テスト専用 Apps Script プロジェクトの既存API executable deployment ID。未設定の場合、CIが実行時にdeploymentを作成します。
- `CLASP_PROJECT_JSON`: `GAS_TEST_SCRIPT_ID` だけでは足りないclasp設定が必要な場合の `.clasp.json` 全体。
- `GOOGLE_OAUTH_CLIENT_SECRET_JSON`: 現在のclaspベースworkflowでは未使用です。将来 Apps Script API ベースへ移行する場合の候補として残します。

OAuth token、Script ID、deployment ID、Spreadsheet ID、Drive folder ID、本番DB IDなどの実値はコミットしないでください。

## 実行内容

GAS実行対象と判定された場合、workflowは次を行います。

1. `CLASPRC_JSON` から `~/.clasprc.json` を生成する。
2. `GAS_TEST_SCRIPT_ID` から `.clasp.json` を生成する。`CLASP_PROJECT_JSON` がある場合はそちらを使う。
3. `CLASP_USER` がある場合は `clasp --user "$CLASP_USER" ...` として実行する。
4. ソース管理された `.gs` / `.js` ファイル内に `runSmokeTests()` と `runAllTests()` が存在することを確認する。
5. CI runner上の `appsscript.json` に `executionApi: { access: 'ANYONE' }` を注入する。
6. テスト専用 Apps Script プロジェクトへ `clasp push --force` する。
7. API executable deployment を作成または更新する。
8. 最新のpush済みコードに対して `clasp run runSmokeTests` と `clasp run runAllTests` を実行する。

## ログと失敗判定

`scripts/ci/run-gas-tests.sh` は、GitHub Actionsログを関数名ごとにgroup化し、各関数の結果をGitHub step summaryへ書きます。

workflowは次の場合に明示的に失敗します。

- `run-gas-tests` 以外のラベルで起動された。
- forkまたは外部PRで `run-gas-tests` ラベルが付いた。
- ソース管理された `.gs` / `.js` ファイル内に `runSmokeTests()` または `runAllTests()` がない。
- `clasp push`、`clasp create-deployment`、`clasp run` の出力に `No credentials found` が含まれる。
- `clasp run` の出力に `Script function not found` が含まれる。
- `clasp run` の出力に `Unable to run script function` が含まれる。
- GASテスト出力に `NG`、`Exception:`、`Error:` が含まれる。

つまり、GAS側の `runSmokeTests` / `runAllTests` の実結果が失敗した場合、GitHub Actionsのcheckも失敗します。

## 手動GASテスト

既存のApps Scriptエディタ上での手動テスト運用は残します。ローカルでclaspを使う場合は、未追跡の `.clasp.json` を `.clasp.example.json` から作成し、必ず非本番のApps Scriptプロジェクトを指定してください。
