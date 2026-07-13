# Current Status

最終更新: 2026-07-13

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
- PR #53「Handle unavailable clasp run in GAS CI」は develop にマージ済み。
  - `clasp push --force` とソース検証は必須のまま維持。
  - `clasp run runAllTests` が実行権限系エラーで使えない環境では、CI全体を失敗させず `clasp run unavailable` として扱うfallbackを追加。
  - `clasp push` 失敗、Secret不足、`runAllTests` 未定義、ソース構文破壊は従来どおり失敗扱い。
  - コード変更PRでは、必要に応じてApps Scriptエディタから手動 `runAllTests` を実行し、PR本文に結果を残す運用。
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
- PR #54「楽天米国株シート対応」は develop にマージ済み。
  - 楽天出力時は共通 `米国株` ではなく `楽天米国株` シートを作成。
  - 共通計算モデルから取得できるティッカー、口座、決済通貨、数量、単価、為替レート、受渡金額、保有数、損益系計算列を楽天米国株ヘッダーへマップ。
  - 現状の共通モデルで保持していない `税金［USドル］` は空欄のままとし、税額換算の本対応は後続PRに分ける。
- PR #55「楽天投資信託シート対応」は develop にマージ済み。
  - 楽天出力時は共通 `投信` ではなく `楽天投資信託` シートを作成。
  - 共通計算モデルから取得できるファンド名、口座、取引、買付方法、数量、単価、経費、為替レート、受渡金額、決済通貨、追加列、損益系計算列を楽天投資信託ヘッダーへマップ。
  - 現状の共通モデルで保持していない `分配金` / `受付金額` は空欄のままとし、元CSV列保持の本対応は後続PRに分ける。
- PR #56「楽天金銭残高（円）/（ドル）対応」は develop にマージ済み。
  - 楽天出力時の `金銭残高（円）` / `金銭残高（ドル）` は、共通 `CASH_HEADERS` ではなく楽天cash専用ヘッダーで作成。
  - 残高 / 月次残高は既存の `buildCashRows_()` の増減ルールを維持し、日本株・米国株・投信・入出金・配当金/分配金由来の代表列へマップ。
  - 現状の共通モデルで個別保持していない `出金先` などは空欄のままとし、元CSV列保持の本対応は後続PRに分ける。
- PR #57「楽天配当金・分配金CSV由来の元列保持」は develop にマージ済み。
  - 配当金・分配金CSVの税引前合計、税額合計、受取金額、為替レート、円換算の現地/国内源泉税、備考を、既存の楽天DB列と出力用metadataで保持する。
  - 楽天米国株、楽天投資信託、金銭残高（ドル）の一部空欄列へ、楽天DBから取得できる元CSV値を反映する。
  - USD税額は共通計算用の `国内消費税等（円）` へ戻さず、平均取得単価・簿価・売却損益の共通計算コアには混ぜない。
- PR #58「楽天ロールバックUI分離」は develop にマージ済み。
  - リセット/ロールバック用DB選択肢に、野村DB / 楽天DB の種別とDBキーを表示する。
  - 楽天CSV取込後は、ロールバック対象DBを実際の追加先 `rakuten_*` に自動で合わせる。
  - ロールバック確認と結果表示に対象DB種別、DBキー、DBラベル、取込ID、無効化件数、ロールバック日時を表示する。
  - ロールバック処理自体は従来どおり選択DB内の `importId` 単位の論理削除で、物理削除はしない。
- PR #59「Add Rakuten output cell comparison tests」は develop にマージ済み。
  - 楽天日本株 / 楽天米国株 / 楽天投資信託 / 金銭残高（円）/ 金銭残高（ドル）の実データ相当fixtureから、主要セル値を比較する回帰テストを追加。
  - 楽天DBへルーティングされること、楽天専用出力入口を通ること、共通 `日本株` / `米国株` / `投信` シートが楽天出力時に残らないことを確認。
  - 配当金・分配金CSV由来のUSD受取、税額、為替レート、源泉税、金銭残高反映もユニット/結合テストで確認。
- PR #60「Add minimal GAS web app E2E」は develop にマージ済み。
  - PR #43の古い大きなE2Eは使わず、楽天日本株CSVアップロード1ケースの最小Web App E2Eを追加。
  - `CI_E2E_TOKEN` で保護した `prepareE2EWebAppRun` / `cleanupE2EImportFromWebApp` を追加し、`rakuten_test` への内部ルーティング、出力リンク、論理rollbackを確認する基盤を作成。
  - workflowは `workflow_dispatch` と `gas-web-e2e` ラベル起動に限定し、`pull_request_target` は使わない。
- PR #61「Run GAS web E2E with dynamic deployment」は develop にマージ済み。
  - GitHub Actions上で一時的なdynamic public Web app deploymentを作成し、Playwright本体がGAS Webアプリを開けるようにした。
  - テスト用Apps Script projectのpush直前sourceだけにWeb app公開設定とE2E root storage設定を注入し、実URLやIDはログ/コードへ残さない。
  - E2E後は一時deploymentを削除し、削除失敗はworkflow失敗扱い。
- PR #62「Extend Rakuten GAS web E2E coverage」は develop にマージ済み。
  - Web App E2Eを楽天日本株1ケースから、楽天米国株、楽天投資信託、楽天入出金履歴まで拡張。
  - 各ケースでCSV upload、`nomura_test` 選択から `rakuten_test` への内部ルーティング、出力リンク、cleanup/rollbackを確認。
  - E2E fixtureの銘柄名・ファンド名・摘要をrunごとに一意化し、重複skipを避ける構成にした。
- PR #63「Verify Rakuten output spreadsheets in GAS web E2E」は develop にマージ済み。
  - Web App E2Eで作成された出力Spreadsheetを、E2E helper経由で検査するようにした。
  - 楽天日本株 / 楽天米国株 / 楽天投資信託 / 金銭残高（円）/ 金銭残高（ドル）の主要シート名と主要セル値を確認。
  - 実Spreadsheet IDや実URLは使わず、出力リンクから取得したテスト出力Spreadsheetだけを対象にする。
- PR #64「Harden GAS web E2E output inspection」は develop にマージ済み。
  - 出力Spreadsheet検査helperを、25行/40列などのrawセル配列返却方式から条件検索方式へ変更。
  - `requiredSheets` / `absentSheets` / `checks` payloadを受け、GAS側で許可済みシート・ヘッダー・期待値だけを検索して最小結果を返す。
  - test DB限定、Spreadsheet名限定、シートallowlist、payload件数/文字数制限を追加し、任意A1範囲や全セル内容は返さない。
  - 30行目以降の値検索、raw `sheets` 配列を返さないこと、allowlist外拒否などのテストを追加。
- PR #65「Add Rakuten dividend distribution E2E coverage」は develop にマージ済み。
  - 楽天米国株配当、楽天投信分配金、楽天投信元本払戻金のWeb App E2EとCSV fixtureを追加。
  - 元本払戻金は楽天DBヘッダーを増やさず、既存 `description` マーカーからDB読込後に復元する初期対応。
  - `rakuten_dividend` かつ `入金（分配金）` の場合に、楽天投資信託出力へ `分配金` / `受付金額` を反映する初期対応。
  - cleanupは複数importIdを保持し、元本払戻金ケースでは買付importと払戻importの両方を論理rollbackする。
  - GitHub Actionsで `Push test GAS project and run tests` と `Deploy test Web app and run Rakuten Playwright E2E` の成功を確認済み。

## 進行中 / 未マージ

- Issue #69対応: GAS CIの `runAllTests()` 1回実行がApps Scriptの実行時間上限を超えるため、CI用バッチ関数に分割するDraft PRを準備中。`clasp push --force` とAPI executable deployment更新は1回だけ行い、全バッチの欠落・重複を検証してから逐次実行する方針。

## 未完了 / 確認待ち

- 別ユーザーでのDrive OAuth承認とWebアプリ実行確認。
- 楽天米国株・楽天投資信託・楽天金銭残高・配当金/分配金/元本払戻金は代表fixtureの自動テストが進んだが、実運用データでの最終確認は未完了。
- 楽天専用の出力処理本体は `楽天日本株` / `楽天米国株` / `楽天投資信託` / `金銭残高（円）` / `金銭残高（ドル）` の初期専用シート対応まで完了。配当金・分配金・元本払戻金は既存楽天タブと金銭残高への代表値反映を進めているが、完全な専用シート/全列再現は未実装。
- 楽天専用ロールバックUI分離は初期対応済み。実運用でのWeb UI表示確認は未完了。
- Web App E2Eはdynamic public deploymentで動くが、対象はテスト専用Apps Script projectとtest DBに限定する運用を継続する。

## 直近の優先順位

1. 配当金・分配金・元本払戻金の残りの専用出力を、`groupRakutenOutputRecords_()` / `buildRakutenOutputSheetsFromBaseRecords_()` 配下で段階的に実装する。
2. 楽天専用ロールバックUIの実運用表示確認を行う。
3. 別ユーザーのDrive権限問題の結果を確認する。
4. 楽天米国株・楽天投資信託・楽天金銭残高・配当金/分配金/元本払戻金の実運用データ確認を完了する。

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
- CIのPR必須チェック `Push test GAS project and run tests` は、`run-gas-tests` ラベル付与時だけ作成される。GAS影響ファイルがある場合はCI用GASテストバッチ関数の存在確認、`.gs` 構文チェック、`clasp push --force`、可能な場合は全バッチの `clasp run` を必須確認とする。`clasp run` が権限上使えない場合は Step Summary に `clasp run unavailable` と記録し、Apps Script エディタからの手動バッチ実行結果をPR本文へ残す。
- PR #31 / PR #32 / PR #33 / PR #34 / PR #35 / PR #36 / PR #37 / PR #38 / PR #39 / PR #40 / PR #41 / PR #42 / PR #45 / PR #46 / PR #52 / PR #53 / PR #54 / PR #55 / PR #56 / PR #57 / PR #58 / PR #59 / PR #60 / PR #61 / PR #62 / PR #63 / PR #64 / PR #65 は develop にマージ済み。
