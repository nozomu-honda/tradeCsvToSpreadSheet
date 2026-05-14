# src/test README

## 目的

`src/test` は、この株管理ツールの **Apps Script テストコード** を置くディレクトリです。  
本番コードは `src/app` に置き、テストコードは `src/test` に分離します。

この分離の目的は次のとおりです。

- 本番コードとテストコードの責務を分ける
- `test.gs` の肥大化を防ぐ
- テストの種類ごとに見通しをよくする
- 将来の仕様変更時に、影響箇所を追いやすくする

---

## 基本方針

### 1. テストコードは本番コードを汚さない
- テスト専用の補助関数
- 一時スプレッドシート生成
- assertion
- テストデータ生成

などは、原則として `src/test` 側に置きます。

### 2. テストは役割ごとに分ける
1ファイルに全部入れず、対象機能ごとに分割します。

### 3. GASクォータを意識する
Apps Script では `SpreadsheetApp.create()` の日次制限に引っかかりやすいため、  
一時スプレッドシートは **可能な限り使い回す** 方針にします。

---

## 想定ディレクトリ構成

```text
src/
  app/
    web.gs
    import.gs
    db.gs
    builder.gs
    writer.gs
    parser.gs
    config.gs
    db_config.gs
    utils.gs

  test/
    test_runner.gs
    test_temp_spreadsheet_helpers.gs
    test_temp_db_helpers.gs
    test_support_helpers.gs
    test_trade_rows.gs
    test_input_reader.gs
    test_writer.gs
    test_db.gs
    test_staging_sheet.gs
    test_output_split.gs
    test_test_db_validation_bypass.gs
    README.md
```

---

## 各ファイルの役割

### `test_runner.gs`
テスト実行の入口です。

主な責務:
- `runSmokeTests()`
- `runAllTests()`
- `runSelectedTests_()`

### `test_temp_spreadsheet_helpers.gs`
通常テスト用の一時スプレッドシート管理です。

主な責務:
- 一時Spreadsheetの作成 / 使い回し
- テスト前の初期化
- テスト後の cleanup

### `test_temp_db_helpers.gs`
DB系テスト用の一時Spreadsheet管理です。

主な責務:
- 一時DB Spreadsheetの作成 / 使い回し
- DBターゲット切替
- cleanup

### `test_support_helpers.gs`
共通補助です。

主な責務:
- `assertEquals_`
- `assertTrue_`
- `assertFalse_`
- `assertApproxEquals_`
- `assertThrowsContains_`
- テストデータ生成関数
- 行 / 列アクセス補助

### `test_trade_rows.gs`
取引計算ロジックのテストです。

主な責務:
- 平均取得単価
- 簿価
- 売却損益
- 保有数
- 銘柄ごとの残高
- 取引並び順

### `test_input_reader.gs`
入力読込のテストです。

主な責務:
- ヘッダー検出
- 前置き行許容
- ヘッダー不一致エラー
- 手入力列読込
- スプレッドシート入力判定

### `test_writer.gs`
出力シート書込のテストです。

主な責務:
- 列非表示
- 数値書式
- 条件付き書式
- helper列の扱い

### `test_db.gs`
DB保存 / ロールバック / リセットのテストです。

主な責務:
- DBターゲット選択
- append
- rowHash
- import log
- rollback
- reset

### `test_staging_sheet.gs`
一次受け枠のテストです。

主な責務:
- 追加7カラムの並び
- 色付け対象の前提確認
- 必須入力バリデーション
- スプレッドシートURLからの一次受け枠生成

### `test_output_split.gs`
5シート出力の振り分けテストです。

主な責務:
- 日本株 / 米国株 / 投信 / 金銭残高（円） / 金銭残高（ドル）の振り分け確認
- 外債を暫定で米国株に含める仕様確認
- 出力件数確認
- 作成シート名確認

### `test_test_db_validation_bypass.gs`
テスト用DBの特例動作テストです。

主な責務:
- `key === 'test'` のDBでは赤セル必須入力バリデーションをスキップする確認
- 通常DBではバリデーションを維持する確認
- テスト用DBで後続処理まで進める確認

---

## テスト実行方針

### `runSmokeTests()`
軽めの確認用です。  
主要ロジックの破壊がないかを素早く見る用途です。

### `runAllTests()`
フル実行用です。  
仕様変更後、まとめて確認するときに使います。

---

## クォータ対策

Apps Script では、テスト中に以下が重いです。

- `SpreadsheetApp.create()`
- `DriveApp` による大量ファイル操作

そのため、`src/test` では以下を基本ルールにします。

### ルール
- テストごとに新しいSpreadsheetを作りすぎない
- 可能な限り一時Spreadsheetを再利用する
- `runSelectedTests_()` の finally でまとめて cleanup する
- DB用も通常用も、使い回しヘルパーを通す

### 注意
その日のクォータを踏み切った後は、  
コードを直しても当日はまだ落ちることがあります。  
その場合は、反映だけして **翌日に再実行** するのが安全です。

---

## テスト用DB（test DB）

### 目的
赤いセルの必須入力バリデーションを通常運用では維持しつつ、  
**後続処理の確認だけをしたい** 場面があります。

そのため、`key === 'test'` のDBを用意し、  
このDBを選んだ場合だけ **赤セル必須入力バリデーションをスキップ** します。

### 想定挙動
- 通常DB
  - 赤セル未入力ならエラーで停止
- テスト用DB (`key === 'test'`)
  - 赤セル未入力でも後続へ進む
  - DB追加
  - 5シート生成
  - ロールバックやUI動作確認

### 主な用途
- 一次受け枠の後続確認
- 出力シート振り分け確認
- DB保存確認
- UI文言確認
- ロールバック確認

### 実装上の考え方
本番仕様は緩めず、  
**テスト用DBを選んだときだけ例外的にスキップ** する方針です。

判定関数の例:
- `shouldSkipRequiredManualValidationForTarget_('test') === true`
- `shouldSkipRequiredManualValidationForTarget_('corp_a') === false`

### 注意
- テスト用DBは **本番データの保存先に使わない**
- 仕様確認や検証専用とする
- 本番DBの挙動を緩めるための仕組みではない

---

## 命名ルール

### テスト関数
- `test_` で始める
- 何を検証しているか分かる名前にする
- 必要なら日付 suffix を付ける

例:
- `test_buildTradeRows_principalReturn_distributionDoesNotChangeBalance_20260511_`
- `test_findInputSheetByHeader_noCandidate_throws_`

### 補助関数
- 末尾 `_`
- 本番コードと区別しつつ用途が分かる名前にする

例:
- `withTempSpreadsheet_`
- `makeTradeRecord_`
- `getTradeRowValue_`

---

## 新しいテストを追加するときのルール

### 1. 置き場所を先に決める
追加するテストがどの責務に属するかでファイルを決めます。

- 入力読込 → `test_input_reader.gs`
- 取引計算 → `test_trade_rows.gs`
- DB保存 → `test_db.gs`
- 一次受け枠 → `test_staging_sheet.gs`
- 出力振り分け → `test_output_split.gs`
- test DB特例 → `test_test_db_validation_bypass.gs`

### 2. ランナーへ登録する
必要に応じて以下へ追加します。

- `runSmokeTests()`
- `runAllTests()`

### 3. テスト名は期待結果まで分かるようにする
悪い例:
- `test_trade_1_`

よい例:
- `test_buildRowHash_changesWhenManualColumnsChange_20260511_`

### 4. 1テスト1責務を意識する
1つのテストで複数の論点を混ぜすぎないようにします。

---

## 変更時チェックリスト

テストを更新する際は、少なくとも以下を確認します。

- 本番コードの変更に追随しているか
- `runSmokeTests()` に入れるべきか
- `runAllTests()` に入れるべきか
- 一時Spreadsheet作成回数が増えすぎていないか
- DB列追加時に関連テストを更新しているか
- README / docs と整合しているか
- test DB の特例が本番DBへ漏れていないか

---

## よくある注意点

### ヘッダー名は少し違ってもダメ
このプロジェクトでは、入力ヘッダー差異を黙って吸収しない方針です。  
テストでも **明示エラーになること** を確認します。

### 日付・数値・空欄は見た目で判断しない
Google Sheets / Apps Script では、セル値が
- 空文字
- 数値
- Date
- boolean

のどれで来るかに注意が必要です。

### 手入力列は rowHash に影響する
追加手入力列を変えたら rowHash も変わるべきです。  
この観点のテストは重要です。

### DBスキーマ変更は影響が広い
列追加・列順変更時は、少なくとも次を確認します。

- `DB_HEADERS`
- DB読込
- DB書込
- rollback
- reset
- rowHash
- テスト
- 仕様書

### test DB は例外であって通常ルートではない
test DB は、あくまで**検証を進めるための安全弁**です。  
通常仕様のバリデーションを置き換えるものではありません。

---

## 補足

このディレクトリの目的は、  
**「壊れたことを早く見つける」こと** と  
**「仕様変更の影響範囲を明確にする」こと** です。

迷ったら次の基準で考えます。

- どの本番ファイルの責務を検証しているか
- 既存テストのどこに一番近いか
- そのテストは他の人が見てすぐ意味が分かるか
