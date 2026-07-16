# clasp反映手順

このドキュメントは、CI用Apps Scriptと本番Apps Scriptのどちらへ、どの方法でソースを反映するかをまとめた運用ガイドです。

## 最初に判断すること

| やりたいこと | 接続先 | 操作する場所 | 実行方法 |
| --- | --- | --- | --- |
| PRの最終CI | テスト専用Apps Script | GitHub Actions | PRへ `run-final-ci` ラベルを付ける |
| 本番反映dry-run | 本番Apps Script / 本番Webアプリ | GitHub Actions | マージ済みPRへ `deploy-production-dry-run` ラベルを付ける |
| 本番反映 | 本番Apps Script / 本番Webアプリ | GitHub Actions | マージ済みPRへ `deploy-production` ラベルを付ける |
| 本番ソースの確認 | 本番Apps Script | ローカルPC | `npm run gas:production:status` |
| 本番ソースの手動反映 | 本番Apps Script | ローカルPC | `npm run gas:production:push` |
| 本番エディタを開く | 本番Apps Script | ローカルPC | `npm run gas:production:open` |
| 公開中Webアプリの更新 | 本番Webアプリ | Apps Script画面 | 新バージョンを作成して再デプロイ |

迷った場合は、次の2点だけ先に確認してください。

- CI用へ反映する場合、ローカルPCでは何もpushしません。GitHub Actionsだけを使います。
- 本番用へ反映する場合、CI用の設定やコマンドは使いません。原則として `Deploy production` workflowを使い、ローカル手動反映はfallbackとして扱います。

## CI用Apps Scriptへの反映

### 誰が反映するか

GitHub Actionsが自動で反映します。人やCodexがローカルPCからCI用Apps Scriptへpushすることはありません。

### 最終CIを実行する

1. 対象PRのレビューと修正を終える。
2. PRへ `run-final-ci` ラベルを付ける。
3. GitHub Actionsの `Final CI` workflowが完了するまで待つ。
4. `Push test GAS project and run tests` と `Deploy test Web app and run Playwright E2E` が成功したことを確認する。
5. 以降コード変更や追加ラベル操作をせずにマージする。

ラベルを付けると、GitHub Actionsは次を自動実行します。

1. PR番号、head SHA、同一リポジトリPRかどうかを記録する。
2. 同じhead SHAで `Push test GAS project and run tests` が成功済みか確認する。成功済みならGASの重い処理は再利用し、jobは成功checkを残す。
3. 未成功なら、CI用認証をGitHub Secretsからrunnerへ用意し、テスト専用Apps Scriptへ最新ソースをpushしてGASテストを9バッチに分けて実行する。
4. GAS Testsが成功した後、同じhead SHAで `Deploy test Web app and run Playwright E2E` が成功済みか確認する。成功済みならWeb E2Eの重い処理は再利用する。
5. 未成功なら、一時Webアプリdeploymentを作成してPlaywright E2Eを実行し、cleanup、rollback、一時deployment削除を確認する。

Web E2Eでは一時Webアプリdeploymentを作成しますが、テスト終了後に自動削除されます。固定の本番Webアプリは更新しません。

テスト成功後に追加コミットした場合は、`run-final-ci` ラベルを一度外して再度付け、最新headで実行し直します。
旧ラベルの `run-gas-tests` と `gas-web-e2e` は最終CIの起動には使いません。

### CI用で使われる設定

- 接続先: `GAS_TEST_SCRIPT_ID`で指定されたテスト専用Apps Script
- 認証: GitHub Secretの`CLASPRC_JSON`
- project設定: GitHub Actions runnerの一時領域
- ignore: `.claspignore`
- テストコード: `src/test/**`もpush対象

これらの実値をローカルファイルへコピーしたり、コミットしたりしません。

## GitHub Actionsによる本番反映

Issue #83以降の本番反映は、原則としてGitHub Actionsの `Deploy production` workflowで行います。
ChatGPT側からは、developへマージ済みPRへの専用ラベル付与で起動します。
`workflow_dispatch` は人間向けfallbackです。

ラベル起動は2段構成です。

- default branch `main` 上の `Production deploy control` workflowが、PRラベルを検証する。
- 条件を満たした場合だけ、`Deploy production` workflowを `ref: develop` でdispatchする。
- deploy workflowは `target_sha` と最新 `origin/develop` の一致を確認してから本番処理へ進む。

control workflowとdeploy workflowはPR #87でdefault branch `main` へ初回同期し、PR #90とPR #92で後続修正も同期済みです。
今後develop側の本番workflow定義を変更した場合は、マージ後に別PRで `main` へ同期するまでラベル起動経路には反映されません。developからcheckoutされるスクリプトだけの変更では追加のmain同期は不要です。

基本フロー:

1. 最新 `develop` を確認する。
2. マージ済みPRへ `deploy-production-dry-run` ラベルを付ける。
3. Environmentなしのpreflight jobで、required checks、`npm ci`、本番wrapper検証、本番bundle境界検証、重複反映ガードを確認する。このjobは本番credential、Environment Variables、clasp statusを使わない。
4. Authenticated dry-runでは、`production-preflight` Environment承認後に本番credentialを使って `npm run gas:production:status -- --json` とTracked / Untracked境界を確認する。本番push、deployment更新、Smoke Test、Status Issue PATCHは行わない。
5. 問題がなければ、人間が `deploy-production` ラベルで本番反映を起動する。
6. preflight成功後、`production` Environment付きの本番mutation jobだけがWeb App URL/deployment整合性を確認し、Apps Script APIで既存deploymentに `WEB_APP` entry pointがちょうど1件あることを確認してから本番Apps Scriptへpushする。
7. claspの `filesToPush` を正本に対象SHAのローカル本番bundle manifestを作り、push後のリモートHEADとファイル数・path集合・全ファイル内容を完全比較する。runtime support、通常Web関数の参照解決、test/E2E helper除外も確認してから既存deploymentを更新する。
8. 更新後にApps Script APIで同じdeploymentを再取得し、`WEB_APP`、URL fingerprint、entry point type、アクセス設定、実行ユーザー、deployment数が維持され、対象versionも同じローカルmanifestと完全一致した上で、Webアクセスゲート検査まで成功した場合だけ本番成功とする。HTTP 404は成功扱いにしない。
9. Production Status IssueとGitHub EnvironmentのDeployment履歴を確認する。
10. developが進んだ場合は、metadata-onlyの `Update production status` workflowがProduction Status Issueを `not-deployed` へ更新する。

`Update production status` workflowは、Repository Variable `PRODUCTION_STATUS_ISSUE_NUMBER` が未設定または空文字の場合は安全にskipし、Actionsを失敗させません。
設定済みなのに不正な値、PR、closed Issue、title不一致、markerなしの場合は失敗します。

Production Status Issue番号はRepository Variableだけを正本にします。
Environment側には同名の `PRODUCTION_STATUS_ISSUE_NUMBER` Variableを作りません。
本番workflow用の `CLASP_PRODUCTION_CREDENTIALS`、`PRODUCTION_SCRIPT_ID`、`PRODUCTION_DEPLOYMENT_ID` はRepository Secretsへ置かず、`production-preflight` と `production` の各Environment Secretsへ設定します。
`PRODUCTION_WEB_APP_URL`、`PRODUCTION_SMOKE_MODE`、任意の `PRODUCTION_SMOKE_EXPECTED_MARKER` / `PRODUCTION_REQUIRED_CHECKS` はRepository Variablesへ置かず、`production-preflight` と `production` の各Environment Variablesへ設定します。
現在の本番WebアプリはGoogleログイン必須のため、両Environmentの `PRODUCTION_SMOKE_MODE` に `private-login-gated` を設定します。Smoke Testのために匿名公開へ変更してはいけません。
Repository Variableとして使うのは `PRODUCTION_STATUS_ISSUE_NUMBER` だけです。
`production-preflight` Environmentはauthenticated dry-runを開始したrunの履歴、required reviewers、deployment protection rulesに使います。
`production` Environmentは実本番mutationを開始したrunの履歴、required reviewers、deployment protection rules、本番URL表示に使います。

詳細は[`docs/production-deploy.md`](production-deploy.md)を確認します。

Codexはこのworkflowの実行、起動ラベル付与、GitHub Environment作成、Secrets / Variables変更、本番push、本番deployment更新を行いません。

## ローカルPCからの本番Apps Script確認 / 手動fallback

### 初回だけ行う準備

以下はWindows PowerShellで、ローカルリポジトリのルートから実行します。

1. 依存関係をインストールする。

```powershell
npm ci
```

2. 本番用project設定のサンプルをコピーする。

```powershell
Copy-Item .clasp.production.example.json .clasp.production.json
```

3. `.clasp.production.json`を開き、`scriptId`のplaceholderだけを本番Apps ScriptのScript IDへ置き換える。

`.clasp.production.json`はローカル専用で、Git管理対象外です。ファイルの内容やScript IDをIssue、PR、コメントへ貼らないでください。

4. 本番用named userとしてclaspへログインする。

```powershell
npm exec -- clasp login --user production
```

ブラウザが開いたら、本番Apps Scriptを管理するGoogleアカウントで許可します。CI用Googleアカウントではログインしません。

5. 本番設定と認証を確認する。

```powershell
npm run gas:production:status
```

エラーにならず、本番へ送る予定のファイルが表示されれば初回準備は完了です。`src/test/**` と `src/app/e2e_helpers.gs` が対象に含まれていないことも確認します。

### 毎回の本番反映手順

1. `develop`へ移動し、最新状態へ更新する。

```powershell
git switch develop
git pull --ff-only origin develop
```

2. working treeがcleanであることを確認する。

```powershell
git status --short
```

何も表示されない状態で進めます。

3. 本番へ送るファイルを確認する。

```powershell
npm run gas:production:status
```

4. 本番Apps Scriptへソースをpushする。

```powershell
npm run gas:production:push
```

確認画面で、内容を確認してから次の文字列を入力します。

```text
PRODUCTION PUSH
```

本番ラッパーはこの明示確認後にだけ内部で `clasp push --force` を実行します。これはmanifest変更時の非対話promptで `Skipping push.` のまま成功終了することを防ぐためです。人がリポジトリ直下でbareな `clasp push --force` を実行してはいけません。

このコマンドは、次の条件を満たさない場合は自動停止します。

- 現在のブランチが`develop`
- working treeに未コミット変更がない
- `HEAD`が最新の`origin/develop`と一致する
- `.clasp.production.json`が有効
- named user `production`で認証済み
- `.clasp.productionignore`が有効
- 確認文字列が一致する

GitHub Actions経由ではさらに、push出力、リモートHEAD、更新後deployment versionを検証します。`Script is already up to date.` は、リモートHEADが対象SHAのローカル本番bundleと完全一致した場合だけ成功扱いです。リモート検証用sourceはrunner一時領域へpullし、成功・失敗のどちらでも削除します。manifest、hash一覧、ファイル内容全体、Script ID、Deployment ID、Web App URL、OAuth tokenはログへ出しません。

リポジトリの `appsscript.json` には、本番Webアプリの構成として `webapp.access = ANYONE` と `webapp.executeAs = USER_ACCESSING` を保持します。これを削除したversionへ既存deploymentを更新すると、Web App entry pointが消失するため、Environmentなしpreflightでも静的に必須確認します。テスト用Web E2Eではrunner上の一時manifestだけを `ANYONE_ANONYMOUS` / `USER_DEPLOYING` へ変換し、リポジトリ上の本番設定は変更しません。

### 公開中Webアプリへ反映する

`npm run gas:production:push`が更新するのは、Apps Scriptプロジェクトのソースです。公開中のWebアプリがversioned deploymentを使っている場合、pushだけでは公開版は更新されません。

本番Webアプリも更新する場合は、push成功後に次を行います。

1. 本番Apps Scriptを開く。

```powershell
npm run gas:production:open
```

2. Apps Script画面右上の「デプロイ」から「デプロイを管理」を開く。
3. 現在の本番Webアプリdeploymentを選び、編集する。
4. バージョンで「新バージョン」を選ぶ。
5. 内容を確認して「デプロイ」を実行する。
6. 必要なOAuth権限が追加された場合は、本番運用アカウントで承認する。
7. 本番Webアプリの主要画面を手動確認する。

新しいdeploymentを追加するのではなく、通常は現在の本番deploymentを新バージョンへ更新します。これにより既存のWebアプリURLを維持できます。

### Web App検証が失敗した場合

GitHub Actionsの更新前検証はstrict modeで行い、`WEB_APP` 1件、設定URL一致、`access = ANYONE`、`executeAs = USER_ACCESSING` を必須にします。`Production Web App verification failed: ...` となった場合はsource push前に停止しています。reasonはAPI呼び出し、deployment存在、version、entry point、URL、access / executeAsなどの失敗条件を実値なしで示します。Authenticated dry-runではProduction Status Issueを更新しないため、ActionsログとStep Summaryのreasonを確認します。

更新後はcomparison snapshotを取得し、`WEB_APP` 0件・複数件、entry point type、URL、access、executeAsの変化をsnapshot生成時に通常検証reasonへ丸めず、更新前との差分reasonへ変換します。`WEB_APP_ENTRY_POINT_DISAPPEARED`、`WEB_APP_ENTRY_POINT_COUNT_CHANGED`、`ENTRY_POINT_TYPES_CHANGED`、`WEB_APP_URL_CHANGED`、`ACCESS_CHANGED`、`EXECUTE_AS_CHANGED` のいずれかで失敗した場合は、source pushとdeployment updateは実施済みでもSmoke Testには進まず、Production Statusは `failed`、本番commitは `unknown` になります。安全なreasonはProduction Status Issueの `失敗内容` に保存します。Script ID、Deployment ID、Web App URL、URL fingerprint、snapshot、token、credential、Apps Script APIレスポンス全文はログ、Summary、Status Issueへ出しません。HTTP 404も成功扱いにしません。

本番manifestとdeploymentの正しい設定は `access = ANYONE` / `executeAs = USER_ACCESSING` です。

人間がApps Scriptの「デプロイを管理」で状態を確認し、Webアプリとして修正または再作成します。Deployment IDやURLが変わった場合は、`production-preflight` と `production` の両Environment設定を更新し、Authenticated dry-runで整合性を確認してから通常の本番反映へ進みます。通常の更新は `deploy-production` ラベル1回でpreflightからWebアクセスゲートまで実行し、dry-runは初回設定、Environment / Secret変更、Workflow大規模変更、障害調査時だけ任意利用します。同一SHAを意図して再反映する場合だけ `deploy-production-force` を使います。

本番へのpushと再デプロイは、人間がGitHub Actionsまたは手動fallbackで実行します。Codexは実行しません。

## 本番用で使われる設定

- 接続先: `.clasp.production.json`で指定した本番Apps Script
- 認証: clasp named user `production`
- project設定: `.clasp.production.json`
- ignore: `.clasp.productionignore`
- テストコード: `src/test/**`はpush対象外
- E2E専用helper: `src/app/e2e_helpers.gs`はpush対象外

## 絶対に実行しない操作

次の操作は禁止です。

```powershell
clasp push
npx clasp push
npm exec -- clasp push
```

理由は、暗黙のproject設定やデフォルト認証を使い、CI用と本番用を取り違える可能性があるためです。

次の情報はコミット、Issue、PR、コメントへ載せません。

- Script ID
- Deployment ID
- Web App URL
- Spreadsheet URLまたはID
- Drive folder ID
- OAuth token
- `.clasprc.json`の内容
- `.clasp.production.json`の実値
- GitHub Secretsの実値

## 困ったとき

### 本番用project設定がない

`.clasp.production.example.json`を`.clasp.production.json`へコピーし、`scriptId`のplaceholderを本番Script IDへ置き換えます。

### production認証を確認できない

次を再実行し、本番運用アカウントでログインします。

```powershell
npm exec -- clasp login --user production
```

### developではない、または最新developではない

```powershell
git switch develop
git pull --ff-only origin develop
```

未コミット変更がある場合は、内容を確認してcommitまたはstashしてから進めます。

### CIが失敗した

- GAS Testsの詳細は[`docs/gas-ci.md`](gas-ci.md)を確認する。
- Web E2Eの詳細は[`docs/gas-web-e2e.md`](gas-web-e2e.md)を確認する。
- 本番反映workflowの詳細は[`docs/production-deploy.md`](production-deploy.md)を確認する。
- CI用設定を直すためにローカルからCI用Apps Scriptへpushしない。
