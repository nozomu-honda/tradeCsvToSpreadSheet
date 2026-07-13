# AGENTS.md

## プロジェクト概要

このリポジトリは、証券会社CSV/スプレッドシートを Google Apps Script で読み込み、取引DBへ保存し、法人投資管理用の出力シートを生成する株管理ツールです。

主な対象証券会社:

- 野村證券
- 楽天証券 Phase 1: 日本株・米国株
- 楽天証券 Phase 2: 投信、配当金・分配金、入出金履歴

## 作業前に読むドキュメント

作業開始時は、まず以下を確認する。

- `docs/current-status.md`
- `docs/TODO.md`
- 必要に応じて `docs/spec.md` / `docs/trade-rules.md`
- Codexへの依頼テンプレートは `docs/codex-prompts.md`
- AutoHotkeyショートカットの説明は `docs/codex-shortcuts.md`

## Branch / Commit Rules

- 実装タスクでは、`develop` に直接コミットしない。
- 新しい実装・修正タスクでは、作業開始前に最新の `develop` から作業ブランチを作る。
- ブランチ名は `feature/<task-name>` を基本にする。
- ユーザーが作業ブランチ名を指定している場合は、そのブランチ上で作業する。
- 変更は作業ブランチにだけコミットする。
- PR作成前に、まだ追加のコード変更をせず、未コミット差分レビューを行う。
- 実装後は、以下を要約する。
  - 変更ファイル
  - 差分概要
  - 実行したテスト
  - 未確認事項
- `develop` への直接コミットは、ユーザーが明示した小さなドキュメント/ステータス更新などに限定する。

## GitHub上の文章ルール

GitHub上で人間が読む文章は、原則として日本語で記述する。

対象:

- Issueのタイトル・本文・コメント
- PRのタイトル・本文・コメント
- レビューコメント
- 修正依頼
- GitHub Actionsの手動実行時に記載する説明
- Codexが作成する作業報告

例外:

- コード、識別子、コマンド、ログ、エラーメッセージ
- GitHub Actionsのcheck名など、既存仕様との互換性が必要な名称
- 一般的な技術用語で、英語表記のほうが明確なもの

## 技術前提

- Google Apps Script / V8 を前提とする。
- GAS上で動くコードを優先し、Node.js専用APIやブラウザ専用APIは使わない。
- clasp管理の場合でも、GAS側のファイル名・関数名との整合性を崩さない。
- 既存関数名の互換性を優先する。
- ヘッダー名は既存仕様と厳密一致を基本とする。
- DBスキーマは `BASE_HEADERS` / `TRADE_HEADERS` / `CASH_HEADERS` を基準にする。

## 重要な設計方針

- 証券会社別CSVは、直接DBへ入れず、内部共通レコードへ正規化してから既存処理に流す。
- 野村フォーマットは既存の共通入力形式として扱う。
- 楽天フォーマットは `normalizeRowsForImport_()` で内部共通レコードに変換する。
- DB書き込み前に、入力元フォーマットに応じてDBキーをルーティングする。
- 取込用UIには楽天専用DBを直接表示しない。
- 取込用UIで選択する通常DBキーは `nomura_corp_a` / `nomura_corp_b` / `nomura_test` を基本とする。
- 楽天入力時だけ、選択された `nomura_*` を対応する `rakuten_*` に内部変換する。
- DBリセット/ロールバック用UIでは、設定済みDBターゲット一覧を正とし、hidden な楽天DBも選択肢に含める。
- 秘密情報、スプレッドシートID、フォルダID、WebアプリURLは不用意にコミットしない。必要ならサンプル値や環境設定の説明に留める。

## DBルーティング方針

現在のUI選択と実際の追加先DBの関係:

- 野村入力 + `nomura_corp_a` → `nomura_corp_a`
- 野村入力 + `nomura_corp_b` → `nomura_corp_b`
- 野村入力 + `nomura_test` → `nomura_test`
- 楽天入力 + `nomura_corp_a` → `rakuten_corp_a`
- 楽天入力 + `nomura_corp_b` → `rakuten_corp_b`
- 楽天入力 + `nomura_test` → `rakuten_test`

楽天DBは `uiVisible: false` とし、取込用UIの直接選択肢には出さない。
ただし、DBリセット/ロールバック用UIでは楽天DBも選択できる。

過去のドキュメントや会話に `corp_a` / `corp_b` / `test` が出る場合があるが、現在の通常DBキーは `nomura_*` を基本とする。

## 楽天証券対応の現状

Phase 1 実装対象:

- 楽天日本株
- 楽天米国株

Phase 2 実装対象:

- 楽天投資信託
- 楽天配当金・分配金
- 楽天入出金履歴

主な追加/変更関数:

- `isRakutenSourceType_(sourceType)`
- `routeTargetDbKeyBySource_(selectedTargetDbKey, sourceType)`
- `normalizeRowsForImport_(rows)`
- `findSupportedImportSheet_(ss)`
- `detectInputSourceTypeFromRows_(rows)`
- `normalizeRakutenJapanStockRowsToRecords_(rows, headerRowIndex)`
- `normalizeRakutenUsStockRowsToRecords_(rows, headerRowIndex)`
- `normalizeRakutenFundRowsToRecords_(rows, headerRowIndex)`
- `normalizeRakutenDividendRowsToRecords_(rows, headerRowIndex)`
- `normalizeRakutenCashRowsToRecords_(rows, headerRowIndex)`

楽天の追加フォーマット対応は段階的に進める。
投信、配当金・分配金、入出金履歴を扱う場合は、`docs/current-status.md` と対象PRの状態を確認してから作業する。

## テスト方針

- 既存テストを壊さない。
- 新しい取引区分・証券会社フォーマットを追加したら、検出・正規化・DBルーティングのテストを追加する。
- GAS上で実行できるテスト関数名を明記する。
- テスト用DBでは赤セルバリデーションを無視する設計を維持する。
- DB作成・Drive操作を含むテストは、実行ユーザーとDrive共有権限に注意する。
- GAS反映前は、必要に応じて `runSmokeTests` / `runAllTests` を確認する。

## Webアプリ / OAuth / Drive権限

`DriveApp.getFolderById()` や `moveTo(folder)` を使う処理では、Webアプリの実行ユーザーとDrive共有権限に注意する。

Webアプリを「アクセスしているユーザー」として実行する場合:

- 利用者本人にDBフォルダの編集権限が必要。
- 利用者本人がDrive OAuth権限を承認する必要がある。
- `appsscript.json` の `oauthScopes` に `https://www.googleapis.com/auth/drive` と `https://www.googleapis.com/auth/spreadsheets` が必要。
- manifestを変更した後は、Webアプリを新しいバージョンで再デプロイする。

Webアプリを「自分」として実行する場合:

- DBフォルダ操作はオーナー権限で実行される。
- 入力元スプレッドシートURLを他ユーザーが指定する場合、そのシートをオーナーが閲覧できる必要がある。

現在のユーザー方針は「アクセスしているユーザー」として実行する運用。

## コーディング注意点

- GASで未対応の構文や外部依存を安易に追加しない。
- 既存の `text_()` / `toNumber_()` / `parseDate_()` / `normalizeCurrency_()` などのユーティリティを優先して使う。
- ヘッダー正規化は、空白、全角/半角カッコ、全角スラッシュなどを吸収するが、DB出力ヘッダー自体は既存仕様を維持する。
- 金額の丸めや簿価計算は既存仕様を壊さない。
- `-0` 表示や1円ズレ対策など、過去に修正した数値正規化方針を後退させない。

## PR/変更の出し方

- 大きな変更は小さなPRに分ける。
- 仕様変更、DBスキーマ変更、出力列変更は必ずドキュメントを更新する。
- 楽天対応の追加は、フォーマットごとに段階的に進める。
- 変更後に実行したテスト名と結果をPR本文へ書く。
- PR本文には、確認済み項目と未確認項目を分けて書く。
- マージ後に状態が変わった場合は `docs/current-status.md` を更新する。
