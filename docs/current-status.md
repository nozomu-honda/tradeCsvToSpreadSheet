# Current Status

最終更新: 2026-07-16

このファイルは、最新 `develop` とGitHub上のIssue/PR状態を前提に、次の作業判断に必要な現状だけをまとめる。
長い履歴や古い推測は残さず、完了済み・未反映・次候補が分かる状態を維持する。

## 現在のGitHub状態

- Issue #75「現状ドキュメントを最新developの状態へ整理する」はPR #77で対応完了。
- PR #77「現状ドキュメントを最新developに合わせて整理する」は `develop` にSquash Merge済み。
- Issue #76「野村共通CSVのWeb E2E基盤と日本株1ケースを追加する」はPR #78で実装完了。
  - 2026-07-14時点のGitHub APIではIssue自体はOPENのため、必要なら人間がクローズ確認する。
- PR #78「野村日本株のGAS Web App E2Eを追加」は `develop` にSquash Merge済み。
- Issue #81「本番bundleからE2E helper除外後のWeb/DB参照切れを修正する」はPR #82で実装完了。
  - 2026-07-14時点のGitHub APIではIssue自体はOPENのため、必要なら人間がクローズ確認する。
- PR #82「本番bundleからE2E helper除外後の参照切れを修正」は `develop` にSquash Merge済み。
- Issue #83「本番反映のGitHub Actions化と本番状態追跡を実装する」は対応中。
- PR #84の本番反映基盤は `develop` へマージ済み。PR #87、PR #90、PR #92でcontrol/deploy workflowをdefault branch `main` へ同期済み。
- PR #95は、本番pushの暗黙skip防止、リモートHEAD／deployment versionと対象SHAの本番bundle完全一致検証を追加し、`develop` へSquash Merge済み。
- PR #95反映後の本番runではsource push、remote source、deployment update、deployment version検証まで成功したが、Web access gateがHTTP 404で失敗した。
- PR #96は、正しい本番設定 `ANYONE` / `USER_ACCESSING` をmanifestへ追加し、Apps Script APIによる更新前後の `WEB_APP`検証を追加して `develop` へマージ済み。
- PR #96マージ後のAuthenticated dry-run 29436843157は `deployment-target-verification` で失敗した。抽象エラーだけでは失敗条件を特定できなかったため、安全なreason分類を追加中。
- Production Status Issue #88は `failed`、最終失敗ステージは `smoke-test`。Apps Script管理画面では対象deploymentのWebアプリ設定消失が確認されており、復旧完了まで正常稼働の根拠にしない。
- Issue #98の方針により、GitHub Actionsは全面停止中。workflow実行、rerun、最終CIラベル、本番workflowは使用しない。
- Issue #99では、docs-onlyのActions run 0件、現在head/develop base SHAのレビュー完了ゲート、backend GAS-onlyとWeb E2E対象の分離、成功済み同一head/base check再利用を実装中。

## 完了済みの主な範囲

### 基本機能

- 野村CSV/スプレッドシート取込の既存仕様を維持。
- 取込データを内部共通レコードへ正規化し、DB保存と出力生成へ流す構成を維持。
- 6シート出力に対応済み。
  - `日本株`
  - `米国株`
  - `外債`
  - `投信`
  - `金銭残高（円）`
  - `金銭残高（ドル）`
- Web UIの見出し、実行ボタン、結果表示は6シート前提へ更新済み。
- 実行結果に `外債件数` を表示済み。
- 出力タブ順は `日本株 -> 米国株 -> 外債 -> 投信` を含む固定順へ整理済み。
- `runStagingSheetFromWebApp` の重複定義は現在の `develop` では確認されない。
- `test DB` では赤セル必須入力バリデーションをスキップできる設計を維持。
- 重複判定は `rowHash`、ロールバックは `importId` 単位の論理削除を維持。

### 楽天対応

- 楽天証券 Phase 1 / Phase 2 の主要入力形式に対応済み。
  - 楽天日本株
  - 楽天米国株
  - 楽天投資信託
  - 楽天配当金・分配金
  - 楽天入出金履歴
- 楽天入力時は、取込UIで選んだ通常DBキーを内部で楽天DBキーへルーティングする。
  - `nomura_corp_a` -> `rakuten_corp_a`
  - `nomura_corp_b` -> `rakuten_corp_b`
  - `nomura_test` -> `rakuten_test`
- 楽天DBは `uiVisible: false` とし、取込用UIには直接表示しない。
- DBリセット/ロールバック用UIでは、楽天DBも対象に含める。
- 楽天DBは `RAKUTEN_DB_HEADERS` を使って保存する。
- 楽天DBレコードから共通計算モデルへ戻す変換は実装済み。
- 楽天配当金CSVの手入力列 `レート` / `現地源泉税［円］` / `国内源泉税［円］` は検出・バリデーション・DB保存・出力反映まで初期対応済み。
- 楽天出力は次の初期専用シート対応まで完了。
  - `楽天日本株`
  - `楽天米国株`
  - `楽天投資信託`
  - `金銭残高（円）`
  - `金銭残高（ドル）`
- 楽天配当金・分配金・元本払戻金は、既存楽天タブと金銭残高への代表値反映、E2Eでの主要値確認まで進んでいる。

### GAS CI / clasp運用

- Actions再開後のPR向け最終CIは、現在head SHAとdevelop base SHAのレビュー完了コメント後に `run-final-ci` ラベルを付けた時だけ起動する。Actions全面停止中は使用しない。
- docs-onlyはcontrollerの `paths-ignore` でActions run自体を作らず、API側でも重いjob 0回で拒否する。
- 軽量ゲートはcheckout、Node setup、npm、clasp、Google Secrets参照より前に、PR状態、base branch、event/current head SHA、event/current base SHA、両SHAのレビュー完了コメント、same-repository、未解決thread、最新review state、変更ファイル全ページを確認する。
- PR向けGAS CIは、テスト専用Apps Scriptプロジェクトだけへpushする。
- CIでは `pull_request_target` を使わず、fork / external PRへGoogle Secretsを渡さない。
- GAS CIは `runAllTests()` の1回実行ではなく、`runGasTestBatch01` から `runGasTestBatch09` までの9バッチを順番に実行する。
- バッチ定義の欠落・重複・公開入口数の不一致を検知する検証を追加済み。
- `runSmokeTests()` と `runAllTests()` は手動確認用の既存テスト入口として残っている。未実装タスクではない。
- CI用clasp project設定はrunner一時領域へ生成し、すべてのCI側clasp操作で `--project <CI専用設定ファイル>` と `--ignore <repo .claspignore>` を明示する。
- CI用project設定の `rootDir` はリポジトリルートの絶対パスへ正規化し、`CLASP_PROJECT_JSON` の相対 `srcDir` はCIでは使わない。
- backend GAS-onlyではGAS Testsだけを実行する。UI・Web・認証・manifest・deployment・E2E関連ではGAS Tests -> GAS Web App E2Eの順で直列実行する。未知パスは安全側でWeb E2E対象にする。
- 同じhead/base SHAの組で成功済みのGAS Tests / Web E2Eは、head SHA上に発行されbase SHAも記録された成功Check Runを正本として重い処理だけ再利用する。Checks APIは `filter=all` と全ページ取得を使い、同名の新しい自動job checkがあってもcontext付き成功履歴を検索する。
- Web E2EのHTTP 403 skip、Playwright未実行、動的deployment cleanup失敗、Check Run発行失敗は成功扱いにしない。
- 旧ラベルの `run-gas-tests` / `gas-web-e2e` は最終CIの起動には使わない。
- 軽量ゲートはPR単位のconcurrencyで同じPRの旧判定だけを置き換える。GAS Tests と GAS Web App E2E の実runは、共通の `gas-shared-test-project` concurrency groupへ `queue: max` で複数待機させて直列化し、cleanupを含む実行中runや先行pending runは自動キャンセルしない。
- ゲート拒否と全check再利用はゲートrunnerだけで完了し、summary専用runnerは使わない。GAS-onlyの最終summaryはGAS job、Web E2E対象の最終summaryはWeb jobへ統合する。
- CI用と本番用のclasp操作は分離済み。
- 本番Apps Script操作は次の本番専用npmコマンドだけを使う。
  - `npm run gas:production:open`
  - `npm run gas:production:status`
  - `npm run gas:production:push`
- 本番用project設定は `.clasp.production.json`、本番用ignoreは `.clasp.productionignore`、認証はclasp named user `production` を使う。
- 本番用 `.clasp.productionignore` では `src/test/**` と `src/app/e2e_helpers.gs` をpush対象から除外する。
- 本番用ラッパーは、`src/test/**` または `src/app/e2e_helpers.gs` の除外設定が欠けている場合、`status` / `open` / `push` を安全側で停止する。
- Issue #83で、本番反映をGitHub Actionsの `Deploy production` workflowへ移す対応を進めている。
  - PR #84はIssue #83の一部対応であり、Issue #83は後続作業完了までopenのままにする。
  - 正式経路は、developへマージ済みPRへの `deploy-production-dry-run` / `deploy-production` / `deploy-production-force` ラベル付与。
  - default branch `main` 上のcontrol workflowがPRラベルを検証し、`deploy-production.yml` を `ref: develop` でdispatchする。
  - deploy workflow本体は `workflow_dispatch` のみで起動し、`HEAD == origin/develop == target_sha` を確認してから進む。
  - control workflowとdeploy workflowはPR #87で `main` へ初回同期し、PR #90とPR #92で後続修正も同期済み。
  - 今後develop側の本番workflow定義を変更した場合は、マージ後に別PRで `main` へ同期する必要がある。developからcheckoutされるスクリプトだけの変更は追加同期不要。
  - `Deploy production` workflow内では、Environmentなしの `production-preflight` job、`production-preflight` Environment付きの authenticated dry-run job、`production` Environment付きの `deploy-production` mutation jobを分離する。
  - Static dry-runは本番Secretsなし、Authenticated dry-runは `production-preflight` Environment承認後に本番認証と `gas:production:status` まで確認する。
  - duplicate拒否、required checks / `npm ci` / validation / bundle境界 / Status Issue読込のEnvironmentなしpreflight失敗では、Environment Deployment履歴を作らない。
  - develop push時のmetadata-only workflowで、Production Status Issueを `not-deployed` へ更新する。
  - Production Status Issue番号はRepository Variable `PRODUCTION_STATUS_ISSUE_NUMBER` だけを正本にし、Environment側に同名Variableを置かない。
  - Status Issue番号未設定時はmetadata syncを安全にskipする。
  - deploy workflowとstatus sync workflowは共通concurrency `production-state` でStatus Issueの並行更新を避ける。
  - Authenticated dry-runと `dry_run=false` の本番deployでは、required checks / `npm ci` / validationより前にProduction Status Issueを読み、現在の本番commitと最終成功deployment情報をstateへ反映する。
  - preflight失敗時も、既存の本番SHA、最終成功deployment日時、最終本番反映workflow、前回工程結果を `unknown` で上書きしない。
  - 同一SHAがすでに `deployed` の場合、`force=false` の通常再実行は安全に拒否し、Production Status Issueを `failed` へ変更しない。
  - Static dry-runはProduction Status Issueを読まず、本番Secretsも要求しない。
  - source push後にdevelopが進んだ場合は、本番反映工程が成功してもStatus Issueは `not-deployed` にする。
  - Status Issueでは最新developの反映状態と、最後に成功した本番反映の工程結果・workflow URLを分けて表示する。
  - GitHub Environment `production-preflight` はauthenticated dry-run用、`production` は実本番mutation用として分ける。
  - GitHub Environment `production` とProduction Status Issueで本番状態を追跡する。
  - GitHub DeploymentはEnvironment側を正本にし、スクリプトから追加作成しない。Environment履歴は実本番mutationを開始したrunだけを記録する。
  - 本番workflow用の `CLASP_PRODUCTION_CREDENTIALS`、`PRODUCTION_SCRIPT_ID`、`PRODUCTION_DEPLOYMENT_ID` はRepository Secretsへ置かず、`production-preflight` と `production` の各Environment Secretsへ登録する前提。
  - `PRODUCTION_WEB_APP_URL`、任意の `PRODUCTION_SMOKE_EXPECTED_MARKER` / `PRODUCTION_REQUIRED_CHECKS` はRepository Variablesへ置かず、`production-preflight` と `production` の各Environment Variablesへ登録する前提。
  - 本番push、既存Webアプリdeployment更新、Status Issue更新は `dry_run=false` の時だけ行う。
- clasp反映手順は `docs/clasp-operations.md` に整理済み。

### Web App E2E

- PR #78で野村日本株Web App E2Eを追加済み。
- Web App E2Eは、野村1ケース + 楽天7ケースの合計8ケース。
  - 野村日本株
  - 楽天日本株
  - 楽天米国株
  - 楽天投資信託
  - 楽天入出金履歴
  - 楽天米国株配当
  - 楽天投信分配金
  - 楽天元本払戻金
- PR #78の最新headで `Push test GAS project and run tests` と `Deploy test Web app and run Playwright E2E` は成功済み。
- GAS Web App E2Eは、テスト専用Apps Scriptプロジェクトへpushし、一時Webアプリdeploymentを作成してからPlaywrightで確認する。
- 一時Webアプリdeploymentはテスト後に削除する。
- 出力Spreadsheet検査は `checks` と `rowChecks` に対応済み。
- `rowChecks` により、同じ行の複数列を検査できる。
- 楽天元本払戻金E2Eでは、買付行と払戻行の取り違えを避けるため、払戻行そのものを `rowChecks` で確認する。
- E2E出力Spreadsheetはケース開始前に初期化し、前ケースの出力シートが残って次ケースに影響しないようにした。
- CIローカルソース上だけで `nomura_test.spreadsheetId` を空にし、CI実行アカウントがテスト専用DBを作成・再利用できるようにした。
- リポジトリ上の本番設定や実IDは変更していない。

### 本番bundle境界

- PR #80で、本番push対象から `src/test/**` と `src/app/e2e_helpers.gs` を除外する安全対策を追加済み。
- PR #82で、本番bundleから `src/app/e2e_helpers.gs` を除外したまま、通常Web/DB処理の参照切れを解消済み。
- 通常Web/DB処理から参照されるruntime supportは `src/app/e2e_runtime_support.gs` へ移動済み。
- 公開E2E helperである `src/app/e2e_helpers.gs` は引き続き本番bundleから除外する。
- `src/app/e2e_runtime_support.gs` と `src/app/e2e_helpers.gs` の二重定義は避けている。
- 本番bundle境界テストを追加済み。
- PR #82の最新headで `Push test GAS project and run tests` と `Deploy test Web app and run Playwright E2E` は成功済み。
- 通常Web関数のうち `listRecentImportsFromWebApp()` はページ初期化時の `loadRecentImports()` からユーザー操作なしで呼ばれる。
- 本番runtimeで `assertCiE2eTokenForWebAppIfConfigured_` が欠落すると、最近の取込一覧だけでなく、DBを開く、DBリセット、ロールバック、取込、一次受け枠作成を含む通常Web操作が業務処理前に失敗する。

### ドキュメント / 運用ルール

- `AGENTS.md` に、GitHub上の人間が読む文章を原則日本語で書くルールを追加済み。
- `docs/gas-ci.md` にGAS CIの実行条件、Secrets、失敗判定、clasp run fallbackを整理済み。
- `docs/gas-web-e2e.md` にWeb App E2Eの対象、Secrets、セキュリティ境界、workflow summaryを整理済み。
- `docs/clasp-operations.md` にCI用と本番用の反映手順を整理済み。
- `docs/production-deploy.md` に本番反映workflow、dry-run、Secrets / Variables、Production Status Issue、失敗時の扱いを整理済み。
- `docs/production-deploy-control.md` にdefault branch `main` へ同期が必要なcontrol workflowの境界を整理済み。

## 本番反映の現状

- 先行障害のページ初期表示時ReferenceErrorは、PR #95でpushの暗黙skip防止と対象SHA bundleの完全一致検証を追加して対策済み。
- PR #95反映後の本番runでは、対象SHAのsource pushとremote source／deployment versionの完全一致は成功した。
- 同runのdeployment更新後、Web access gateがHTTP 404となり、Apps Script管理画面では対象deploymentがWebアプリではなくなっていた。
- 根本原因は、リポジトリの `appsscript.json` に `webapp` 設定がなく、source push後の新versionがWeb App構成を持たないまま既存deploymentへ割り当てられたこと。
- PR #96で `appsscript.json` に `ANYONE` / `USER_ACCESSING` を明示し、Apps Script APIで更新前後の `WEB_APP` entry point、URL fingerprint、version、entry point type、アクセス設定、deployment総数をfail closedで検証するようにした。
- Authenticated dry-run 29436843157では `Production Web App entry point verification failed.` だけが出力され、API、deployment、entry point、URL、access / executeAsのどこで失敗したか判断できなかった。
- 本対応では実値を含まない固定reasonをActionsログとStep Summaryへ出す。Authenticated dry-runではStatus Issueを更新せず、本番mutation時だけ同じ安全なfailure messageをStatus Issueへ保存する。
- 更新前はstrict検証で `WEB_APP` 1件、設定URL一致、`ANYONE` / `USER_ACCESSING` を必須にする。更新後はcomparison snapshotで件数、entry point type、URL fingerprint、access、executeAsを比較し、`WEB_APP_ENTRY_POINT_DISAPPEARED`、`WEB_APP_URL_CHANGED`、`ACCESS_CHANGED`、`EXECUTE_AS_CHANGED` などの更新後専用reasonへ分類する。
- reasonと出力にはScript ID、Deployment ID、Web App URL、URL fingerprint、snapshot、token、credential、Apps Script APIレスポンス全文、Google API内部エラー本文を含めない。
- `clasp update-deployment` はApps Script API `projects.deployments.update` と同じ更新requestを使うため維持する。直接API更新へ置き換えるだけでは根本原因を解消しない。
- 本番復旧には、人間がApps Script管理画面でWebアプリdeploymentを修正または再作成し、ID／URLが変わった場合は両Environment設定を更新した上で、最新 `develop` のAuthenticated dry-runと本番反映を確認する必要がある。
- 通常運用はマージ済みPRへ `deploy-production` ラベルを1回付け、preflight、Environment承認、更新前Web App確認、source push、deployment更新、更新後Web App確認、Web access gateまで実行する。dry-runは初回設定や障害調査時だけ任意利用する。
- GitHub Environment、Secrets / Variables、Production Status Issue、起動ラベル、`main` のcontrol/deploy workflowは本番run起動済みのため設定経路自体は利用可能。今回の修正はdevelop側スクリプトだけの変更なので、マージ後に追加のmain同期をせず再確認できる。

手動fallbackの基本手順:

```bash
git switch develop
git pull
npm ci
npm run gas:production:status
npm run gas:production:push
```

その後、人間がApps Script管理画面で既存Webアプリdeploymentを新バージョンへ更新する。
GitHub Actions経由では、URL内deployment IDとの一致、更新前の `WEB_APP` entry point、push後リモートHEADと対象SHAのローカル本番bundleの完全一致、既存deploymentのversion更新、更新後の `WEB_APP` entry pointとURL fingerprint、更新versionとの完全一致を確認してから既存WebアプリURLを維持したまま更新する。

- runtime helperや必須関数の存在だけでは業務コード全体が対象SHAと一致することを保証できないため、claspの `filesToPush` を正本に全ファイルのpathとSHA-256を比較する。
- 更新前に `WEB_APP`を確認できない場合はsource push前に停止する。remote HEAD不一致ではdeployment更新前に停止する。更新後の `WEB_APP`消失、URL変更、entry point type変更、deployment version不一致では更新済みの事実を保持したままSmoke Testへ進まず、現在の本番commitを `unknown`、Status Issueを `failed` とし、最終成功本番反映commitを更新しない。
- Web App検証失敗時は `Production Web App verification failed: <safe reason>.`、更新後比較失敗時は `Production Web App update verification failed: <safe reason>.` を確認する。HTTP 404は引き続き成功扱いにしない。

本番push前の確認:

- `npm run gas:production:status` のTracked filesに次が含まれないこと。
  - `src/test/**`
  - `src/app/e2e_helpers.gs`
- 上記2つはUntrackedとして扱われること。
- 本番対象に `src/app/e2e_runtime_support.gs` が含まれること。
- `appsscript.json` に `webapp.access = ANYONE` と `webapp.executeAs = USER_ACCESSING` が含まれること。
- 実Script ID、Deployment ID、Web App URL、Spreadsheet URL、Drive folder ID、OAuth token、GitHub Secrets実値をログやdocsへ残さないこと。

## 未完了 / 確認待ち

- 本番Apps Scriptへの `npm run gas:production:push`。
- 本番Webアプリの既存deployment更新。
- 修正版workflowによるAuthenticated dry-runと本番再反映。
- 本番Webアプリを人間がログイン後に開き、初期表示と最近の取込一覧でReferenceErrorが出ないことの確認。
- DBを開く、DBリセット、ロールバック、CSV・スプレッドシート取込、一次受け枠作成の通常操作確認。破壊的操作は対象と権限を確認した上で人間が実施する。
- 今回の修正を `develop` へマージした後、Authenticated dry-runから再確認すること。workflow YAMLを後続変更する場合だけdefault branch `main` へ同期する。
- `Deploy production` workflowのStatic dry-run / Authenticated dry-run確認。
- dry-run成功後の本番反映実行。
- Issue #76 / Issue #81 は実装対応済みだが、GitHub Issue自体はOPENの場合があるため、必要なら人間がクローズ確認する。
- 別ユーザーでのDrive OAuth承認、DBフォルダ編集権限、Webアプリ実行確認。
- 楽天米国株・楽天投資信託・楽天金銭残高・配当金/分配金/元本払戻金の実運用データでの最終確認。
- 楽天専用ロールバックUI分離の実運用Web UI表示確認。
- 楽天配当金・分配金・元本払戻金の全列・全ケースを、Driveの最終見た目に近い楽天専用出力として完全再現する対応。
- 外債、大容量CSV、入力異常系、rollback異常系のWeb App E2E。

## 次の開発優先順位

1. 外債Web E2Eを追加する。
2. 大容量CSV Web E2Eを追加する。
3. header不足、不正CSV、重複importなどの異常系Web E2Eを追加する。
4. rollback異常系Web E2Eを追加する。
5. 楽天の実運用データ確認を進める。
6. 楽天の残りの専用出力対応を進める。

## 外債Web E2Eの想定

- まだIssue未作成。
- 野村日本株Web E2Eの次の自然な拡張候補。
- 外債CSV取込をWeb UI経由で確認する。
- 外債行が `外債` シートへ出力され、`米国株` へ混ざらないことを確認する。
- 出力リンクから外債シートと主要セルを検査する。
- cleanup / rollback を確認する。
- ケース開始前のE2E出力Spreadsheet初期化を維持する。
- 楽天既存7ケースと野村日本株ケースを壊さない。
- 実URL、Spreadsheet ID、Drive folder ID、tokenをログやfixtureへ出さない。

## テスト運用

- 軽い手動確認は `runSmokeTests()` を使う。
- 手動の一括確認入口は `runAllTests()` を使う。
- CIではApps Scriptの実行時間上限を避けるため、`runAllTests()` 相当の一覧を `runGasTestBatch01` から `runGasTestBatch09` までに分割して実行する。
- Actions再開後のPR最終確認は、現在head SHAとdevelop base SHAのレビュー完了コメントを付けた後に `run-final-ci` ラベルで起動する。
- Final CIでは変更分類に応じてGAS Testsだけ、またはGAS Tests成功後のWeb E2Eを実行する。docs-onlyではActions runを作らない。
- Final CIの再利用判定は、head SHA上に発行され、同じdevelop base SHAを記録した成功Check Runだけを対象にする。Web E2Eの403 skipやcleanup失敗は再利用対象外。
- 追加コミットでhead SHAが変わった場合、またはdevelop更新でbase SHAが変わった場合は、ラベルを外し、新しいhead/baseの組を再レビューして新しいレビュー完了コメントを付けてから再付与する。

## Codexへの伝え方

手動マージや手動確認をした後は、このファイルを更新してからCodexに以下のように伝える。

```text
最新の docs/current-status.md を読んで、develop 最新を前提に作業してください。
まだコード変更はしないでください。
```

Codexへの依頼テンプレートは `docs/codex-prompts.md` を使う。
AutoHotkeyショートカットの説明は `docs/codex-shortcuts.md` を参照する。

## 注意点

- 実際のScript ID、Deployment ID、Web App URL、Spreadsheet URL、Drive folder ID、OAuth token、GitHub Secrets実値はコミットしない。
- 人・Codexともに、リポジトリ直下でbareな `clasp push` を実行しない。
- CI操作はGitHub Actionsだけに任せ、本番反映は人間が `Deploy production` workflowまたは手動fallbackで行う。
- Codexは本番反映、GitHub Secrets変更、本番GAS・本番DB・本番Drive操作を実行しない。
- `appsscript.json` のOAuth scope変更後は、Webアプリの新バージョン再デプロイが必要。
- Webアプリを「アクセスしているユーザー」として実行する場合、利用者ごとにDrive権限承認とDBフォルダ編集権限が必要。
- `spreadsheetId` 未設定DBは Script Properties の `DB_SPREADSHEET_ID_<DB_KEY>` に実ファイルIDを保存して再利用する。
