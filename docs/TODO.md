# TODO / 引き継ぎメモ

このファイルは、次チャットへ安全に引き継ぐための **現状整理・未反映差分・次に見るべき場所** をまとめる。  
確定仕様は `spec.md` と `trade-rules.md` を正とする。

---

## 1. 現在のコード状態（ざっくり）

### 1.1 すでにコードへ反映済みの可能性が高いもの
- `config.gs`
  - `OUTPUT_FOREIGN_BOND = '外債'`
- `builder.gs`
  - 外貨買付系簿価は `受渡金額 × レート - 税額`
  - `入金（分配金）` は簿価・銘柄ごとの残高を増やさない
- `source_routing_rakuten_phase1.gs`
  - 楽天日本株 / 米国株 / 投信 / 配当金・分配金 / 入出金履歴の検出・正規化あり
- `writer.gs`
  - `外債` シートの非表示列設定あり
- `db_config.gs`
  - `test DB` あり
  - `test DB` 用固定出力Spreadsheet設定あり
- `test_runner.gs`
  - 6シートテストあり
  - 外債 writer テストあり
  - 外貨買付簿価のテストあり

### 1.2 まだ未反映差分の可能性が高いもの
- `web.gs`
  - `doGet()` タイトルが `4シート生成` のままの可能性
  - `runStagingSheetFromWebApp` が重複定義の可能性
- `Index.html`
  - 見出し / ボタン文言が `5シート生成` のままの可能性
  - 実行結果表示に `外債件数` がない可能性
- タブ順固定
  - `reorderOutputSheets_()` 相当が未実装または未接続の可能性
  - 固定出力Spreadsheet再利用時に古いタブ順を引きずる可能性

---

## 2. 次チャットで最初に確認するファイル

### 2.1 必須
- `src/app/web.gs`
- `Index.html`
- `src/app/import.gs`
- `src/app/db.gs`
- `src/app/config.gs`
- `src/app/writer.gs`
- `src/app/builder.gs`
- `src/app/db_config.gs`
- `src/test/test_runner.gs`

### 2.2 余裕があれば
- `src/test/test_output_split.gs`
- `src/test/test_writer.gs`
- `src/test/test_trade_rows.gs`

---

## 3. 最新の合意仕様

### 3.1 出力
- 6シート出力
- `外債` は `米国株` から分離
- タブ順は  
  `元データ → 日本株 → 米国株 → 外債 → 投信 → 金銭残高（円） → 金銭残高（ドル）`

### 3.2 UI
- タイトルは `6シート生成`
- 実行ボタンも `6シート生成`
- 実行結果に `外債件数` を表示

### 3.3 計算
- 外貨買付系簿価は  
  `受渡金額 × レート - 手数料の消費税額`
- `入金（分配金）` は簿価・銘柄ごとの残高を増やさない
- 平均取得単価は内部小数保持、表示整数
- 売却簿価は `-acquisitionPrice`

### 3.4 一次受け枠
- CSVリンク / スプレッドシートURLまたはID / ローカルCSVファイル の3系統で作成可能
- 赤セルは必須入力
- `test DB` だけ赤セル必須入力バリデーションをスキップ可能

### 3.5 DB
- `test DB` は固定確認用Spreadsheetへ再出力可能
- 重複判定は `rowHash`
- ロールバックは `importId` 単位の論理削除
- 楽天DBは、将来的に野村共通 `DB_HEADERS` ではなく楽天専用 `RAKUTEN_DB_HEADERS` へ保存する
- 楽天入力処理 / 楽天DB保存 / 楽天出力 / 楽天ロールバックは野村処理から分離し、計算コアだけ共通利用する
- 楽天配当金CSVでは `レート` / `現地源泉税［円］` / `国内源泉税［円］` を楽天専用補完列として扱う

---

## 4. 次にやること

### 4.1 最優先
- [ ] 楽天DB保存処理を `RAKUTEN_DB_HEADERS` ベースに切り替えるPRを分けて作る
- [ ] 楽天DBレコードから共通計算モデルへ変換する処理を設計/実装する
- [ ] 楽天配当金CSVの手入力3カラムの検出・バリデーションを追加する
- [ ] `web.gs` のタイトル文言確認
- [ ] `Index.html` の見出し / 実行ボタン文言確認
- [ ] 実行結果表示へ `外債件数` を追加
- [ ] タブ順固定 helper を実装または接続
- [ ] `runStagingSheetFromWebApp` の重複定義整理
- [ ] `runSmokeTests`
- [ ] `runAllTests`

### 4.2 実データ確認
- [ ] 6シート出力で `外債` が独立タブに出ることを確認
- [ ] タブ順が `日本株 → 米国株 → 外債 → 投信` になることを確認
- [ ] `入金（分配金）` で簿価・残高が増えないことを確認
- [ ] 外貨買付系簿価が `受渡金額 × レート - 税額` になっていることを確認
- [ ] 約定日 / 受渡日 の日付ずれが再発しないことを確認
- [ ] 楽天投資信託CSVを実取込して `投信` に出ることを確認
- [ ] 楽天配当金・分配金CSVを実取込して `入金（配当金）` / `入金（分配金）` と金銭残高に出ることを確認
- [ ] 楽天入出金履歴CSVを実取込して `入金（振込）` / `出金（振込）` と金銭残高に出ることを確認

### 4.3 DB確認
- [ ] 同じ入力を再投入して `insertedCount = 0` / `skippedCount = rowCount` を確認
- [ ] 一部重複を含む別入力を投入して `insertedCount > 0` / `skippedCount > 0` を確認
- [ ] `test DB` の固定出力Spreadsheet再利用が維持されることを確認
- [ ] `取引DB` と `取込履歴` を目視確認

---

## 5. テスト運用メモ

- `runSmokeTests`
  - 軽い確認
  - ロジック破壊の早期検知用
- `runAllTests`
  - writer 系も含むフル確認
- 固定Spreadsheet再利用運用
  - Script Properties
  - テスト用フォルダ
  - safer sync
  - auto ensure
- `test DB`
  - 赤セルバリデーションを無視して後続確認用
  - 固定出力Spreadsheetへ上書き出力

---

## 6. よくあるハマりどころ

- `Index.html` だけ直して `web.gs` のタイトルが古いまま残る
- `config.gs` / `writer.gs` / テストは6シート化済みでも、UIだけ5シート表記のまま残る
- 固定出力Spreadsheetを再利用していると、タブ順が前回状態を引きずる
- `builder.gs` の計算式修正後に、旧テスト名が runner に残る
- `runStagingSheetFromWebApp` の重複定義が残ると、見た目上わかりづらい

---

## 7. 次チャット用メモ

次チャットでは、まず **コードの現状確認 → 未反映差分の最小修正 → docs / テスト整合** の順で進める。  
特に優先順位は次のとおり。

1. `web.gs` / `Index.html`
2. タブ順固定
3. 実データ確認
4. docs 最終整合
