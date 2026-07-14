# 本番反映GitHub Actions運用

Issue #83で追加する本番反映workflowの運用手順です。
本番Apps Scriptへのpush、既存Webアプリdeployment更新、本番状態追跡をGitHub Actionsへ寄せます。

Codexはこのworkflowの実行、GitHub Environment作成、Secrets / Variables変更、本番Apps Script操作、本番Webアプリ再デプロイを行いません。

## 起動経路

workflow: `.github/workflows/deploy-production.yml`

正式経路は、マージ済みPRへのラベル付与です。

| ラベル | 意味 |
| --- | --- |
| `deploy-production-dry-run` | `dry_run=true`、`dry_run_mode=authenticated`、本番操作なし |
| `deploy-production` | `dry_run=false`、通常の本番反映 |
| `deploy-production-force` | `dry_run=false`、`force=true`、同一SHA再反映 |

workflow開始時に起動ラベルは削除します。
同じラベルが残って意図せず再実行されることを避けるためです。

`workflow_dispatch` も残しますが、人間向けfallbackです。
ChatGPT側は原則としてラベル付与で起動します。

## default branchについて

このリポジトリのdefault branchは `main` です。
`issues:labeled` はdefault branch上のworkflow定義で評価されます。

そのため、ラベル起動を正式運用するには、次のどちらかを人間が確認・実施する必要があります。

- workflow定義をdefault branch `main` にも同期する。
- default branchを変更する必要があるかを判断する。

このPRではdefault branch変更や `main` への直接pushは行いません。
リリース元は引き続き `develop` です。workflowは常に信頼済みの最新 `develop` をcheckoutして実行します。

## ラベル起動時の検証

ラベルイベントはSecretsを使うproduction jobへ進む前に、Secretsなしの `resolve-production-target` jobで検証します。

検証内容:

- 対象がPull Requestである。
- 対象PRがmergedである。
- base branchが `develop` である。
- PRのmerge commit SHAが最新 `origin/develop` HEADと一致する。
- same repository PRである。
- fork PRではない。
- ラベル名が許可された3種類のいずれかである。
- PR番号とmerge commit SHAをGitHub APIから再取得する。
- Issue本文やPR本文の値は信頼しない。

不正なラベル、未マージPR、古いPR、fork PRではproduction jobへ進みません。

## dry-run

dry-runには2種類あります。

### Static dry-run

`dry_run=true`、`dry_run_mode=static`

本番Secretsなしで実行できます。

実行すること:

- 最新 `origin/develop` と `target_sha` の一致確認。
- required checks確認。
- `npm ci`。
- workflow / 状態model / renderer / parser / smoke / orchestratorのテスト。
- `.clasp.productionignore` の静的境界確認。
- Status Issue renderer preview。

実行しないこと:

- 本番clasp認証確認。
- `npm run gas:production:status`。
- 本番Apps Scriptへのpush。
- 既存Webアプリdeployment更新。
- Smoke Test。
- Production Status Issue更新。

### Authenticated dry-run

`dry_run=true`、`dry_run_mode=authenticated`

GitHub Environment `production` のSecrets / Variablesを使い、本番操作直前まで確認します。

実行すること:

- Static dry-runの確認。
- Production Status Issueのmarker確認。
- 同一SHA二重反映ガード。
- clasp named user `production` 認証確認。
- `npm run gas:production:status -- --json`。
- clasp実判定のTracked / Untracked解析。

実行しないこと:

- 本番Apps Scriptへのpush。
- 既存Webアプリdeployment更新。
- Smoke Test。
- Production Status Issue更新。

## 本番反映

`dry_run=false`

実行順:

1. ラベルまたはworkflow_dispatchの対象SHAを解決する。
2. required checksが成功していることを確認する。
3. `npm ci` とローカル検証を実行する。
4. Production Status Issueのmarkerを確認する。
5. `npm run gas:production:status -- --json` の実出力を解析する。
6. 本番push直前に `HEAD == origin/develop == targetSha` を再確認する。
7. `npm run gas:production:push` を実行する。
8. 既存Webアプリdeployment更新直前にもdevelopを再確認する。
9. source push後にdevelopが進んでいた場合は、すでにpushした同一SHAのdeployment updateとSmoke Testまで完遂し、Status Issueへ記録する。
10. `clasp deploy --deploymentId` で既存deploymentを更新する。
11. 本番Webアプリへ安全なHTTP Smoke Testを実行する。
12. Production Status Issueを `deployed` または `failed` へ更新する。

## required checks

最低限、次のcheckが成功していない場合は停止します。

```text
Push test GAS project and run tests
```

workflow_dispatchでは、target SHAに対応するmerged PRをGitHub APIから解決します。
ラベル起動では、ラベルが付いたmerged PRを正本として使います。

`PRODUCTION_REQUIRED_CHECKS` にカンマ区切りで追加check名を設定できます。
`neutral`、`queued`、`in_progress`、`failure`、`cancelled`、`timed_out`、`action_required` は成功扱いにしません。

## production status解析

`npm run gas:production:status -- --json` を使い、claspの実判定結果をJSONで解析します。

Trackedに含まれてはいけないもの:

- `src/test/**`
- `src/app/e2e_helpers.gs`

Trackedに含まれる必要があるもの:

- `src/app/e2e_runtime_support.gs`

空出力、解析不能、placeholder、認証エラー、Secretらしき値を含む出力は失敗扱いです。

## GitHub Deployment

GitHub Actions jobの `environment: production` を正本にします。
スクリプトからGitHub Deployment APIで追加deploymentを作成しません。

これにより、1回の本番反映でDeployment履歴が二重に作られることを避けます。
段階的な詳細状態はProduction Status Issueに記録します。

Environmentにrequired reviewersを設定した場合、ChatGPTから承認そのものはできない可能性があります。
承認が必要な場合は人間がGitHub上で確認・承認します。

## Production Status Issue

`PRODUCTION_STATUS_ISSUE_NUMBER` で指定する固定Issueには、必ず次のmarkerを含めます。

```html
<!-- production-status:managed-by-github-actions -->
```

読み取り時・更新時の必須条件:

- Issueが存在する。
- Pull Requestではない。
- Issueがopenである。
- titleが `Production Status` または `本番反映ステータス` を含む。
- 本文に管理markerがある。

markerがないIssueは絶対に上書きしません。

初回Issue本文テンプレート:

```markdown
# 本番反映ステータス

- 状態: `unknown`
- 本番commit: `unknown`
- 反映対象commit: `unknown`
- 最新develop: `unknown`
- developとの差分: `unknown`
- source push: `not-started`
- deployment update: `not-started`
- smoke test: `not-started`
- dry_run: `true`
- force: `false`
- source push後にdevelop進行: `false`
- 最終失敗ステージ: `none`
- 失敗内容: `none`
- 更新日時: `unknown`
- workflow run: unknown

<!-- production-status:managed-by-github-actions -->
```

## Smoke Test

本番DBやDriveを変更しないHTTP GETだけを行います。

制約:

- URLはHTTPS必須。
- 許可hostはApps Script系hostのみ。
  - `script.google.com`
  - `script.googleusercontent.com`
- timeoutは15秒。
- Googleログイン、OAuth同意、権限要求画面へredirectされた場合は失敗。
- content-typeはHTMLまたはJSONのみ成功候補。
- レスポンスにアプリ固有markerが必要。

既定marker:

```text
CSV / スプレッドシートから6シート生成
```

必要ならEnvironment Variable `PRODUCTION_SMOKE_EXPECTED_MARKER` で変更できます。

失敗扱いの例:

- `ReferenceError`
- `TypeError`
- `Script function not found`
- `Exception:`
- `Authorization is required`
- `You need permission`
- `Sign in`
- `Google Accounts`

## clasp deployの仕様確認

`@google/clasp@3.3.0` の `clasp deploy --help` と同梱READMEで次を確認済みです。

- `deploy --deploymentId <id>` は既存deploymentのredeploy用オプション。
- Deployはversionを作成してscriptをdeployする。
- Web appはdeploymentごとにURLを持つ。
- 既存deploymentを更新するにはdeployment IDを指定する。

このため、初期実装ではApps Script APIを直接叩かず、`clasp deploy --deploymentId` を使います。
fake claspによる引数確認は回帰テストで維持します。

## CLASP_PRODUCTION_CREDENTIALS

`@google/clasp@3.3.0` はnamed userを `.clasprc.json` の `tokens.<user>` に保存します。
`clasp --user production` を使うため、Secretは次の構造を含む必要があります。

```json
{
  "tokens": {
    "production": {
      "type": "authorized_user"
    }
  }
}
```

実際のtoken、client_id、client_secret、refresh_tokenは記載しません。
workflowではJSONのleaf値を個別にmaskし、複数行JSON全体をそのままworkflow commandへ渡しません。

## 初回設定

人間が実施します。

1. GitHub Environment `production` を作成する。
2. 必要ならEnvironment protection rulesを設定する。
3. Environment Secretsを設定する。
   - `CLASP_PRODUCTION_CREDENTIALS`
   - `PRODUCTION_SCRIPT_ID`
   - `PRODUCTION_DEPLOYMENT_ID`
4. Environment Variablesを設定する。
   - `PRODUCTION_WEB_APP_URL`
   - `PRODUCTION_STATUS_ISSUE_NUMBER`
   - 任意: `PRODUCTION_SMOKE_EXPECTED_MARKER`
   - 任意: `PRODUCTION_REQUIRED_CHECKS`
5. Production Status Issueをテンプレートで作成する。
6. default branch `main` でラベル起動workflowが有効になるか確認する。
7. まずStatic dry-runを実行する。
8. Secrets / Variables設定後にAuthenticated dry-runを実行する。

ラベルが存在しない場合は、人間がGitHub上で作成します。

## ChatGPT / Codex運用

ChatGPT側:

- マージ済みPRへ `deploy-production-dry-run` などのラベルを付けて起動する。
- dry-run結果を確認する。
- 必要に応じて人間へEnvironment承認を依頼する。

Codexが行わないこと:

- 本番反映workflowの実行。
- 本番ラベル付与。
- GitHub Environment作成。
- GitHub Secrets / Variables変更。
- 本番Apps Scriptへのpush。
- 本番Webアプリdeployment更新。
- 本番Smoke Test。
- Ruleset / default branch変更。
- PRのReady化やmerge。

## ローカル確認コマンド

```bash
npm ci
npm run test:gas-production-wrapper
npm run test:production-e2e-boundary
npm run test:production-deploy-workflow
npm run test:production-status-renderer
npm run test:production-deploy-state
npm run test:production-deploy-orchestrator
npm run test:production-status-parser
npm run test:production-smoke-test
git diff --check
```

本番反映そのものはローカルで実行しません。
