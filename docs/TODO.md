# TODO / 引き継ぎメモ

このファイルは、次に実装・確認する候補だけをまとめる。
現在の状態判断は `docs/current-status.md` を正とし、古い推測ベースの記述は使わない。

## 現在の前提

- 最新 `develop` では、Issue #71 / PR #72 のclasp分離対応は完了済み。
- 最新 `develop` では、Issue #73 / PR #74 のclasp運用ガイド整理は完了済み。
- 最新 `develop` では、Issue #79 / PR #80 の本番push対象からE2E専用helperを除外する対応は完了済み。
- 最新 `develop` では、Issue #76 / PR #78 の野村日本株Web E2E追加は完了済み。
- 最新 `develop` では、Issue #81 / PR #82 の本番bundle参照切れ修正は完了済み。
- Issue #83で、本番反映をGitHub Actions化し、Production Status Issueで本番状態を追跡する対応を進めている。
- 楽天DBの専用ヘッダー対応、楽天DBから共通計算モデルへの変換、楽天配当金の手入力列対応は完了済み。
- Web UIの6シート表記、外債件数表示、タブ順固定、`runStagingSheetFromWebApp` の重複整理は完了済み。
- `runSmokeTests()` と `runAllTests()` は未実装タスクではなく、既存の手動テスト入口として扱う。
- Web App E2Eは、野村1ケース + 楽天7ケースの合計8ケースまで完了済み。
- 本番Apps Scriptへのpushと本番Webアプリ再デプロイは、PR #82マージ後まだ未実施。
- 現在の本番Webアプリには、Issue #81修正前のbundleが反映されている可能性がある。

## 本番反映前の確認

本番復旧には、最新 `develop` を本番Apps Scriptへ再反映し、Apps Script管理画面で既存Webアプリdeploymentを新バージョンへ更新する必要がある。

基本手順:

```bash
git switch develop
git pull
npm ci
npm run gas:production:status
npm run gas:production:push
```

`npm run gas:production:status` で確認すること:

- Tracked filesに `src/test/**` が含まれない。
- Tracked filesに `src/app/e2e_helpers.gs` が含まれない。
- `src/test/**` と `src/app/e2e_helpers.gs` はUntrackedである。
- 本番対象に `src/app/e2e_runtime_support.gs` が含まれる。
- 実Script ID、Deployment ID、Web App URL、Spreadsheet URL、Drive folder ID、OAuth token、GitHub Secrets実値をログやdocsへ残さない。

Issue #83対応後の基本フロー:

1. マージ済みPRへ `deploy-production-dry-run` ラベルを付け、Authenticated dry-runを実行する。
2. dry-runでrequired checks、本番wrapper検証、本番bundle境界検証、`npm run gas:production:status -- --json`、重複反映ガードを確認する。
3. 問題がなければ、人間が `deploy-production` ラベルで本番反映を起動する。
4. Production Status IssueとGitHub EnvironmentのDeployment履歴を確認する。

初回運用前に必要なこと:

- GitHub Environment `production` を作成する。
- Environment Secrets `CLASP_PRODUCTION_CREDENTIALS`、`PRODUCTION_SCRIPT_ID`、`PRODUCTION_DEPLOYMENT_ID` を設定する。
- Environment Variables `PRODUCTION_WEB_APP_URL`、`PRODUCTION_STATUS_ISSUE_NUMBER`、必要なら `PRODUCTION_SMOKE_EXPECTED_MARKER` を設定する。
- 管理marker `<!-- production-status:managed-by-github-actions -->` を含むProduction Status Issueを作成し、実値を貼らずに状態追跡用として使う。
- 起動ラベル `deploy-production-dry-run`、`deploy-production`、`deploy-production-force` を作成する。
- default branch `main` で `issues:labeled` workflowが起動できるよう、workflow定義の同期要否を人間が確認する。
- Static dry-runとAuthenticated dry-runが成功することを確認する。

Codexは本番Apps Scriptへのpush、本番Webアプリdeployment更新、GitHub Secrets / Variables変更、GitHub Environment作成、production workflow実行を行わない。

## 次の開発候補

### 1. 外債Web E2E

最優先候補。まだIssue未作成。

野村日本株Web E2Eの次の自然な拡張として、外債CSV取込から外債シート出力までをWeb UI経由で確認する。

確認したいこと:

- Web UIから外債を含む野村CSVをアップロードできる。
- `nomura_test` へ保存される。
- 外債行が `外債` シートへ出力される。
- 外債行が `米国株` へ混ざらない。
- 実行結果に `外債件数` が出る。
- 外債の主要列、為替レート、簿価、金銭残高への影響を確認できる。
- 出力リンクから外債シートと主要セルを検査できる。
- cleanup / rollback が成功する。
- ケース開始前のE2E出力Spreadsheet初期化を維持する。
- 楽天既存7ケースと野村日本株ケースを壊さない。
- 実URL、Spreadsheet ID、Drive folder ID、tokenをログやfixtureへ出さない。

### 2. 大容量CSV Web E2E

代表的な大容量CSVで、Web UIからのアップロード、取込、出力、cleanupが現実的な時間内に終わることを確認する。

確認したいこと:

- ブラウザ操作がタイムアウトしない。
- GAS実行時間上限に近づくケースを検知できる。
- 重複判定や件数表示が大きい入力でも崩れない。
- fixtureやログに実運用データを含めない。

### 3. 入力異常系Web E2E

header不足、不正CSV、重複importなどの異常系をWeb UI経由で確認する。

候補:

- 必須header不足。
- 不正なCSV構造。
- 空ファイル。
- サポート外フォーマット。
- 同じCSVの再投入による `insertedCount = 0` / `skippedCount = rowCount`。
- 一部重複を含むCSVで `insertedCount > 0` / `skippedCount > 0`。
- 赤セル必須入力と `test DB` のバリデーションスキップ境界。

### 4. rollback異常系Web E2E

rollbackの正常系は既存E2Eで使っているが、異常系の明示確認は残っている。

候補:

- 存在しない `importId`。
- すでにrollback済みの `importId`。
- 対象DBを間違えた場合。
- 楽天入力後に実際の追加先DBへrollback対象が合うこと。
- cleanup helperの失敗時にworkflowが失敗すること。

### 5. 楽天の実運用データ確認

代表fixtureではなく、実運用に近いデータで確認する。

確認対象:

- 楽天米国株。
- 楽天投資信託。
- 楽天金銭残高。
- 楽天配当金・分配金。
- 楽天元本払戻金。
- 楽天入出金履歴。

注意:

- 実Spreadsheet ID、Drive folder ID、口座情報、個人情報をIssue/PR/docsへ貼らない。
- 必要なら匿名化したfixtureを別PRで追加する。

### 6. 楽天の残りの専用出力対応

楽天配当金・分配金・元本払戻金は、既存楽天タブと金銭残高への代表値反映まで進んでいる。
ただし、Driveの最終見た目に近い全列・全ケースの専用出力再現は残っている。

候補:

- 楽天米国株配当の全列再現。
- 楽天投信分配金の全列再現。
- 楽天元本払戻金の全列再現。
- 楽天cash系出力の実運用データ確認後の不足列補完。

## 運用上の未完了事項

- 本番Apps Scriptへの `npm run gas:production:push`。
- 本番Webアプリの既存deployment更新。
- 本番Webアプリの主要画面確認。
- GitHub Environment `production` の初回設定。
- 本番反映workflow用Secrets / Variablesの初回設定。
- 管理marker付きProduction Status Issueの初回作成。
- 本番反映起動ラベルの初回作成。
- default branch `main` 上でラベル起動workflowが有効になるかの確認。
- `Deploy production` workflowのStatic dry-run / Authenticated dry-run確認。
- `Deploy production` workflowによる本番反映。
- Issue #76 / Issue #81 は実装対応済みだが、GitHub Issue自体はOPENの場合があるため、必要なら人間がクローズ確認する。
- 別ユーザーでのDrive OAuth承認確認。
- 別ユーザーでのDBフォルダ編集権限確認。
- 楽天専用ロールバックUIの実運用表示確認。

## テスト運用メモ

- `runSmokeTests()`
  - 軽い手動確認用。
  - ロジック破壊の早期検知に使う。
- `runAllTests()`
  - 手動の一括確認用。
  - テスト件数が多く、Apps Scriptの実行時間上限に近い場合はCI用バッチ関数を使う。
- `runGasTestBatch01()` から `runGasTestBatch09()`
  - CI用。
  - `runAllTests()` 相当のテスト一覧を分割して実行する。
- PRのGAS最終確認
  - `run-gas-tests` ラベルを付ける。
  - `Push test GAS project and run tests` の成功を確認する。
- PRのWeb App E2E確認
  - `gas-web-e2e` ラベルまたは `workflow_dispatch` で起動する。
  - `Deploy test Web app and run Playwright E2E` の成功を確認する。

## 完了済みとして未完了一覧へ戻さない項目

- 楽天DBの `RAKUTEN_DB_HEADERS` 保存。
- 楽天DBレコードから共通計算モデルへの変換。
- 楽天配当金CSVの手入力3列対応。
- Web UIの6シート表記。
- 実行結果の外債件数表示。
- 出力タブ順固定。
- `runStagingSheetFromWebApp` の重複整理。
- `runSmokeTests()` / `runAllTests()` のソース管理。
- CI用と本番用のclasp設定分離。
- clasp反映手順の `docs/clasp-operations.md` への整理。
- 本番push対象からの `src/test/**` と `src/app/e2e_helpers.gs` の除外。
- 本番bundle参照切れを防ぐ `src/app/e2e_runtime_support.gs` の本番bundle対象化。
- 野村日本株Web E2Eと楽天7ケースの合計8ケース。

## 関連ドキュメント

- 現状整理: `docs/current-status.md`
- GAS CI詳細: `docs/gas-ci.md`
- Web App E2E詳細: `docs/gas-web-e2e.md`
- clasp反映手順: `docs/clasp-operations.md`
- 本番反映workflow: `docs/production-deploy.md`
- 仕様: `docs/spec.md`
- 取引ルール: `docs/trade-rules.md`
- Codex依頼テンプレート: `docs/codex-prompts.md`
