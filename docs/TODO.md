# TODO / 引き継ぎメモ

このファイルは、次に実装・確認する候補だけをまとめる。
現在の状態判断は `docs/current-status.md` を正とし、古い推測ベースの記述は使わない。

## 現在の前提

- 最新 `develop` では、Issue #71 / PR #72 のclasp分離対応は完了済み。
- 最新 `develop` では、Issue #73 / PR #74 のclasp運用ガイド整理は完了済み。
- 最新 `develop` では、Issue #79 / PR #80 の本番push対象からE2E専用helperを除外する対応は完了済み。
- 楽天DBの専用ヘッダー対応、楽天DBから共通計算モデルへの変換、楽天配当金の手入力列対応は完了済み。
- Web UIの6シート表記、外債件数表示、タブ順固定、`runStagingSheetFromWebApp` の重複整理は完了済み。
- `runSmokeTests()` と `runAllTests()` は未実装タスクではなく、既存の手動テスト入口として扱う。
- 本番Apps Scriptへのpushと本番Webアプリ再デプロイは未実施。
- 本番反映前は、最新 `develop` で `npm run gas:production:status` を再確認し、`src/test/**` と `src/app/e2e_helpers.gs` が本番push対象に含まれないことを確認する。

## 次の開発候補

### 1. 野村共通CSV Web E2E

Issue #76 / PR #78で対応中。Draft PRが未マージのため、完了済み扱いにはしない。

確認したいこと:

- Web UIから野村共通CSVをアップロードできる。
- `nomura_test` へ保存される。
- 楽天DBへ誤ルーティングされない。
- 6シート出力が作成される。
- 出力リンクから主要シートと主要セルを検査できる。
- cleanup / rollback が成功する。
- 実URL、Spreadsheet ID、Drive folder ID、tokenをログやfixtureへ出さない。

### 2. 外債Web E2E

PR #78の完了後に、外債を含むWeb App E2Eの追加を検討する。PR #78が未マージの間は、次の確定着手対象として前倒ししない。

確認したいこと:

- 外債行が `外債` シートへ出力される。
- `米国株` へ混ざらない。
- 実行結果に `外債件数` が出る。
- タブ順が崩れない。
- 外債の主要列、為替レート、簿価、金銭残高への影響を確認できる。

### 3. 大容量CSV Web E2E

代表的な大容量CSVで、Web UIからのアップロード、取込、出力、cleanupが現実的な時間内に終わることを確認する。

確認したいこと:

- ブラウザ操作がタイムアウトしない。
- GAS実行時間上限に近づくケースを検知できる。
- 重複判定や件数表示が大きい入力でも崩れない。
- fixtureやログに実運用データを含めない。

### 4. 入力異常系Web E2E

header不足、不正CSV、重複importなどの異常系をWeb UI経由で確認する。

候補:

- 必須header不足。
- 不正なCSV構造。
- 空ファイル。
- サポート外フォーマット。
- 同じCSVの再投入による `insertedCount = 0` / `skippedCount = rowCount`。
- 一部重複を含むCSVで `insertedCount > 0` / `skippedCount > 0`。
- 赤セル必須入力と `test DB` のバリデーションスキップ境界。

### 5. rollback異常系Web E2E

rollbackの正常系は既存E2Eで使っているが、異常系の明示確認は残っている。

候補:

- 存在しない `importId`。
- すでにrollback済みの `importId`。
- 対象DBを間違えた場合。
- 楽天入力後に実際の追加先DBへrollback対象が合うこと。
- cleanup helperの失敗時にworkflowが失敗すること。

### 6. 楽天の実運用データ確認

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

### 7. 楽天の残りの専用出力対応

楽天配当金・分配金・元本払戻金は、既存楽天タブと金銭残高への代表値反映まで進んでいる。
ただし、Driveの最終見た目に近い全列・全ケースの専用出力再現は残っている。

候補:

- 楽天米国株配当の全列再現。
- 楽天投信分配金の全列再現。
- 楽天元本払戻金の全列再現。
- 楽天cash系出力の実運用データ確認後の不足列補完。

## 運用上の未完了事項

- 本番反映前に、最新 `develop` を取得して `npm run gas:production:status` を再確認する。
- 本番push対象のTracked filesに `src/test/**` が含まれないことを確認する。
- 本番push対象のTracked filesに `src/app/e2e_helpers.gs` が含まれないことを確認する。
- 本番Apps Scriptへの `npm run gas:production:push`。
- 本番Webアプリの新バージョン再デプロイ。
- 本番Webアプリの主要画面確認。
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
  - `Deploy test Web app and run Rakuten Playwright E2E` の成功を確認する。

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

## 関連ドキュメント

- 現状整理: `docs/current-status.md`
- GAS CI詳細: `docs/gas-ci.md`
- Web App E2E詳細: `docs/gas-web-e2e.md`
- clasp反映手順: `docs/clasp-operations.md`
- 仕様: `docs/spec.md`
- 取引ルール: `docs/trade-rules.md`
- Codex依頼テンプレート: `docs/codex-prompts.md`
