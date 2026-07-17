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
    script_properties.gs
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
- `runGasTestBatch01()` 〜 `runGasTestBatch09()`
- `runGasTestSuite...()`（PR差分に応じたCI選択実行）
- `runGasTestSuiteByName()`（許可済みスイート名だけを受け付ける入口）
- `runSelectedTests_()`

### `test_temp_spreadsheet_helpers.gs`
通常テスト用の一時スプレッドシート管理です。

主な責務:
- 通常テスト用固定Spreadsheetの再利用
- Script Properties / フォルダ / 自動生成の解決
- テスト前の初期化
- テスト後の cleanup

### `test_temp_db_helpers.gs`
DB系テスト用の一時Spreadsheet管理です。

主な責務:
- key ごとの固定DBテストSpreadsheet再利用
- Script Properties / フォルダ / 自動生成の解決
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

### `runGasTestBatch01()` 〜 `runGasTestBatch09()`
GitHub Actions の GAS CI 用です。
`runAllTests()` 相当のテスト一覧を最大13件ずつに分け、Apps Script の実行時間上限を避けながら全件を順番に確認します。

### 目安
- `runSmokeTests()` は **ロジック破壊を早く検知する** ためのもの
- `runAllTests()` は **Spreadsheet 実体込みの確認** まで含めるもの
- GitHub Actions では **CI用バッチ関数を全件実行する** もの

---

## クォータ対策

Apps Script では、テスト中に以下が重いです。

- `SpreadsheetApp.create()`
- `DriveApp` による大量ファイル操作

そのため、`src/test` では以下を基本ルールにします。

### ルール
- テストごとに新しいSpreadsheetを作りすぎない
- 可能な限り固定Spreadsheetを再利用する
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

## test DB の固定出力Spreadsheet

### 目的
`test DB` で後続処理を確認したいときに、  
毎回 `SpreadsheetApp.create()` を使うとクォータを消耗します。

そのため、`test DB` では新規の出力Spreadsheetを毎回作らず、  
**固定の確認用Spreadsheetへ上書き出力** する運用にします。

### 想定挙動
- 通常DB
  - 出力Spreadsheetを都度新規作成
- test DB (`key === 'test'`)
  - 固定の確認用Spreadsheetを再利用
  - 日本株 / 米国株 / 投信 / 金銭残高（円） / 金銭残高（ドル）を毎回上書き更新

### 推奨設定
`src/app/db_config.gs` の `DB_CONFIG` に以下を持たせます。

- `TARGET_DBS` の `key: 'test'`
- `TEST_OUTPUT_SPREADSHEET`

運用上は、事前に次の2つを手動で作成して `spreadsheetId` を入れておくのがベストです。

- test DB 本体
- test DB 確認用出力Spreadsheet

### メリット
- test DB でも実際の出力シートを確認できる
- 出力Spreadsheetの実物を見ながら検証できる
- create クォータを節約できる

### 注意
- 固定出力Spreadsheetは **test 専用**
- 本番確認用と混ぜない
- 毎回上書きされる前提で使う

---

## 固定Spreadsheet再利用テスト運用

### 目的
`runSmokeTests()` と `runAllTests()` のたびに `SpreadsheetApp.create()` を多用すると、  
Apps Script の日次クォータに当たりやすくなります。

そのため、テスト専用の固定Spreadsheetをあらかじめ用意し、  
毎回それを初期化して使い回す方式にします。

### 対象
- 通常テスト用 1冊
- DBテスト用 key ごとに 1冊
  - `corp_a`
  - `corp_b`
  - 必要なら `corp_c`
  - `test`

### 反映するファイル
- `src/test/test_temp_spreadsheet_helpers.gs`
- `src/test/test_temp_db_helpers.gs`

### 基本挙動
- 固定IDが設定されている  
  → `openById()` で再利用
- 固定IDが未設定で、フォルダ指定がある  
  → フォルダ内を名前検索
- 見つからなければ  
  → 自動生成して Script Properties に保存
- それも使えない場合だけ  
  → 一時 `SpreadsheetApp.create()` にフォールバック

---

## テスト用固定Spreadsheetの自動生成・自動登録

### 目的
テスト用Spreadsheetを手動で毎回用意しなくても、

- Google Drive 上の指定フォルダを見に行く
- なければ自動生成する
- 生成したIDを Script Properties に保存する
- 次回以降は自動再利用する

という運用にします。

### 関連ファイル
- `src/test/test_temp_spreadsheet_helpers.gs`
- `src/test/test_temp_db_helpers.gs`
- `src/app/script_properties.gs`

### まずやること

#### 1. テスト用フォルダを作る
おすすめは次のどちらかです。

- 1フォルダだけ作って全部まとめる
- 通常テスト用とDBテスト用で2フォルダに分ける

#### 2. folder ID を設定する
`script_properties.gs` の `SCRIPT_PROPERTIES_SOURCE` に入れます。

- `TEST_RESOURCE_FOLDER_ID`
- `TEST_DB_RESOURCE_FOLDER_ID`（省略可）

`TEST_DB_RESOURCE_FOLDER_ID` が空なら、DB helper は `TEST_RESOURCE_FOLDER_ID` を使います。

### 通常テスト用の流れ
1. `TEST_FIXED_SPREADSHEET_ID` を見る
2. なければ `TEST_RESOURCE_FOLDER_ID` 配下で `株管理ツール_TEST_SUITE_FIXED` を探す
3. なければ自動生成する
4. 作成したIDを `TEST_FIXED_SPREADSHEET_ID` に保存する

### DBテスト用の流れ
1. `TEST_FIXED_DB_SPREADSHEET_ID_<KEY>` を見る
2. なければ DB用フォルダで名前検索する
3. なければ自動生成する
4. 作成したIDを該当キーに保存する

### 例
- `TEST_FIXED_DB_SPREADSHEET_ID_CORP_A`
  - `株管理ツール_TEST_DB_CORP_A`
- `TEST_FIXED_DB_SPREADSHEET_ID_CORP_B`
  - `株管理ツール_TEST_DB_CORP_B`
- `TEST_FIXED_DB_SPREADSHEET_ID_TEST`
  - `株管理ツール_TEST_DB_TEST`

### メリット
- 手動でSpreadsheetを先に作らなくていい
- 初回だけ自動作成
- 次回以降は `openById()` ベースで軽い
- Script Properties と相性がいい

### 注意
- 本番DBのSpreadsheet IDは入れない
- テスト専用フォルダ / テスト専用Spreadsheetだけを使う
- 同名ファイルが複数あると意図しないものを拾うので、フォルダ内は整理する

---

## Script Properties 運用

### 目的
固定テスト用Spreadsheet IDやテスト用フォルダIDを、  
コードに直書きしすぎずに管理するために使います。

### 管理元
`src/app/script_properties.gs`

### 主なキー
- `TEST_RESOURCE_FOLDER_ID`
- `TEST_DB_RESOURCE_FOLDER_ID`
- `TEST_FIXED_SPREADSHEET_ID`
- `TEST_FIXED_DB_SPREADSHEET_ID_CORP_A`
- `TEST_FIXED_DB_SPREADSHEET_ID_CORP_B`
- `TEST_FIXED_DB_SPREADSHEET_ID_CORP_C`
- `TEST_FIXED_DB_SPREADSHEET_ID_TEST`

### 反映方法
1. `script_properties.gs` の `SCRIPT_PROPERTIES_SOURCE` を埋める
2. `syncScriptProperties_()` を実行
3. `showManagedScriptProperties_()` で確認する

### 注意
- helper 側が読むのは Script Properties なので、`script_properties.gs` を置いただけでは反映されない
- `syncScriptProperties_()` を1回実行する必要がある
- 空文字もそのまま保存される

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

CI用fullバッチ関数は `runAllTests()` 相当のテスト一覧から自動生成されます。新しいテストを `CORE_TESTS_` または `FULL_ONLY_TESTS_` へ追加すると、fullバッチ側にも含まれます。9バッチに収まらない数まで増えた場合は、公開バッチ関数とCIの実行リストも増やします。未対応のままだと、バッチ定義検証で失敗します。

suite名、area、entry point、所属する実テスト関数名と順序の正本は`scripts/ci/gas-test-suite-manifest.js`です。新しいテストは`test_runner.gs`以外の`src/test/**/*.gs`のトップレベルへ`function test_*(){}`形式で定義し、manifestへ同じ関数名、影響領域、`fullOnly`を登録してから、`test_runner.gs`の`CORE_TESTS_` / `FULL_ONLY_TESTS_`と領域別配列をmanifest順に同期してください。Final CI preflightは`Program.body`直下の`FunctionDeclaration`だけを実定義として数え、ネスト宣言、名前付き関数式、callback、object/class method、arrow function、template interpolation内のローカル関数、コメント、文字列、regex、単なる関数参照を除外して、実ファイル・manifest・runner・selected/full entry pointを完全照合します。実定義の未登録・重複、manifest側だけの不存在テスト、同数のsuite間交換、欠落、別suite混入、順序変更は`clasp push`前に失敗します。

selected対象のテストファイルを追加・変更する場合は、ファイル内に定義された全トップレベルテストのmanifest areaの和集合を`scripts/ci/gas-test-selection.js`の`PATH_RULES`へ反映してください。`scripts/ci/check-gas-test-file-mappings.js`は、selected対象の各`src/test/**/*.gs`にトップレベル実テストが1件以上あること、全テストがmanifestへ登録済みであること、manifest areaがPATH_RULESから欠落していないことを監査します。ローカルhelperやcallbackの`test_*`名はarea監査へ混入しません。Final CIはこのpreflightを差分選択と`clasp push`より前に直接実行し、Node回帰テストも同じ監査関数を使用します。

実装sourceを追加・変更する場合は、テストが入力、DB、計算、出力など複数層を跨ぐか確認し、`PATH_RULES`で必要領域の和集合を選んでください。source fileを必ず1領域へ閉じ込める前提にはしません。安全に判断できないsourceはselectedへ登録せずfull fallbackにします。`scripts/ci/check-gas-test-selection.js`のsource棚卸し期待値も同じPRで更新します。

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
- CI用バッチで欠落・重複なく実行されるか
- 一時Spreadsheet作成回数が増えすぎていないか
- DB列追加時に関連テストを更新しているか
- README / docs と整合しているか
- test DB の特例が本番DBへ漏れていないか
- 固定出力Spreadsheetの前提が崩れていないか
- 固定テストSpreadsheet初期化ロジックが崩れていないか
- テスト用フォルダ / 自動生成ルールが崩れていないか

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

### 固定出力Spreadsheetは使い回し前提
test DB の出力先は毎回新規作成されないので、  
前回結果を残したまま比較したい用途には向きません。  
必要なら別名で退避する運用にします。

### 固定テストSpreadsheetも使い回し前提
`runSmokeTests()` / `runAllTests()` の固定Spreadsheetは毎回初期化されます。  
テスト後の状態を証跡として残したいなら、別にコピーする運用にします。

### 自動生成は最初だけ create が走る
フォルダ内に対象ファイルがまだない初回だけは `SpreadsheetApp.create()` が走ります。  
2回目以降は Script Properties に保存された ID を再利用します。

---

## 補足

このディレクトリの目的は、  
**「壊れたことを早く見つける」こと** と  
**「仕様変更の影響範囲を明確にする」こと** です。

迷ったら次の基準で考えます。

- どの本番ファイルの責務を検証しているか
- 既存テストのどこに一番近いか
- そのテストは他の人が見てすぐ意味が分かるか
