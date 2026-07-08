# Current Status

最終更新: 2026-07-08

## 完了

- 野村CSV/スプレッドシート取込の既存仕様維持。
- 楽天証券 Phase 1 の設計作成。
- 楽天日本株の検出・正規化・DBルーティングを実装。
- 楽天米国株の検出・正規化・DBルーティングを実装。
- 楽天投資信託の検出・正規化を実装。
- 楽天配当金・分配金の検出・正規化を実装。
- 楽天入出金履歴の検出・正規化を実装。
- 楽天専用DBを `uiVisible: false` とする方針を追加。
- 楽天日本株のテスト取込は成功済み。
- DB作成先フォルダ指定の実装を追加。
- オーナー権限では `DriveApp.getFolderById()` が成功することを確認済み。
- Codex移行用の `AGENTS.md` / handoff系ドキュメント / プロンプトテンプレートを追加。
- PR #32「DBリセット/ロールバック対象で楽天DBを個別選択できるようにする」は develop にマージ済み。
  - リセット/ロールバック対象で野村DB・楽天DBを個別選択可能。
  - 選択中DBをUIから開くボタンを追加。
  - 取込用DB一覧は従来どおり `uiVisible !== false` の通常DBのみ表示。
  - 通常DBキーは `nomura_corp_a` / `nomura_corp_b` / `nomura_test` に整理。
  - 楽天入力時は `nomura_*` から対応する `rakuten_*` へルーティング。
  - PR本文上では `runSmokeTests` / `runAllTests` と主要手動確認は完了扱い。
- PR #33「追加先DBの表示名を簡略化」は develop にマージ済み。
  - 追加先DB選択のプルダウンでは、野村/楽天の区別を出さずに法人名とテスト用DBだけを表示。
  - リセット/ロールバック対象DBでは、従来どおり野村DB・楽天DBの区別を表示。
  - `getDbTargetList_()` は `importLabel` を優先し、`getResetDbTargetList_()` は通常 `label` を返す。
  - Apps Script 上の `runAllTests` とWeb UIの主要手動確認は完了扱い。
- PR #31「楽天の追加CSVフォーマットを取り込めるようにする」は develop にマージ済み。
  - 対象: 楽天投資信託、楽天配当金・分配金、楽天入出金履歴。
  - `rakuten_fund` / `rakuten_dividend` / `rakuten_cash` の検出・正規化を追加。
  - Apps Script 上での `runSmokeTests` / `runAllTests` と実CSV取込確認は完了扱い。
- PR #34「Add Rakuten DB schema design」は develop にマージ済み。
  - 楽天専用DBヘッダー案を採用する方針を整理。
  - 楽天用DB・楽天用入力処理・楽天用出力処理・楽天用ロールバック処理を、野村とは別処理として段階移行する方針を記載。
  - 平均取得単価・簿価・保有数量・損益などの計算コアは共通化する方針。
- PR #35「Store Rakuten records with Rakuten DB headers」は develop にマージ済み。
  - `rakuten_*` DBでは `RAKUTEN_DB_HEADERS` で `取引DB` を作成・保存・読込する。
  - `nomura_*` DBは従来どおり `DB_HEADERS` / `BASE_HEADERS` を維持。
  - 楽天DB保存時は共通レコードから楽天DBレコードへ変換し、読込時は共通計算用レコードへ戻す。
  - 既存楽天DBに旧 `DB_HEADERS` 形式のデータがある場合、通常処理ではヘッダー上書きせず、リセットして再取込を促す明示エラーにする。
  - 楽天DBリセット処理だけは、旧ヘッダー + 既存データがあってもリセット可能。
  - 楽天DBのリセット/ロールバック専用テストを追加。
  - Apps Script 上での `runSmokeTests` / `runAllTests` と主要手動確認は完了扱い。
- PR #36「Minimize Rakuten DB tests」は develop にマージ済み。
  - 楽天DB追加テストを6本から3本へ削減。
  - 旧ヘッダー拒否テストに、旧ヘッダー楽天DBでもリセット可能でリセット後は `RAKUTEN_DB_HEADERS` になる確認を統合。
  - Apps Script 上での `runSmokeTests` / `runAllTests` は完了扱い。
- PR #37「Add Rakuten dividend manual columns」は develop にマージ済み。
  - 楽天配当金CSVに手動追加する `レート` / `現地源泉税［円］` / `国内源泉税［円］` を必須ヘッダーとして扱う。
  - 外貨配当で `レート` が未入力の場合はエラー。
  - 楽天DBでは `manualRate` / `manualForeignWithholdingTaxJpy` / `manualDomesticWithholdingTaxJpy` に保存する。
  - 野村CSVおよび楽天配当金以外の楽天CSVには、この3列を要求しない。
  - Apps Script 上での `runSmokeTests` / `runAllTests` と実CSV取込確認は完了扱い。
- PR #38「Warn for blank Rakuten dividend taxes」は develop にマージ済み。
  - 楽天配当金CSVの `現地源泉税［円］` / `国内源泉税［円］` が未入力の場合、取り込みは止めずに警告表示する。
  - 税2列の `0` は有効な入力値として扱い、未入力警告を出さない。
  - 入力警告をWeb UIの完了メッセージと取込履歴の `alertCount` に反映。
  - `spreadsheetId` 未設定DBは、見つけた/作成したSpreadsheet IDを Script Properties の `DB_SPREADSHEET_ID_<DB_KEY>` に保存して再利用する。
  - リセット後の同名楽天DB取り違えによるヘッダー不一致エラーは修正済み。
  - Apps Script 上での `runSmokeTests` / `runAllTests` と実CSV取込確認は完了扱い。
- PR #39「Add Rakuten output entry point」は develop にマージ済み。
  - DB読込後の出力生成入口を `buildOutputSheetsFromDb_()` に集約。
  - `rakuten_*` DBは `buildRakutenOutputSheetsFromDbRecords_()` へ分岐する入口を追加。
  - 現時点では楽天DBも既存の共通計算コアと6シート出力を使い、出力内容は変更しない。
  - 後続PRで楽天専用出力処理へ差し替えるための分岐点を作成。
  - Apps Script 上での `runSmokeTests` / `runAllTests` と楽天/野村の出力確認は完了扱い。
- PR #40「Move Rakuten output conversion into output entry」は develop にマージ済み。
  - DB生レコード読込を `readDbRecordObjects_()` に分離。
  - `readDbRecords_()` は既存互換として、従来どおり共通計算用レコードを返す。
  - 楽天DBレコードから共通計算用レコードへの変換責務を、楽天出力入口 `buildRakutenOutputSheetsFromDbRecords_()` 側へ移動。
  - 野村DBレコード変換を `nomuraDbRecordToBaseRecord_()` に分離。
  - Apps Script 上での `runSmokeTests` / `runAllTests` と楽天/野村の出力確認は完了扱い。
- PR #42「Add GAS PR test workflow」は develop にマージ済み。
  - GitHub Actions でPR向けのGASテストワークフローを追加。
  - `clasp push` 後にテスト用Apps Scriptプロジェクトへ反映し、GAS上でテストを実行する。
  - 必須チェック名は `Push test GAS project and run tests`。
- PR #45「Run GAS CI as final pre-merge check」は develop にマージ済み。
  - 重いGAS CIはPR作成時やpushごとには実行せず、`run-gas-tests` ラベル付与時だけ実行する方針へ変更。
  - `pull_request_target` は使わず、forkや外部PRにはGoogle Secretsを渡さない。
  - docs-only / Markdown-only / GASに影響しない変更では、required checkを成功させつつ重いGAS実行をスキップする。
  - マージ前の最終確認では、最新headに対して `run-gas-tests` ラベルを付け直して `Push test GAS project and run tests` の成功を確認する。
- PR #46「Run GAS tests from final-check label」は develop にマージ済み。
  - `runAllTests()` が `CORE_TESTS_` を含むため、CIでは `runAllTests` の1回実行に整理。
  - 最新コミットがdocs/Markdownだけで、直前headのrequired checkが成功済みなら、重いGAS実行をスキップする。
  - `GAS_TEST_DEPLOYMENT_ID` が未設定の場合、CIで新しいversioned deploymentを作成しない。
  - テスト専用Apps Scriptプロジェクト側でAPI executable accessを有効にし、`clasp run` できる状態を前提にする。
- PR #41「Add Rakuten output body」は develop にマージ済み。
  - 楽天専用出力処理本体の最初の入口として `buildRakutenOutputSheetsFromBaseRecords_()` を追加。
  - 楽天専用分類入口として `groupRakutenOutputRecords_()` を追加。
  - 現時点では出力内容・計算結果を変えず、計算コア `buildTradeRows_()` / `buildCashRows_()` は共通利用。
  - 6シート分類と書き込みを `groupOutputRecords_()` / `writeOutputSheetsFromGroups_()` に分離。
  - CIでは同一GASテストプロジェクトでの二重実行を避けるため、`runAllTests` の1回実行に整理。
  - GitHub Actions の `Push test GAS project and run tests` は成功済み。
- PR #52「Add Rakuten Japan stock output sheet」は develop にマージ済み。
  - 楽天出力時は共通 `日本株` ではなく `楽天日本株` シートを作成。
  - Drive最終見た目に近い楽天日本株ヘッダー、代表値、計算列、非表示列の回帰テストを追加。
  - 米国株、投信、配当金、金銭残高は後続PRに分ける。
- 楽天米国株の専用出力初期対応を追加。
  - 楽天出力時は共通 `米国株` ではなく `楽天米国株` シートを作成。
  - 共通計算モデルから取得できるティッカー、口座、決済通貨、数量、単価、為替レート、受渡金額、保有数、損益系計算列を楽天米国株ヘッダーへマップ。
  - 現状の共通モデルで保持していない `税金［USドル］` は空欄のままとし、税額換算の本対応は後続PRに分ける。
- 楽天投資信託の専用出力初期対応を追加。
  - 楽天出力時は共通 `投信` ではなく `楽天投資信託` シートを作成。
  - 共通計算モデルから取得できるファンド名、口座、取引、買付方法、数量、単価、経費、為替レート、受渡金額、決済通貨、追加列、損益系計算列を楽天投資信託ヘッダーへマップ。
  - 現状の共通モデルで保持していない `分配金` / `受付金額` は空欄のままとし、元CSV列保持の本対応は後続PRに分ける。

## 進行中 / 未マージ

- なし

## 未完了 / 確認待ち

- 別ユーザーでのDrive OAuth承認とWebアプリ実行確認。
- 楽天米国株・楽天投資信託の実取込結果の最終確認。
- 楽天専用の出力処理本体は `楽天日本株` / `楽天米国株` / `楽天投資信託` の初期専用シート対応まで完了。配当金、金銭残高のDrive最終見た目対応は未実装。
- 楽天専用ロールバックUI分離は未実装。

## 直近の優先順位

1. 配当金、金銭残高の専用出力を、`groupRakutenOutputRecords_()` / `buildRakutenOutputSheetsFromBaseRecords_()` 配下で段階的に実装する。
2. 楽天専用ロールバック処理/UI分離を進める。
3. 別ユーザーのDrive権限問題の結果を確認する。
4. 楽天米国株・楽天投資信託の出力確認を完了する。

## Codexへの伝え方

手動マージや手動確認をした後は、このファイルを更新してからCodexに以下のように伝える。

```text
最新の docs/current-status.md を読んで、develop 最新を前提に作業してください。
まだコード変更はしないでください。
```

Codexへの依頼テンプレートは `docs/codex-prompts.md` を使う。
AutoHotkeyショートカットの説明は `docs/codex-shortcuts.md` を参照する。

## 注意点

- 実際のフォルダID・スプレッドシートID・WebアプリURLはコミットしない。
- `appsscript.json` のOAuth scope変更後は、Webアプリの新バージョン再デプロイが必要。
- Webアプリを「アクセスしているユーザー」として実行する場合、利用者ごとにDrive権限承認とDBフォルダ編集権限が必要。
- `spreadsheetId` 未設定DBは Script Properties の `DB_SPREADSHEET_ID_<DB_KEY>` に実ファイルIDを保存して再利用する。
- CIのPR必須チェック `Push test GAS project and run tests` は、`run-gas-tests` ラベル付与時だけ作成される。GAS影響ファイルがある場合は `runAllTests` の存在確認、`.gs` 構文チェック、`clasp push --force` を必須確認とし、`clasp run` が権限上使えない場合は Step Summary に `clasp run unavailable` と記録して、Apps Script エディタからの手動 `runAllTests` 実行結果をPR本文へ残す。
- PR #31 / PR #32 / PR #33 / PR #34 / PR #35 / PR #36 / PR #37 / PR #38 / PR #39 / PR #40 / PR #41 / PR #42 / PR #45 / PR #46 は develop にマージ済み。
