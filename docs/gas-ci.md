# GAS CI

このリポジトリは Google Apps Script / V8 のプロジェクトです。GAS CI は、GitHub Actions からテスト専用 Apps Script プロジェクトへ clasp でソースを反映し、ソース検証後に可能な場合だけ GAS 上のCI用バッチ関数を `clasp run` で順番に実行します。

CI用バッチ関数は `runGasTestBatch01` から `runGasTestBatch09` までです。各バッチは `CORE_TESTS_` と `FULL_ONLY_TESTS_` を結合した `runAllTests()` 相当のテスト一覧から最大13件ずつ生成します。9バッチに収まらない数までテストが増えた場合は、公開バッチ関数とCIの実行リストを増やさない限り、バッチ定義検証で失敗します。`runAllTests()` は既存の手動確認用入口として残しますが、CIではApps Scriptの実行時間上限を避けるため、`runAllTests` の1回実行ではなく全バッチの逐次実行にします。

標準GCPプロジェクトの制約やOAuth権限により `clasp run` が実行できない環境では、CI専用project設定を明示した `clasp --project <ci-project> push --force` とソース検証をCIの必須確認とし、GAS実行本体は Apps Script エディタから手動でバッチ関数を実行します。

## 目的

個人アカウント所有の公開リポジトリでは GitHub Merge Queue を利用できないため、マージ直前の最終確認は `run-gas-tests` ラベルで明示的に起動します。

現在の方針は次のとおりです。

- PR作成時には重いGASテストを実行しない。
- PRブランチへのpushごとには重いGASテストを実行しない。
- 最終レビュー後に `run-gas-tests` ラベルを付けた時だけGAS CIを起動する。
- docs-only / Markdown-only / GASに影響しない変更では、workflow jobは成功させつつ重いGAS実行をスキップする。
- GAS影響ファイルを含むPRでも、最新コミットがdocs/Markdownだけで、直前headのrequired checkが成功済みなら重いGAS実行をスキップする。
- `clasp run` が実行権限エラーで使えない場合は、CI上では `clasp run unavailable` として記録し、`clasp push` とソース検証が通っていればrequired checkは成功させる。
- テスト失敗、例外、実行時間超過は認証不能fallbackと混同せず、required checkを失敗させる。
- コード変更PRでは、必要に応じて Apps Script エディタでCI用バッチ関数を手動実行し、結果をPR本文へ残す。
- テスト成功後に追加コミットした場合は、`run-gas-tests` ラベルを外して再度付けることで新しいheadに対して再実行する。
- `pull_request_target` は使わない。
- forkや外部PRにはGoogle Secretsを渡さない。

## Workflow

`.github/workflows/gas-tests.yml` は `develop` 向けPRの次のイベントだけで起動します。

- `pull_request` `labeled`

対象ラベルは次の1つです。

- `run-gas-tests`

`opened`、`synchronize`、`reopened`、`ready_for_review`、`workflow_dispatch`、`merge_group` では起動しません。

`run-gas-tests` 以外のラベルで起動した場合は、job名を `Ignore non-GAS label` に切り替えて軽く成功させます。required check名の `Push test GAS project and run tests` は `run-gas-tests` ラベルの時だけ作られるため、通常のラベル運用でGAS checkを誤って成功させたり失敗させたりしません。

`run-gas-tests` ラベル同士は古い実行をキャンセルしますが、通常ラベルの実行は別concurrency groupに分けるため、進行中のGAS最終確認runをキャンセルしません。

## 推奨マージフロー

1. 実装を完了する。
2. 最終レビューを行う。
3. PRに `run-gas-tests` ラベルを付ける。
4. `Push test GAS project and run tests` が成功することを確認する。
5. 以降コード変更せずにマージする。

テスト成功後に追加コミットした場合は、`run-gas-tests` ラベルを一度外してから再度付けてください。これにより、新しいPR headでGAS CIを再確認できます。

追加コミットがdocs/Markdownだけで、直前headの `Push test GAS project and run tests` が成功済みの場合、workflow jobは成功しますが重いGAS実行はスキップします。直前headのrequired checkが失敗・未実行・確認不能の場合は、docs/Markdownだけの最新コミットでもGAS実行を省略しません。

## Codexにマージを依頼する場合

ユーザーがCodexに「マージして」と依頼した場合、Codexはすぐにマージせず、次の順で進めます。

1. 対象PRのhead SHA、base branch、mergeable状態を確認する。
2. `run-gas-tests` ラベルが付いていない場合は付ける。
3. `run-gas-tests` ラベルが既に付いていて最新headのGAS Testsが未確認の場合は、ラベルを一度外して再度付ける。
4. `Push test GAS project and run tests` が最新headで成功するまで待つ。
5. チェック成功後にhead SHAを再確認し、変わっていなければマージする。

GAS Testsが失敗した場合、Codexはマージせず、失敗したcheck名とログ上の原因を報告します。

## Required Check

required check 名は次のまま維持します。

- `Push test GAS project and run tests`

`develop` のrulesetでは、このcheckを必須にしてください。

このrequired check名は `run-gas-tests` ラベルの時だけ出します。`bug` や `docs` など別ラベルを付けた時は、別名の `Ignore non-GAS label` jobとして終了するため、required checkの偽陽性には使われません。

## GAS実行対象の判定

`run-gas-tests` ラベルが付いた場合でも、すべての変更でGASを実行するわけではありません。workflow内で `develop` との差分を確認し、次のようなGAS影響ファイルがある場合だけソース検証、CI専用project設定を明示した `clasp --project <ci-project> push --force`、可能な場合は `clasp --project <ci-project> run` によるCI用バッチ関数の逐次実行を行います。

- `src/**`
- `scripts/**`
- `.github/workflows/**`
- `appsscript.json`
- `Index.html`
- `.claspignore`
- `.clasp.productionignore`
- `.clasp.example.json`
- `.clasp.production.example.json`
- `package.json`
- `package-lock.json`

次のような変更だけの場合、workflow jobは成功しますが、重いGAS実行はスキップします。

- `docs/**`
- `*.md`
- GASコード、CIスクリプト、workflow、設定に影響しないファイル

ただし、PR全体にGAS影響ファイルが含まれていても、最新コミットがdocs/Markdownだけの場合は、直前headのrequired checkを確認します。直前headで `Push test GAS project and run tests` が成功済みなら、最新headのjobは成功させつつ重いGAS実行をスキップします。直前headの成功が確認できない場合は、安全側としてGASを実行します。

`paths-ignore` は使いません。workflow自体をスキップすると、required check が pending のままになりマージをブロックすることがあるためです。

## セキュリティ

- workflowは `pull_request` を使い、`pull_request_target` は使いません。
- `run-gas-tests` ラベルが付いた同一リポジトリPRだけがsecret-backed GAS jobに進めます。
- forkや外部PRでは冒頭のガードで失敗し、Google Secretsを使うstepへ進みません。
- CIの対象はテスト専用 Apps Script プロジェクトだけです。
- CI用のclasp project設定はrunner一時領域に生成し、すべての `clasp` 呼び出しで `--project` により明示します。リポジトリ直下の `.clasp.json` は生成・利用しません。
- `.clasprc.json` はGitHub SecretsからCI runner上に生成し、リポジトリにはコミットしません。
- workflowはCI runner上の `appsscript.json` にだけ `executionApi` を注入してから、テスト専用Apps Scriptへpushします。
- CI用Googleアカウントには、本番GAS、本番Spreadsheet、本番Driveフォルダへの権限を持たせないでください。
- 人・Codexともに、リポジトリ直下でbareな `clasp push` を実行しません。
- 本番反映は `npm run gas:production:push` だけを使い、Codexは実行しません。

## clasp設定の分離

CI用:

- GitHub Actions内だけで使用します。
- project設定は `${RUNNER_TEMP}` 配下へ生成します。
- すべての `clasp` 呼び出しに `--project <CI専用設定ファイル>` を付けます。
- 既存の `.claspignore` を使うため、`src/test/**` を含むGASテストコードもテスト専用Apps Scriptプロジェクトへpushできます。

本番用:

- ローカル専用の `.clasp.production.json` を使います。このファイルは `.gitignore` 対象で、コミットしません。
- placeholderだけを含む `.clasp.production.example.json` をサンプルとして管理します。
- clasp named user `production` を使い、必ず `--user production` を指定します。
- production専用ignoreの `.clasp.productionignore` を使い、少なくとも `src/test/**` を本番Apps Scriptへpushしません。
- 本番操作は `npm run gas:production:open`、`npm run gas:production:status`、`npm run gas:production:push` だけを使います。
- `gas:production:status` は内部で `clasp show-file-status` を実行し、本番専用project設定と本番専用ignoreでpush対象を確認します。
- `gas:production:push` は `develop`、clean working tree、最新 `origin/develop` 一致、production認証、production専用ignore、確認入力を満たさない限り停止します。

## 必要なGitHub Secrets

必須:

- `CLASPRC_JSON`: CIアカウントの `~/.clasprc.json` のJSON内容。
- `GAS_TEST_SCRIPT_ID`: テスト専用 Apps Script プロジェクトのScript ID。

任意:

- `CLASP_USER`: `clasp --user` に渡すユーザー名またはメールアドレス。`CLASPRC_JSON` を `clasp login --user <ci-user>` で生成した場合に設定します。
- `GAS_TEST_DEPLOYMENT_ID`: テスト専用 Apps Script プロジェクトの既存API executable deployment ID。設定した場合だけ、CIが既存deploymentを更新します。未設定の場合、CIは新しいversioned deploymentを作成しません。
- `CLASP_PROJECT_JSON`: `GAS_TEST_SCRIPT_ID` だけでは足りないclasp設定が必要な場合のproject設定JSON全体。CI runnerの一時ファイルへ書き込み、リポジトリ直下には作成しません。
- `GOOGLE_OAUTH_CLIENT_SECRET_JSON`: 現在のclaspベースworkflowでは未使用です。将来 Apps Script API ベースへ移行する場合の候補として残します。

OAuth token、Script ID、deployment ID、Spreadsheet ID、Drive folder ID、本番DB IDなどの実値はコミットしないでください。

テスト専用 Apps Script プロジェクトでAPI executable accessを有効にできる場合は、`clasp run` でCI用バッチ関数をすべて自動実行します。標準GCPプロジェクトの制約などでAPI実行可能ファイルを作成できない場合や、`clasp run` の実行権限が取れない場合は、CIでは `clasp --project <ci-project> push --force` とソース検証までを確認し、GAS実行本体は Apps Script エディタから手動実行します。

## 実行内容

GAS実行対象と判定された場合、workflowは次を行います。

1. `CLASPRC_JSON` から `~/.clasprc.json` を生成する。
2. `GAS_TEST_SCRIPT_ID` からrunner一時領域にCI専用project設定JSONを生成する。`CLASP_PROJECT_JSON` がある場合はそちらを使う。
3. `CLASP_USER` がある場合は `clasp --user "$CLASP_USER" ...` として実行し、すべての `clasp` 呼び出しで `--project <CI専用設定ファイル>` を明示する。
4. ソース管理された `.gs` / `.js` ファイル内にCI用バッチ関数がすべて存在することを確認する。
5. `.gs` ファイルを Node VM parser で構文チェックする。GAS固有APIの実行はしない。
6. CI runner上の `appsscript.json` に `executionApi: { access: 'ANYONE' }` を注入する。
7. テスト専用 Apps Script プロジェクトへ `clasp --project <ci-project> push --force` する。
8. `GAS_TEST_DEPLOYMENT_ID` が設定されている場合だけ、API executable deployment を更新する。未設定の場合は、新しいversioned deploymentを作成せずスキップする。
9. 最新のpush済みコードに対して `clasp run runGasTestBatch01` から `runGasTestBatch09` までを順番に試行する。`clasp push` とdeployment更新は1回だけ行う。
10. 各バッチの開始時に、Apps Script側でバッチ定義の欠落・重複・公開入口数の不一致を検証する。実行権限エラーで使えない場合だけ `clasp run unavailable` として記録し、手動実行へ切り替える。

## ログと失敗判定

`scripts/ci/run-gas-tests.sh` は、GitHub Actionsログを関数名ごとにgroup化し、各関数の結果をGitHub step summaryへ書きます。

workflowは次の場合に明示的に失敗します。

- forkまたは外部PRで `run-gas-tests` ラベルが付いた。
- ソース管理された `.gs` / `.js` ファイル内にCI用バッチ関数がない。
- `.gs` ファイルの Node VM 構文チェックに失敗した。
- CI専用project設定を明示した `clasp push` に失敗した。
- `clasp push`、`clasp create-deployment`、`clasp run` の出力に `No credentials found` が含まれる。
- `clasp run` の出力に `Script function not found` が含まれる。
- GASテスト出力に `NG`、`Exception`、`Error:`、`Exceeded maximum execution time` が含まれる。
- GAS側のバッチ定義検証で、`runAllTests()` 相当のテスト一覧からの欠落、重複、公開入口数の不一致が見つかった。

つまり、GAS側のいずれかのCI用バッチ関数の実結果が失敗した場合、GitHub Actionsのcheckも失敗します。

一方、`Unable to run script function`、`not authorized to execute the function`、`clasp was not authorized` など、`clasp run` の実行権限が原因と判断できる場合は、CI全体は失敗させません。GitHub Step Summary に `clasp run unavailable` と明記し、`clasp --project <ci-project> push --force` とソース検証が通ったことをもってrequired checkを成功させます。このfallbackは認証・実行権限の問題に限定し、テスト失敗や実行時間超過には使いません。

## 手動GASテスト

既存のApps Scriptエディタ上での手動テスト運用は残します。`clasp run unavailable` になったコード変更PRでは、必要に応じて Apps Script エディタから `runGasTestBatch01` から `runGasTestBatch09` までを手動実行し、結果をPR本文へ残してください。`runAllTests()` は従来どおり手動の一括確認用に残しますが、実行時間上限に近い場合はバッチ関数を使います。

ローカルで本番Apps Scriptを操作する場合は、未追跡の `.clasp.production.json` を `.clasp.production.example.json` から作成し、clasp named user `production` で認証してください。bareな `clasp push` やリポジトリ直下の `.clasp.json` に依存する運用は使いません。
