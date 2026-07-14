# 本番反映GitHub Actions運用

このドキュメントは、Issue #83で追加する本番反映用GitHub Actionsの運用手順です。
本番Apps Scriptへのpush、既存Webアプリdeployment更新、本番状態追跡を1つの手動workflowにまとめます。

Codexはこのworkflowの実行、GitHub Environment作成、Secrets / Variables変更、本番Apps Script操作、本番Webアプリ再デプロイを行いません。

## workflow概要

- workflow: `.github/workflows/deploy-production.yml`
- workflow名: `Deploy production`
- 起動方法: `workflow_dispatch`のみ
- 対象ブランチ: `develop`
- concurrency group: `production-deploy`
- GitHub Environment: `production`
- 既定値: `dry_run=true`
- 本番push、deployment更新、Production Status Issue更新は `dry_run=false` の時だけ行う。

このworkflowはPR、push、fork、`pull_request_target` では起動しません。
PRで実行するGAS Tests / Web E2Eとは別系統です。

## workflow inputs

| input | 既定値 | 意味 |
| --- | --- | --- |
| `dry_run` | `true` | `true`の場合、本番push、既存deployment更新、Status Issue更新を行わない |
| `force` | `false` | Status Issue上で同じcommitがすでに `deployed` の場合でも再反映する |
| `target_sha` | 空 | 空なら最新 `origin/develop`。指定時も最新 `origin/develop` と一致しない場合は停止する |

`target_sha` に古いcommitを指定して任意の過去版を本番反映する運用にはしません。

## GitHub Environment設定

人間がGitHub上で `production` Environmentを作成します。
必要に応じてEnvironment protection rulesで承認者や待機時間を設定します。

Environment Secrets:

- `CLASP_PRODUCTION_CREDENTIALS`
  - clasp named user `production` でログインした `.clasprc.json` 全体。
  - CI用の `CLASPRC_JSON` とは分ける。
- `PRODUCTION_SCRIPT_ID`
  - 本番Apps ScriptのScript ID。
- `PRODUCTION_DEPLOYMENT_ID`
  - 既存の本番Webアプリdeployment ID。

Environment Variables:

- `PRODUCTION_WEB_APP_URL`
  - 既存本番WebアプリURL。
  - workflowのEnvironment URLとsmoke testに使う。
- `PRODUCTION_STATUS_ISSUE_NUMBER`
  - 本番状態を追跡する固定Issue番号。

実値はIssue、PR、docs、ログへ貼りません。

## Production Status Issue

`PRODUCTION_STATUS_ISSUE_NUMBER` で指定した固定Issueへ、workflowが本番状態を書き込みます。

状態:

- `unknown`
- `not-deployed`
- `preflight`
- `source-pushed`
- `deployment-updated`
- `verifying`
- `deployed`
- `failed`

記録内容:

- 本番commit
- 反映対象commit
- 最新develop
- developとの差分
- source push結果
- deployment update結果
- smoke test結果
- 失敗ステージ
- workflow run URL

dry-runではStatus Issueを更新せず、Actions summaryにプレビューだけを出します。

## dry-run手順

1. Actionsの `Deploy production` を開く。
2. `develop` から起動する。
3. `dry_run=true`、`force=false`、`target_sha` 空で実行する。
4. Actions summaryとログを確認する。

dry-runで実行すること:

- 最新 `origin/develop` のcheckout。
- `target_sha` が最新 `origin/develop` と一致することの確認。
- 必須Secrets / Variablesが存在することの確認。
- Production Status Issueの既存状態読み取り。
- 同一commit二重反映ガード。
- `npm ci`。
- 本番wrapper / 本番bundle境界 / workflow / status renderer / state modelのテスト。
- `npm run gas:production:status`。
- `.clasp.productionignore` に `src/test/**` と `src/app/e2e_helpers.gs` があることの確認。
- smoke test用URL設定の存在確認。
- dry-run summary作成。

dry-runで実行しないこと:

- `npm run gas:production:push`。
- 既存Webアプリdeployment更新。
- GitHub Deployment作成。
- Production Status Issue更新。
- 本番WebアプリへのHTTP smoke test。

## 本番反映手順

dry-runが成功し、Environment protectionの承認条件を満たした後に実行します。

1. Actionsの `Deploy production` を開く。
2. `develop` から起動する。
3. `dry_run=false`、通常は `force=false`、`target_sha` 空で実行する。
4. Environment承認が必要な場合は、人間が内容を確認して承認する。
5. workflow完了後、Production Status IssueとGitHub Deploymentsを確認する。

本番反映で実行すること:

1. dry-runと同じpreflight。
2. GitHub Deployment APIで `production` deploymentを作成。
3. `npm run gas:production:push` で本番Apps Scriptへソースをpush。
4. `clasp deploy --deploymentId` で既存Webアプリdeploymentを新バージョンへ更新。
5. 本番WebアプリURLへ安全なHTTP smoke testを実行。
6. Production Status Issueを `deployed` または `failed` へ更新。
7. GitHub Deployment statusを成功または失敗へ更新。

## deployment更新方法

最初の実装では、Apps Script APIを直接叩かず、`@google/clasp@3.3.0` の `deploy --deploymentId` を使います。

理由:

- 既存の本番反映wrapperがclasp named user `production` を前提にしている。
- `--deploymentId` で既存deploymentを更新でき、既存WebアプリURLを維持できる。
- 追加のOAuthクライアント処理やApps Script API用の独自実装を増やさずに済む。
- `npm run gas:production:push` と同じ認証境界で扱える。

後続でApps Script APIへ移行する場合も、既存deployment IDを更新し、WebアプリURLを変えない方針は維持します。

## smoke test

smoke testは本番DBやDriveを変更しないHTTP GETだけに限定します。

確認すること:

- HTTP statusが2xxまたは3xxである。
- レスポンスが空でない。
- `ReferenceError`、`Script function not found`、`Exception:` のようなApps Scriptエラー印が含まれない。

Google認証やアクセス制限でHTTP GETが通らない設定の場合、smoke testは安全側で失敗します。
その場合は、公開範囲または認証済みsmoke test方法を別Issueで設計します。

## forceの使い方

Production Status Issueに同じcommitが `deployed` と記録されている場合、通常は二重反映を停止します。
同じcommitを意図的に再反映する必要がある場合だけ `force=true` を指定します。

例:

- Deployment更新だけをやり直したい。
- Status Issueの記録と実状態のずれを復旧したい。

`force=true` は、本番操作を省略するための設定ではありません。

## 失敗時の扱い

失敗時は次を記録します。

- 失敗ステージ
- 失敗内容の要約
- workflow run URL
- GitHub Deployment status
- Production Status Issue

失敗ステージ例:

- `preflight`
- `local-validation`
- `production-status`
- `source-push`
- `deployment-update`
- `smoke-test`

Secret、Script ID、Deployment ID、Web App URLの実値はログへ出さないようmaskします。

## Secret rotation

本番運用アカウント、clasp認証、Script ID、Deployment ID、Web App URLを変更した場合は、人間がGitHub EnvironmentのSecrets / Variablesを更新します。
更新後は必ず `dry_run=true` で確認してから本番反映します。

## ChatGPT / Codex運用

ChatGPT側で行うこと:

- 必要に応じてworkflowを手動実行する。
- dry-run結果を確認する。
- Environment承認を判断する。
- 本番反映後にProduction Status IssueとGitHub Deploymentsを確認する。

Codexが行わないこと:

- `Deploy production` workflowの実行。
- GitHub Environment作成。
- GitHub Secrets / Variables変更。
- 本番Apps Scriptへのpush。
- 本番Webアプリdeployment更新。
- 本番Webアプリsmoke test実行。
- Ruleset / branch protection変更。

## 関連コマンド

ローカルで実装を検証する場合:

```bash
npm ci
npm run test:gas-production-wrapper
npm run test:production-e2e-boundary
npm run test:production-deploy-workflow
npm run test:production-status-renderer
npm run test:production-deploy-state
git diff --check
```

本番反映そのものはローカルで実行しません。
