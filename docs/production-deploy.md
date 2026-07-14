# 本番反映GitHub Actions運用

Issue #83で追加する本番反映workflowの運用手順です。
本番Apps Scriptへのpush、既存Webアプリdeployment更新、本番状態追跡をGitHub Actionsへ寄せます。

Codexはこのworkflowの実行、GitHub Environment作成、Secrets / Variables変更、本番Apps Script操作、本番Webアプリ再デプロイを行いません。
default branch `main` へのcontrol workflow同期メモは [`docs/production-deploy-control.md`](production-deploy-control.md) を参照します。
PR #84はIssue #83の一部対応です。main同期、初回設定、authenticated dry-run、初回本番反映、本番状態追跡の実動作確認が終わるまでIssue #83はopenのままにします。

## 起動経路

本番反映は2段構成です。

- control workflow: `.github/workflows/production-deploy-control.yml`
  - default branch `main` 上でPRラベルを受ける。
  - `pull_request_target: labeled` で起動するが、PR headはcheckoutしない。
  - 本番Secrets、production Environment、clasp操作は使わない。
  - 条件を満たした場合だけ、`deploy-production.yml` を `ref: develop` でworkflow_dispatchする。
- deploy workflow: `.github/workflows/deploy-production.yml`
  - `workflow_dispatch` だけで起動する。
  - 信頼済みの最新 `develop` をcheckoutする。
  - `HEAD == origin/develop == target_sha` を満たす場合だけ、本番反映処理へ進む。

正式経路は、developへマージ済みPRへのラベル付与です。

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
PRラベルを契機にするworkflowは、default branch上のworkflow定義で評価されます。

そのため、PR #84をdevelopへマージしただけでは、ラベル起動経路はまだ有効になりません。
正式運用するには、少なくとも次のworkflow定義をdefault branch `main` へ同期する後続対応が必要です。

- `.github/workflows/production-deploy-control.yml`
- `.github/workflows/deploy-production.yml`

このPRではdefault branch変更や `main` への直接pushは行いません。
リリース元は引き続き `develop` です。
control workflowは `deploy-production.yml` を `ref: develop` でdispatchするため、GitHub Environment Deploymentの対象SHAはcontrol workflowが動く `main` のSHAではなく、実際の反映対象である `develop` のSHAになります。

## ラベル起動時の検証

ラベルイベントは、Secretsを使うproduction jobへ進む前に、Secretsなしのcontrol workflowで検証します。

検証内容:

- eventが `pull_request_target:labeled` である。
- 対象PRがmergedである。
- base branchが `develop` である。
- same repository PRである。
- fork PRではない。
- PRのmerge commit SHAが40文字の完全SHAである。
- PRのmerge commit SHAが最新 `develop` HEADと一致する。
- ラベル名が許可された3種類のいずれかである。
- PR番号とmerge commit SHAをGitHub APIから再取得する。
- Issue本文やPR本文の値は信頼しない。
- 起動ラベルを削除し、必要な場合は再ラベル付与で再実行できるようにする。

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

- Production Status Issue読込。
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
- required checksや `npm ci` より前にProduction Status Issueを読み、現在の本番commit、最終成功deployment、前回工程結果をstateへ反映する。
- Production Status Issueのmarker確認。
- 同一SHA二重反映ガード。
  - `force=false` で同じSHAがすでに `deployed` の場合は安全に拒否する。
  - この拒否ではProduction Status Issueを `failed` へ変更しない。
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

1. control workflowが、マージ済みPRのmerge commit SHAを `target_sha` として `deploy-production.yml` を `ref: develop` でdispatchする。
2. deploy workflowが信頼済み `develop` をcheckoutし、`HEAD == origin/develop == target_sha` を確認する。
3. Production Status Issueを読み、marker、現在の本番commit、最終成功deployment、前回工程結果を確認する。
4. 同一SHA二重反映ガードを確認する。
5. required checksが成功していることを確認する。
6. `npm ci` とローカル検証を実行する。
7. `npm run gas:production:status -- --json` の実出力を解析する。
8. 本番push直前に `HEAD == origin/develop == target_sha` を再確認する。
9. `npm run gas:production:push` を実行する。
10. 既存Webアプリdeployment更新直前にもdevelopを再確認する。
11. source push後にdevelopが進んでいた場合は、すでにpushした同一SHAのdeployment updateとSmoke Testまで完遂する。
12. `clasp deploy --deploymentId` で既存deploymentを更新する。
13. 本番Webアプリへ安全なHTTP Smoke Testを実行する。
14. Smoke Test後に最新 `origin/develop` を再取得する。
15. 本番反映したSHAが最新developと一致すればProduction Status Issueを `deployed` にする。
16. source push後にdevelopが進んでいれば、本番反映工程が成功していてもProduction Status Issueは `not-deployed` にする。
17. 途中で失敗した場合は `failed` にし、失敗ステージと失敗内容を保持する。

同一SHAがすでに `deployed` と記録されている場合、通常の再実行は安全な拒否として停止します。
この拒否では本番source push、既存Webアプリdeployment更新、Smoke Test、Production Status Issue更新、Environment failure記録を行いません。
意図的に同じSHAを再反映する場合だけ、`deploy-production-force` ラベルまたは `force=true` を使います。

## required checks

最低限、次のcheckが成功していない場合は停止します。

```text
Push test GAS project and run tests
```

workflow_dispatchでは、target SHAに対応するmerged PRをGitHub APIから解決します。
ラベル起動では、ラベルが付いたmerged PRを正本として使います。

`PRODUCTION_REQUIRED_CHECKS` にカンマ区切りまたは改行区切りで追加check名を設定できます。
この変数は追加用であり、既定の `Push test GAS project and run tests` を置き換えません。
実際に要求されるcheckは、既定checkと `PRODUCTION_REQUIRED_CHECKS` の和集合です。
同じcheck名が重複しても1回だけ検証します。
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

Repository Variable `PRODUCTION_STATUS_ISSUE_NUMBER` で指定する固定Issueには、必ず次のmarkerを含めます。
この番号はRepository Variableだけを正本にし、Environment Variableには同名Variableを作りません。

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

`.github/workflows/update-production-status.yml` は、`develop` push時にProduction Status Issueだけを更新するmetadata-only workflowです。
本番Secrets、production Environment、clasp、本番Apps Script、本番Webアプリには触れません。
`PRODUCTION_STATUS_ISSUE_NUMBER` が未設定または空文字の場合は、安全なskipとして成功終了します。
設定済みなのに数値でない、0以下、Issueが存在しない、PRを指している、closed、title不一致、markerなしの場合は失敗します。

`deploy-production.yml` と `update-production-status.yml` は、どちらもconcurrency group `production-state`、`cancel-in-progress: false` を使います。
これにより、Production Status Issueを更新するworkflow同士が同時に走って状態を上書きすることを避け、進行中の本番反映もキャンセルしません。

この同期で行うこと:

- 最新 `develop` SHAを取得する。
- Production Status Issueの現在の本番commitを読む。
- 本番commitと最新developが異なる場合は `not-deployed` として記録する。
- 現在の本番commit、最新develop、developとの差分、最終成功deployment日時、最終本番反映workflow、失敗情報を保持・更新する。
- status sync自身のworkflow URLは `最終status同期workflow` として別に記録する。
- marker、Issue title、open状態、PRではないことを確認してから更新する。
- 更新直前にIssueを再読込し、`preflight` / `source-pushed` / `deployment-updated` / `verifying` の場合は上書きせずskipする。

`deployed` は、現在の本番commitが最新developと一致し、かつ最後の本番反映のsource push、deployment update、smoke testがすべて成功済みである状態だけを表します。
`not-deployed` は、前回本番反映が成功していても、現在の本番commitが最新developと一致しない状態を表します。
`failed` は本番反映処理が失敗した状態です。status syncでdevelopが進んでも、失敗ステージと失敗内容は消しません。
Authenticated dry-runと本番deployでは、required checks、`npm ci`、validationより前にStatus Issueを読みます。
このため、preflight中に失敗しても、現在の本番commit、最終成功deployment、最終本番反映workflow、前回工程結果は`unknown`で上書きせず保持します。
Status Issue読込自体が失敗した場合は、無関係なIssueを更新せずに停止します。
同一SHAの通常再実行をduplicate guardで拒否した場合も、Production Status Issueは変更せず、`failed` へは変えません。
Static dry-runでは、Status Issueを読まず、本番Secretsも要求しません。

初回Issue本文テンプレート:

```markdown
# 本番反映ステータス

- 状態: `unknown`
- 本番commit: `unknown`
- 反映対象commit: `unknown`
- 最新develop: `unknown`
- developとの差分: `unknown`
- 最新develop反映: `unknown`
- 最終本番反映 source push: `not-started`
- 最終本番反映 deployment update: `not-started`
- 最終本番反映 smoke test: `not-started`
- 最終成功本番反映commit: `unknown`
- 最終成功deployment日時: `unknown`
- dry_run: `true`
- force: `false`
- source push後にdevelop進行: `false`
- 最終失敗ステージ: `none`
- 失敗内容: `none`
- 更新日時: `unknown`
- 最終本番反映workflow: unknown
- 最終status同期workflow: unknown
- 現在のworkflow run: unknown

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
   - 任意: `PRODUCTION_SMOKE_EXPECTED_MARKER`
   - 任意: `PRODUCTION_REQUIRED_CHECKS`
5. Repository Variableを設定する。
   - `PRODUCTION_STATUS_ISSUE_NUMBER`
6. Environment側には `PRODUCTION_STATUS_ISSUE_NUMBER` と同名のVariableを作らない。
7. Production Status Issueをテンプレートで作成する。
8. default branch `main` へcontrol workflowとdeploy workflow定義を同期する後続対応を実施する。
9. default branch `main` でPRラベル起動が有効になるか確認する。
10. まずStatic dry-runを実行する。
11. Secrets / Variables設定後にAuthenticated dry-runを実行する。

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
npm run test:production-deploy-control
npm run test:production-status-sync
npm run test:production-required-checks
npm run test:production-state-concurrency
npm run test:production-status-bootstrap
git diff --check
```

本番反映そのものはローカルで実行しません。
