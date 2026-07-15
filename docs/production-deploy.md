# 本番反映GitHub Actions運用

Issue #83で追加する本番反映workflowの運用手順です。
本番Apps Scriptへのpush、既存Webアプリdeployment更新、本番状態追跡をGitHub Actionsへ寄せます。

Codexはこのworkflowの実行、GitHub Environment作成、Secrets / Variables変更、本番Apps Script操作、本番Webアプリ再デプロイを行いません。
default branch `main` へのcontrol workflow同期メモは [`docs/production-deploy-control.md`](production-deploy-control.md) を参照します。
PR #84はIssue #83の基盤実装です。PR #87、PR #90、PR #92でdefault branch `main` への同期と後続修正も反映済みです。PR #95のruntime bundle完全一致検証は `develop` へマージ済みです。本番Web App entry pointの復旧と実動作確認が終わるまでIssue #83はopenのままにします。

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
  - `resolve-production-status-config`、`production-preflight`、`authenticated-production-dry-run`、`deploy-production` で構成する。
  - `production-preflight` はEnvironmentを参照せず、本番credentialやEnvironment Variablesも受け取らない。duplicate guard、既定required checks、ローカル検証、安全なpreflight outputs作成まで行う。
  - `production-preflight` は検証済みの `node_modules` を短期artifactとして渡し、Environment job内では `npm ci` を再実行しない。
  - artifact archiveはrunner一時領域で作成・復元し、`node_modules` 展開後にarchiveを削除する。復元直後と本番push前のworking tree clean確認は維持し、Workflow自身の一時ファイルをリポジトリ内へ残さない。
  - `authenticated-production-dry-run` は `dry_run=true` かつ `dry_run_mode=authenticated` の場合だけ起動し、`production-preflight` Environment内で本番credential、Environment Variables、clasp status境界まで確認する。
  - `deploy-production` は `dry_run=false` かつpreflight成功かつ `should_deploy=true` の場合だけ起動し、このjobだけが `production` Environmentを参照する。
  - 本番mutation直前にも `HEAD == origin/develop == target_sha` を再確認する。

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

そのため、develop側のworkflow変更はdefault branch `main` にも同期する必要があります。
次のworkflow定義はPR #87で初回同期し、PR #90とPR #92で後続修正を同期済みです。

- `.github/workflows/production-deploy-control.yml`
- `.github/workflows/deploy-production.yml`

workflow定義自体を変更した場合だけ、マージ後に別PRで `main` へ同期します。今回のruntime検証修正はdevelopからcheckoutされるスクリプト側で完結し、workflow YAMLは変更しないため追加のmain同期は不要です。default branch変更や `main` への直接pushは行いません。
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
- `production` EnvironmentのDeployment履歴は実本番mutationの正本として扱う。

## 本番反映

`dry_run=false`

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
10. Web App URL内のdeployment IDと、設定済みdeployment IDが完全一致することを確認する。不一致ならsource push前に停止する。
11. Apps Script API `projects.deployments.get/list` で対象deploymentを取得し、`WEB_APP` entry pointがちょうど1件、URL・version・アクセス設定が有効で、deployment総数が取得できることを確認する。非Webアプリ、API executable、HEAD deployment、URL不一致、API形式不明ではsource push前に停止する。
12. `npm run gas:production:push` を実行する。本番ラッパーは、人間またはworkflowの明示確認後に `clasp push --force` を使い、非対話manifest確認による暗黙skipを防ぐ。
13. push出力に `Skipping push.` がないことを確認する。`Pushed ...` または `Script is already up to date.` は、この時点では成功候補であり、次の完全一致検証が成功するまでsource push成功とは確定しない。
14. `show-file-status --json` の `filesToPush` から対象SHAのローカル本番bundle manifestを作る。一時ディレクトリへリモートHEADをpullし、ファイル数、相対パス集合、全ファイルのSHA-256を完全比較した後、runtime意味検査も行う。失敗時はdeploymentを更新しない。
15. 既存Webアプリdeployment更新直前にもdevelopを再確認する。
16. source push後にdevelopが進んだ場合は、すでにpushした同一SHAのdeployment updateと検証まで完遂する。
17. `clasp update-deployment` で既存deploymentを更新する。
18. Apps Script APIで同じdeploymentを再取得し、deployment数が増えておらず、指定deploymentだけが新しいversionへ更新されたことを確認する。
19. 更新前後とも `WEB_APP` entry pointがちょうど1件で、Web App URLのSHA-256 fingerprint、entry point type集合、アクセス設定、実行ユーザーが変わっていないことを確認する。
20. 更新されたversionを一時ディレクトリへpullし、同じローカル本番bundle manifestとの完全一致とruntime意味検査を再実行する。
21. 本番Webアプリへ安全なHTTPアクセスゲート検査を実行する。HTTP 404は成功扱いにしない。
22. アクセスゲート検査後に最新 `origin/develop` を再取得する。
23. source push、対象SHAの本番bundleとリモートHEADの完全一致、deployment更新、更新前後のWeb App検証、対象versionとの完全一致、Webアクセスゲートのすべてが成功し、反映SHAが最新developと一致する場合だけProduction Status Issueを `deployed` にする。
24. source push後にdevelopが進んでいれば、本番反映工程が成功していてもProduction Status Issueは `not-deployed` にする。
25. production Environment job開始後に失敗した場合は `failed` にし、失敗ステージと失敗内容を保持する。

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

### 本番bundle manifest

`show-file-status --json` の `filesToPush` を本番push対象の正本として使います。`.clasp.productionignore` を独自実装で再解釈しません。

各対象ファイルは次の2項目だけを持つmanifestへ変換します。

- `/` 区切りへ正規化したリポジトリ相対パス。
- UTF-8本文をSHA-256化した値。

clasp / Apps Script間の不要な差を避けるため、server-side `.js` のpathはpull設定と同じ `.gs` へ正規化します。また、UTF-8 BOMを除き、CRLF / CRをLFへ統一してからhash化します。それ以外の空白、末尾改行、本文は正規化しません。manifestはパス順に固定し、ファイル順だけが異なる場合は同一と判定します。

許可するのは `.gs`、`.js`、`.html`、`.json` のUTF-8 textです。対象にbinary、無効なUTF-8、NUL、symlink、ルート外path、重複pathが含まれる場合は安全側で停止します。manifest、hash一覧、ファイル本文は通常ログ、Step Summary、artifactへ出しません。

リモートHEADとdeployment versionの両方について、ファイル数、path集合、各hashがローカルmanifestと完全一致する必要があります。さらにruntime helper、通常Web関数、private helper参照、ページ初期化経路、test/E2E helper除外の意味検査も維持します。

## GitHub Deployment

GitHub Actionsでは、authenticated dry-run用に `authenticated-production-dry-run` jobだけが `environment: production-preflight` を持ち、実本番用に `deploy-production` jobだけが `environment: production` を持ちます。
production Environment Deployment履歴は、実際の本番反映を開始したrunだけを記録する正本として扱います。
スクリプトからGitHub Deployment APIで追加deploymentを作成しません。

これにより、1回の本番反映でDeployment履歴が二重に作られることを避けます。
段階的な詳細状態はProduction Status Issueに記録します。

Environment Deployment履歴へ記録するもの:

- `production-preflight` Environment: authenticated dry-runの承認後clasp status確認。
- `dry_run=false` でpreflightに成功し、production Environment付きの本番mutation jobを開始したrun。
- 本番mutation開始後のclasp status境界失敗、source push失敗、deployment更新失敗、Smoke Test失敗、Status Issue更新失敗。

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
- 現在の本番commit、最新develop、developとの差分、最終成功deployment日時、最終本番反映workflow、失敗情報を保持・更新する。
- status sync自身のworkflow URLは `最終status同期workflow` として別に記録する。
- marker、Issue title、open状態、PRではないことを確認してから更新する。
- 更新直前にIssueを再読込し、`preflight` / `source-pushed` / `deployment-updated` / `verifying` の場合は上書きせずskipする。

`deployed` は、現在の本番commitが最新developと一致し、かつ対象SHAのローカル本番bundleがリモートHEADとdeployment versionの両方へ完全一致し、更新前後の `WEB_APP` entry point、source push、deployment update、Web access gate、smoke testがすべて成功済みである状態だけを表します。runtime helperの存在だけでは `deployed` にしません。
`not-deployed` は、前回本番反映が成功していても、現在の本番commitが最新developと一致しない状態を表します。
`failed` は本番反映処理が失敗した状態です。status syncでdevelopが進んでも、失敗ステージと失敗内容は消しません。
既存deploymentの更新後に `WEB_APP` entry point消失、URL・種別・アクセス設定変更、または対象versionの完全一致検証失敗を検知した場合は、deployment updateを `success`、deployment verificationを `failed`、Web access gateとsmoke testを `not-started`、現在の本番commitを `unknown`、状態を `failed` として記録します。deploymentは更新済みですが、その内容が対象SHAとも前回SHAとも確認できないため、どちらのSHAも現在本番として確定しません。最終成功本番反映commitと最終成功deployment日時は前回成功値を維持します。
既存deployment更新後にSmoke Testだけ失敗した場合は、状態を `failed` のままにしつつ、本番commitを反映対象SHAとして記録します。source push / deployment updateは `success`、smoke testは `failed` とし、最終成功本番反映commitと最終成功deployment日時は更新しません。
Authenticated dry-runと本番deployのEnvironmentなしpreflightでは、required checks、`npm ci`、validationより前にStatus Issueを読みます。
preflight jobはStatus IssueをPATCHしません。
このため、preflight中に失敗しても、現在の本番commit、最終成功deployment、最終本番反映workflow、前回工程結果は`unknown`で上書きしません。
Production Status Issueへ `preflight`、`source-pushed`、`deployment-updated`、`verifying`、`deployed`、`failed` を記録するのは、production Environment付きの本番mutation jobだけです。
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
- 最終本番反映 remote source verification: `not-started`
- 最終本番反映 deployment update: `not-started`
- 最終本番反映 deployment verification: `not-started`
- 最終本番反映 web access gate verification: `not-started`
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

このモードが保証するのは、設定済みWeb App URLが想定したGoogleログインゲートへ到達できることだけです。ログイン後のHTML表示、`DOMContentLoaded`、`loadRecentImports()`、Apps Script server functionの実行成功までは保証しません。
本番runtimeの参照解決と対象SHA一致は、source push後のリモートHEAD検証と、deployment更新後のversion検証を別工程として必須にします。単なるログインredirectやruntime helperの存在だけでは本番反映成功にしません。

Authenticated dry-runではSmoke Test自体は行わず、mode、Web App URL、marker設定を検証してStep Summaryへmodeと `smoke test: skipped` を表示します。

Smoke Test失敗時はProduction Status Issueで本番commit、source push、deployment update、smoke test、最終失敗ステージを確認します。deployment updateが成功済みの場合があるため、同じ本番Workflowを安易に再実行せず、工程結果を確認してから次の対応を決めます。

失敗扱いの例:

- `ReferenceError`
- `TypeError`
- `Script function not found`
- `Exception:`
- `Authorization is required`
- `You need permission`
- `Sign in`
- `Google Accounts`

## 2026-07-15の本番不具合と根本原因

本番Webアプリの初期表示で、`loadRecentImports()` から `listRecentImportsFromWebApp()` が自動実行され、次の参照エラーが発生しました。

```text
ReferenceError: assertCiE2eTokenForWebAppIfConfigured_ is not defined
```

この関数はリポジトリの `src/app/e2e_runtime_support.gs` に存在し、本番ignore対象でもありませんでした。GitHub Actionsの実ログでは、本番push工程が `Skipping push.` と表示した後も終了コード0で継続し、古いリモートHEADから新versionを作成して既存deploymentを更新していました。

`@google/clasp@3.3.0` は `appsscript.json` の変更を検知すると確認入力を要求します。非対話runnerでは確認が成立せず、従来の `clasp push` は変更を送らずに成功終了していました。さらに `private-login-gated` はGoogleログインredirectだけを確認するため、古いversionのruntime参照切れを検知できず、Production Status Issueが誤って `deployed` になりました。

対策として、本番ラッパーの明示確認後だけ `push --force` を使い、`Skipping push.` を失敗扱いにします。加えて、claspが算出したローカル本番bundleとリモートHEAD／更新後versionを全ファイルのSHA-256 manifestで完全比較し、通常Web関数の参照解決も検証します。`Script is already up to date.` は、この完全一致検証が成功した場合だけ成功扱いです。

## 2026-07-15のWeb App entry point消失

[対象run](https://github.com/nozomu-honda/tradeCsvToSpreadSheet/actions/runs/29418824550)では、source push、remote source verification、既存deployment更新、deployment version検証まで成功しましたが、Web access gateがHTTP 404で失敗しました。Apps Script管理画面では、更新対象deploymentからWebアプリ設定が消失していました。

根本原因は、リポジトリの `appsscript.json` に `webapp` 設定がなく、source push後の新versionがWeb App構成を持たなかったことです。そのversionを既存deploymentへ割り当てたため、`WEB_APP` entry pointが失われました。`appsscript.json` には、手動復旧後に正常表示を確認した本番設定どおり、所有者本人だけがアクセスし、デプロイしたユーザーとして実行する設定をソース管理します。

```json
"webapp": {
  "access": "MYSELF",
  "executeAs": "USER_DEPLOYING"
}
```

初回実装の `ANYONE` / `USER_ACCESSING` は、本番の公開範囲をログイン済みユーザー全体へ広げ、実行主体をアクセスユーザーへ変えてしまうため採用しません。更新前後とも `MYSELF` / `USER_DEPLOYING` を必須とし、公開範囲を拡大せず、アクセスユーザーの権限では実行しません。テスト用Web E2Eがrunner上で生成する一時manifestの `ANYONE_ANONYMOUS` / `USER_DEPLOYING` はテスト専用Apps Scriptだけに適用し、本番manifestとは別に扱います。

更新前はApps Script APIで対象deploymentが `WEB_APP` であることを確認し、更新後は同じdeployment ID、URL fingerprint、entry point type集合、アクセス設定、実行ユーザー、deployment総数、versionを再確認します。APIレスポンスが不明、`WEB_APP`が0件または複数、URL不一致の場合はfail closedです。URL、ID、token、APIレスポンス全文はログやSummaryへ出しません。

更新後にWeb App設定が消失しても、新規deployment作成や自動rollbackは行いません。人間が次の順で復旧します。

1. Apps Scriptの「デプロイを管理」で対象deploymentの状態を確認する。
2. Webアプリとして修正できない場合は、意図したアクセス設定でWebアプリdeploymentを作成する。
3. Deployment IDとWeb App URLが変わった場合は、両EnvironmentのSecret / Variableを人間が更新する。
4. 必要に応じて `deploy-production-dry-run` でAuthenticated dry-runを行う。
5. Environment承認後に通常の `deploy-production` で再反映する。

HTTP 404は非公開Webアプリの正常応答とは扱いません。Apps Script API上のWeb App検証を通過してもHTTP 404ならWeb access gate失敗です。

同日に起動しなかったと見られていた `deploy-production-dry-run` ラベルも履歴を再確認しました。[Production deploy control run](https://github.com/nozomu-honda/tradeCsvToSpreadSheet/actions/runs/29415590462)と、そこからdispatchされた[Authenticated dry-run](https://github.com/nozomu-honda/tradeCsvToSpreadSheet/actions/runs/29415596959)はいずれも起動して成功しており、default branch `main` のworkflow欠落、workflow無効化、初回ラベル作成による不発は確認されませんでした。control workflowは起動ラベルを削除するため、同じラベルが残って二重起動する構成でもありません。今回の修正ではラベルworkflowを変更しません。

## clasp deployment更新の仕様確認

`@google/clasp@3.3.0` の同梱実装とApps Script API公式仕様で次を確認済みです。

- `push --force` はmanifest確認promptを省略する。
- `pull --versionNumber <number>` は指定versionのsourceを取得できる。
- `update-deployment <id> --json` は内部でApps Script API `projects.deployments.update` を呼ぶ。
- 更新request bodyは `deploymentConfig` の `description`、`versionNumber`、`scriptId`、`manifestFileName` であり、`entryPoints` と `updateMask` は含まれない。
- API更新requestだけではWeb App種別を再構築できないため、manifestに正しい `webapp` 設定が必要である。
- `list-deployments --json` はdeployment ID、version番号、descriptionだけに整形され、entry point種別を判定できない。
- Apps Script API `projects.deployments.get` は `entryPoints`、`WEB_APP` URL、`access`、`executeAs` を取得できる。
- Apps Script API `projects.deployments.list` はdeployment総数の不変確認に使用できる。

更新コマンドを直接API実装へ置き換えても同じ更新APIを使うため、現行の `clasp update-deployment` を維持します。詳細取得だけをApps Script APIへ追加し、更新前後のWeb App構成を検証します。既存clasp認証にはdeployment取得・更新に必要なscopeが含まれており、新しいSecretやtokenは追加しません。

公式仕様:

- [Apps Script deployments resource](https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments)
- [projects.deployments.get](https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments/get)
- [projects.deployments.update](https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments/update)
- [Web apps manifest resource](https://developers.google.com/apps-script/manifest/web-app-api-executable)

fake claspとfixtureによる引数・出力・一時ファイル削除の回帰テストを維持します。

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
npm run test:production-runtime-verification
npm run test:production-web-app-deployment
npm run test:production-smoke-test
npm run test:production-deploy-control
npm run test:production-status-sync
npm run test:production-required-checks
npm run test:production-state-concurrency
npm run test:production-status-bootstrap
git diff --check
```

本番反映そのものはローカルで実行しません。
