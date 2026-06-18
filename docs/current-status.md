# Current Status

最終更新: 2026-06-18

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

## 進行中 / 未マージ

- なし

## 未完了 / 確認待ち

- 別ユーザーでのDrive OAuth承認とWebアプリ実行確認。
- 楽天米国株の実取込結果の最終確認。
- 楽天専用の出力処理・ロールバックUI分離は未実装。

## 直近の優先順位

1. 楽天専用DBからの出力処理を、野村形式前提から段階的に分離する。
2. 楽天専用ロールバック処理/UI分離を進める。
3. 別ユーザーのDrive権限問題の結果を確認する。
4. 楽天米国株の出力確認を完了する。

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
- PR #31 / PR #32 / PR #33 / PR #34 / PR #35 / PR #36 / PR #37 / PR #38 は develop にマージ済み。
