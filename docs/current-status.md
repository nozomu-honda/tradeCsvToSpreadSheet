# Current Status

最終更新: 2026-06-17

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

## 進行中 / 未マージ

- PR #31「楽天の追加CSVフォーマットを取り込めるようにする」は open / draft のまま。
  - 対象: 楽天投資信託、楽天配当金・分配金、楽天入出金履歴。
  - `rakuten_fund` / `rakuten_dividend` / `rakuten_cash` の検出・正規化を追加する内容。
  - Apps Script 上での `runSmokeTests` / `runAllTests` は未確認。
  - 実CSVでの投信・配当金/分配金・入出金履歴の取込確認は未完了。
  - PR #33 マージ後の develop 最新へ追従してから再確認する。

## 未完了 / 確認待ち

- 別ユーザーでのDrive OAuth承認とWebアプリ実行確認。
- 楽天米国株の実取込結果の最終確認。
- PR #33 マージ後の develop をGASへ反映するか、反映前チェックを行う。
- PR #31 の差分レビュー、develop追従、GAS上テスト、実CSV確認。
- 楽天投資信託の実取込結果の確認。
- 楽天配当金・分配金の実取込結果の確認。
- 楽天入出金履歴の実取込結果の確認。
- 楽天Phase 2の税額・為替レート詳細の追加設計。

## 直近の優先順位

1. PR #33 マージ後の develop 最新を前提に、GAS反映前チェックを行う。
2. 別ユーザーのDrive権限問題の結果を確認する。
3. 楽天米国株の出力確認を完了する。
4. PR #31 を PR #33 マージ後の develop 最新へ追従させ、差分レビューと Apps Script 上の `runSmokeTests` / `runAllTests` を行う。
5. 楽天投信 / 配当金・分配金 / 入出金履歴の実データ確認を行う。
6. 楽天Phase 2の税額・為替レート詳細へ進む。

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
- PR #31 と PR #32 / PR #33 は楽天/DB/テスト周辺に触るため、PR #31 はPR #33マージ後の develop へ追従してから確認する。
