# 本番反映GitHub Actions運用

Issue #83で追加する本番反映workflowの運用手順です。
本番Apps Scriptへのpush、既存Webアプリdeployment更新、本番状態追跡をGitHub Actionsへ寄せます。

Codexはこのworkflowの実行、GitHub Environment作成、Secrets / Variables変更、本番Apps Script操作、本番Webアプリ再デプロイを行いません。
default branch `main` へのcontrol workflow同期メモは [`docs/production-deploy-control.md`](production-deploy-control.md) を参照します。
Issue #83の本番反映経路に加え、Issue #93ではdeployment更新済み・Smoke Test失敗時の検証専用経路を追加します。初回設定と実動作確認が終わるまでIssue #83はopenのままにします。

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
  - `resolve-production-status-config`、`production-preflight`、`authenticated-production-dry-run`、`deploy-production`、`verify-existing-production` で構成する。
  - `production-preflight` はEnvironmentを参照せず、本番credentialやEnvironment Variablesも受け取らない。duplicate guard、既定required checks、ローカル検証、安全なpreflight outputs作成まで行う。
  - `operation=deploy` の `production-preflight` は検証済みの `node_modules` を短期artifactとして渡し、Environment job内では `npm ci` を再実行しない。
  - artifact archiveはrunner一時領域で作成・復元し、`node_modules` 展開後にarchiveを削除する。復元直後と本番push前のworking tree clean確認は維持し、Workflow自身の一時ファイルをリポジトリ内へ残さない。
  - `authenticated-production-dry-run` は `dry_run=true` かつ `dry_run_mode=authenticated` の場合だけ起動し、`production-preflight` Environment内で本番credential、Environment Variables、clasp status境界まで確認する。
  - `deploy-production` は `operation=deploy`、`dry_run=false`、preflight成功、`should_deploy=true` の場合だけ起動する。
  - `verify-existing-production` は `operation=verify-existing`、`dry_run=false`、部分成功状態のpreflight成功時だけ起動する。
  - 上記2jobは `production` Environmentを参照するが、verify jobにはclasp credential、Script ID、Deployment IDを渡さない。
  - 本番mutation直前にも `HEAD == origin/develop == target_sha` を再確認する。

正式経路は、developへマージ済みPRへのラベル付与です。

| ラベル | 意味 |
| --- | --- |
| `deploy-production-dry-run` | `operation=deploy`、`dry_run=true`、`dry_run_mode=authenticated`、本番操作なし |
| `deploy-production` | `operation=deploy`、`dry_run=false`、通常の本番反映 |
| `deploy-production-force` | `operation=deploy`、`dry_run=false`、`force=true`、同一SHA再反映 |

workflow開始時に起動ラベルは削除します。
同じラベルが残って意図せず再実行されることを避けるためです。

`workflow_dispatch` も残しますが、人間向けfallbackです。
ChatGPT側は原則としてラベル付与で起動します。

## operation

`Deploy production` workflowには次の明示入力があります。

| operation | 用途 | 許可する組み合わせ |
| --- | --- | --- |
| `deploy` | 通常のdry-runまたは本番反映 | 既存の `dry_run` / `dry_run_mode` / `force` を使用 |
| `verify-existing` | 更新済みdeploymentへのSmoke Testのみ再実行 | `dry_run=false`、`force=false` のみ |

未設定、空文字、`verify` / `smoke`などの未定義値はfail closedです。`verify-existing`と`dry_run=true`または`force=true`の組み合わせも拒否します。
既存の本番ラベル3種は常に`operation=deploy`をdispatchします。`verify-existing`は汎用監視ではなく、Production StatusがSmoke Testだけ失敗した部分成功状態から復旧する時だけ、人間が`workflow_dispatch`で明示します。

## default branchについて

このリポジトリのdefault branchは `main` です。
PRラベルを契機にするworkflowは、default branch上のworkflow定義で評価されます。

Workflow inputやjob構成を変更した場合、`develop`へマージしただけではdefault branchの手動実行UIとcontrol workflowは更新されません。
Issue #93の変更後も、少なくとも次のworkflow定義をdefault branch `main` へ同期する後続対応が必要です。

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

不正なラベル、未マージPR、古いPR、fork PRではdeploy workflowへ進みません。
deploy workflow内でも、preflight失敗やduplicate拒否ではproduction Environment jobへ進みません。

## dry-run

dry-runは`operation=deploy`でだけ利用します。

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

Environment `production-preflight` の承認後に本番credentialを使い、本番操作直前のclasp境界まで確認します。
本番mutation用の `production` Environmentは参照しません。

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
- production Environment参照。
- 本番source push / deployment更新 / Smoke Test。

Environment Deployment履歴:

- `production-preflight` Environmentにはauthenticated dry-run試行として残る可能性がある。
- `production` Environmentには残らない。
- `production` EnvironmentのDeployment履歴は本番mutationと`verify-existing`試行の履歴として扱い、job名とSummaryで区別する。

## 更新済みdeploymentの検証のみ再実行

`operation=verify-existing`、`dry_run=false`、`force=false`

通常deployでsource pushとdeployment更新が成功し、Smoke Testだけが失敗した場合に限り使用します。通常deployを再実行する前に、Production Status Issueで次をすべて確認します。

- Issueがopenで、管理markerを含む。
- 状態が`failed`。
- 最終失敗ステージが`smoke-test`。
- source pushが`success`。
- deployment updateが`success`。
- smoke testが`failed`。
- 本番commit、反映対象commit、最新develop、workflow入力`target_sha`がすべて同じSHA。
- source PRがsame-repository、`develop`向け、merged済みで、merge SHAが対象SHAと一致する。
- 既定checkと`PRODUCTION_REQUIRED_CHECKS`の全checkが成功している。

実行順:

1. EnvironmentなしpreflightでStatus Issue、SHA、source PR、既定required checksを確認する。
2. `npm ci`、dependency artifact、clasp status、本番bundle境界確認は行わない。
3. `production` Environmentの承認後、信頼済み`develop`を再checkoutする。
4. preflight output、Status Issueの部分成功状態、SHA、source PR、追加required checksを再確認する。
5. Web App URLとSmoke modeを検証する。
6. 既存本番URLへSmoke Testだけを実行する。
7. 成功時はStatus Issueを`deployed`へ更新する。再失敗時は`failed / smoke-test`を維持する。

行わないこと:

- `.clasp.production.json`やcredentialファイルの生成。
- `CLASP_PRODUCTION_CREDENTIALS`、`PRODUCTION_SCRIPT_ID`、`PRODUCTION_DEPLOYMENT_ID`の参照。
- `npm run gas:production:push`、Apps Script version作成、deployment update。
- force deployment、本番DB／Drive操作。

状態、SHA、PR、check、Web App設定のどれかが不一致ならSmoke Test前に停止し、Production Status Issueを更新しません。Smoke Test再失敗時は本番commit、source push成功、deployment update成功、前回の最終成功deployment情報を保持します。

成功時は状態、smoke test、最終成功本番反映commitを対象SHAへ更新します。ただし`verify-existing`はdeploymentを更新しないため、`最終成功deployment日時`と`最終本番反映workflow`は既存値を維持し、今回の時刻とrun URLは`最終本番検証日時`と`最終本番検証workflow`へ記録します。再失敗時も検証日時／workflowだけを更新し、既存の部分成功情報を失いません。

エラー時は、Smoke Testが呼ばれていなければ状態・SHA・PR・check・設定の境界不一致として修正してから再実行します。Smoke Testが呼ばれて`smoke-test`で失敗した場合だけ、HTTP応答またはSmoke Test実装を確認します。条件を満たさない状態で通常deployへ切り替えてはいけません。

`verify-existing`も`production` Environmentを使うため、required reviewersの承認後に実行され、Environment Deployment履歴へ`Verify existing production deployment`として残ります。通常deployとの区別はjob名、run名、Step Summaryの`verify-existing`表示で確認します。

## 本番反映

`operation=deploy`、`dry_run=false`

実行順:

1. control workflowが、マージ済みPRのmerge commit SHAを `target_sha` として `deploy-production.yml` を `ref: develop` でdispatchする。
2. `production-preflight` jobが信頼済み `develop` をcheckoutし、`HEAD == origin/develop == target_sha` を確認する。
3. `production-preflight` jobがProduction Status Issueを読み、marker、現在の本番commit、最終成功deployment、前回工程結果を確認する。
4. `production-preflight` jobが同一SHA二重反映ガード、既定required checks、`npm ci`、ローカル検証、安全なpreflight outputs作成を行う。このjobでは本番credential、Environment Variables、clasp設定生成、`npm run gas:production:status -- --json` は使わない。
5. preflightが成功し、かつ `dry_run=false`、かつ `should_deploy=true` の場合だけ、production Environment付きの `deploy-production` jobを起動する。
   - このjobではpreflight済み依存artifactを復元し、`npm ci` は実行しない。
6. `deploy-production` jobがEnvironment承認後に `HEAD == origin/develop == target_sha` を再確認し、preflight outputs、Status Issue marker、現在の本番commit、duplicate状態、source PR番号、Status Issue番号を再確認する。
7. Environment VariablesからWeb App URLとSmoke Test marker設定の形式を確認する。
8. 本番credentialから一時 `.clasprc.json` / `.clasp.production.json` を生成し、`npm run gas:production:status -- --json` でTracked / Untracked境界を確認する。
9. clasp status境界確認が成功した後だけ、Production Status Issueへ `preflight` を記録する。
10. `npm run gas:production:push` を実行する。
11. 既存Webアプリdeployment更新直前にもdevelopを再確認する。
12. source push後にdevelopが進んでいた場合は、すでにpushした同一SHAのdeployment updateとSmoke Testまで完遂する。
13. `clasp deploy --deploymentId` で既存deploymentを更新する。
14. 本番Webアプリへ安全なHTTP Smoke Testを実行する。
15. Smoke Test後に最新 `origin/develop` を再取得する。
16. 本番反映したSHAが最新developと一致すればProduction Status Issueを `deployed` にする。
17. source push後にdevelopが進んでいれば、本番反映工程が成功していてもProduction Status Issueは `not-deployed` にする。
18. production Environment job開始後に失敗した場合は `failed` にし、失敗ステージと失敗内容を保持する。

同一SHAがすでに `deployed` と記録されている場合、通常の再実行は安全な拒否として停止します。
この拒否では本番source push、既存Webアプリdeployment更新、Smoke Test、Production Status Issue更新、Environment failure記録を行いません。
また、production Environment jobを起動しないため、Environment Deployment履歴も作成しません。
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
`PRODUCTION_REQUIRED_CHECKS` は `production-preflight` / `production` Environment Variablesとして設定します。Environmentなしpreflightでは既定checkだけを確認し、Environment job側で追加checkを含めて再確認します。

## production status解析

`npm run gas:production:status -- --json` を使い、claspの実判定結果をJSONで解析します。
この確認は本番credentialが必要なため、Environmentなしpreflightでは実行せず、`production-preflight` Environment承認後のauthenticated dry-run、または `production` Environment承認後の本番mutation直前に実行します。

Trackedに含まれてはいけないもの:

- `src/test/**`
- `src/app/e2e_helpers.gs`

Trackedに含まれる必要があるもの:

- `src/app/e2e_runtime_support.gs`

空出力、解析不能、placeholder、認証エラー、Secretらしき値を含む出力は失敗扱いです。

## GitHub Deployment

GitHub Actionsでは、authenticated dry-run用に `authenticated-production-dry-run` jobだけが `environment: production-preflight` を持ちます。`deploy-production`と`verify-existing-production`は`environment: production`を持ちます。
production Environment Deployment履歴は、本番mutationまたは既存deployment検証を承認後に開始したrunの正本として扱います。
スクリプトからGitHub Deployment APIで追加deploymentを作成しません。

これにより、1回の本番反映でDeployment履歴が二重に作られることを避けます。
段階的な詳細状態はProduction Status Issueに記録します。

Environment Deployment履歴へ記録するもの:

- `production-preflight` Environment: authenticated dry-runの承認後clasp status確認。
- `dry_run=false` でpreflightに成功し、production Environment付きの本番mutation jobを開始したrun。
- 本番mutation開始後のclasp status境界失敗、source push失敗、deployment更新失敗、Smoke Test失敗、Status Issue更新失敗。
- 部分成功状態のpreflightに成功し、production Environment付きの`verify-existing` jobを開始したrun。

Environment Deployment履歴へ記録しないもの:

- Static dry-run。
- duplicate拒否。
- required checks失敗。
- `npm ci`失敗。
- validation失敗。
- Environmentなしpreflightでのbundle境界失敗。
- Status Issue読込失敗。
- target SHA不一致やpreflight中のdevelop進行。

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
- 現在の本番commit、最新develop、developとの差分、最終成功deployment日時、最終本番反映workflow、最終本番検証日時／workflow、失敗情報を保持・更新する。
- status sync自身のworkflow URLは `最終status同期workflow` として別に記録する。
- marker、Issue title、open状態、PRではないことを確認してから更新する。
- 更新直前にIssueを再読込し、`preflight` / `source-pushed` / `deployment-updated` / `verifying` の場合は上書きせずskipする。

`deployed` は、現在の本番commitが最新developと一致し、かつ最後の本番反映のsource push、deployment update、smoke testがすべて成功済みである状態だけを表します。
`not-deployed` は、前回本番反映が成功していても、現在の本番commitが最新developと一致しない状態を表します。
`failed` は本番反映処理が失敗した状態です。status syncでdevelopが進んでも、失敗ステージと失敗内容は消しません。
既存deployment更新後にSmoke Testだけ失敗した場合は、状態を `failed` のままにしつつ、本番commitを反映対象SHAとして記録します。source push / deployment updateは `success`、smoke testは `failed` とし、最終成功本番反映commitと最終成功deployment日時は更新しません。
Authenticated dry-runと本番deployのEnvironmentなしpreflightでは、required checks、`npm ci`、validationより前にStatus Issueを読みます。
preflight jobはStatus IssueをPATCHしません。
このため、preflight中に失敗しても、現在の本番commit、最終成功deployment、最終本番反映workflow、前回工程結果は`unknown`で上書きしません。
Production Status Issueへ中間状態を記録するのは、production Environment付きの本番mutation jobです。`verify-existing`は開始時の中間状態をPATCHせず、Smoke Test成功時の`deployed`または再失敗時の`failed`だけを記録します。
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
- 最終本番検証日時: `unknown`
- dry_run: `true`
- force: `false`
- source push後にdevelop進行: `false`
- 最終失敗ステージ: `none`
- 失敗内容: `none`
- 更新日時: `unknown`
- 最終本番反映workflow: unknown
- 最終本番検証workflow: unknown
- 最終status同期workflow: unknown
- 現在のworkflow run: unknown

<!-- production-status:managed-by-github-actions -->
```

## Smoke Test

本番DBやDriveを変更しないHTTP GETだけを行います。
本番Webアプリのアクセス設定をSmoke Testのために匿名公開へ変更してはいけません。

Environment Variable `PRODUCTION_SMOKE_MODE` で次の2モードを選びます。前後空白と大文字小文字は正規化し、未設定時は従来互換の `public-marker`、未定義値はfail closedです。

### `public-marker`

匿名HTTP GETでアプリ本文を取得できるWebアプリ向けです。

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

### `private-login-gated`

Googleログイン必須のprivate Webアプリ向けです。現在の本番環境では、`production-preflight` と `production` の両Environment Variablesへこの値を明示設定します。

- 最初のApps Script URLだけへ `redirect: manual` でHTTP GETする。
- 最初の応答がHTTP 3xxであることを確認する。
- `Location` が明示allowlist内のGoogleログインhostと認証系pathを指すことを確認する。
- `continue` / `followup` / `redirect_uri` などの戻り先が、設定済み本番WebアプリURLと同じhost・pathを指すことを確認する。
- 単に `accounts.google.com` へ到達しただけでは成功にしない。
- Cookie、OAuth token、独自認証情報は使用しない。
- 404、5xx、権限エラーページ、無関係なログインURLは失敗扱いにする。

Authenticated dry-runではSmoke Test自体は行わず、mode、Web App URL、marker設定を検証してStep Summaryへmodeと `smoke test: skipped` を表示します。

Smoke Test失敗時はProduction Status Issueで本番commit、反映対象commit、最新develop、source push、deployment update、smoke test、最終失敗ステージを確認します。deployment updateまで成功済みでIssue #93の条件を満たす場合は`operation=verify-existing`を使い、通常deployを安易に再実行しません。

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
このSecretはRepository Secretsには置きません。`production-preflight` と `production` の各Environment Secretsへ登録します。

## 初回設定

人間が実施します。

1. GitHub Environment `production-preflight` を作成する。
2. GitHub Environment `production` を作成する。
3. 必要なら両Environmentにrequired reviewersなどのprotection rulesを設定する。
4. `production-preflight` Environment Secretsを設定する。
   - `CLASP_PRODUCTION_CREDENTIALS`
   - `PRODUCTION_SCRIPT_ID`
   - `PRODUCTION_DEPLOYMENT_ID`
5. `production` Environment Secretsにも同じ3つのSecretを設定する。
   - `CLASP_PRODUCTION_CREDENTIALS`
   - `PRODUCTION_SCRIPT_ID`
   - `PRODUCTION_DEPLOYMENT_ID`
6. Repository Secretsには上記3つの本番credentialを置かない。
7. `production-preflight` Environment Variablesを設定する。
   - `PRODUCTION_WEB_APP_URL`
   - `PRODUCTION_SMOKE_MODE`
   - 任意: `PRODUCTION_SMOKE_EXPECTED_MARKER`
   - 任意: `PRODUCTION_REQUIRED_CHECKS`
8. `production` Environment Variablesにも同じVariableを設定する。
   - `PRODUCTION_WEB_APP_URL`
   - `PRODUCTION_SMOKE_MODE`
   - 任意: `PRODUCTION_SMOKE_EXPECTED_MARKER`
   - 任意: `PRODUCTION_REQUIRED_CHECKS`
9. Repository Variableを設定する。Repository Variablesとして使うのはこの1つだけ。
   - `PRODUCTION_STATUS_ISSUE_NUMBER`
10. `production` Environmentは実本番mutationのDeployment履歴、required reviewers、deployment protection rules、本番URL表示の境界として使う。
11. Environment側には `PRODUCTION_STATUS_ISSUE_NUMBER` と同名のVariableを作らない。
12. Production Status Issueをテンプレートで作成する。
13. default branch `main` へcontrol workflowとdeploy workflow定義を同期する後続対応を実施する。
14. default branch `main` でPRラベル起動が有効になるか確認する。
15. まずStatic dry-runを実行する。
16. Environment Secrets / Variables設定後にAuthenticated dry-runを実行する。

ラベルが存在しない場合は、人間がGitHub上で作成します。

## ChatGPT / Codex運用

ChatGPT側:

- マージ済みPRへ `deploy-production-dry-run` などのラベルを付けて起動する。
- dry-run結果を確認する。
- 本番mutation jobへ進む場合だけ、必要に応じて人間へEnvironment承認を依頼する。

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
