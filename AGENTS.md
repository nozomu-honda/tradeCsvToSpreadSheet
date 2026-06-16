# AGENTS.md

## プロジェクト概要

このリポジトリは、証券会社CSV/スプレッドシートを Google Apps Script で読み込み、取引DBへ保存し、法人投資管理用の出力シートを生成する株管理ツールです。

主な対象証券会社:

- 野村證券
- 楽天証券 Phase 1: 日本株・米国株
- 楽天証券 Phase 2: 投信、配当金・分配金、入出金履歴

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
- UIには楽天専用DBを直接表示しない。UIで選択した `corp_a` / `corp_b` / `test` を、楽天入力時だけ `rakuten_*` に内部変換する。
- 秘密情報、スプレッドシートID、フォルダID、WebアプリURLは不用意にコミットしない。必要ならサンプル値や環境設定の説明に留める。

## DBルーティング方針

UI選択と実際の追加先DBの関係:

- 野村入力 + `corp_a` → `corp_a`
- 野村入力 + `corp_b` → `corp_b`
- 野村入力 + `test` → `test`
- 楽天入力 + `corp_a` → `rakuten_corp_a`
- 楽天入力 + `corp_b` → `rakuten_corp_b`
- 楽天入力 + `test` → `rakuten_test`

楽天DBは `uiVisible: false` とし、UIの直接選択肢には出さない。

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

## テスト方針

- 既存テストを壊さない。
- 新しい取引区分・証券会社フォーマットを追加したら、検出・正規化・DBルーティングのテストを追加する。
- GAS上で実行できるテスト関数名を明記する。
- テスト用DBでは赤セルバリデーションを無視する設計を維持する。
- DB作成・Drive操作を含むテストは、実行ユーザーとDrive共有権限に注意する。

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
