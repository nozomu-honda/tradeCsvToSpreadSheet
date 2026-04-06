# TODO / 作業メモ

このファイルは、株管理ツール作成プロジェクトの作業管理・保留事項・再開用メモをまとめるためのもの。  
確定仕様は `spec.md` と `trade-rules.md` を正とし、このファイルには「今やること」と「次回再開しやすい情報」を置く。

---

## 関連ドキュメント

- `spec.md`
- `trade-rules.md`

---

## 現在の目的

`feature/use-db` ブランチで、取引履歴CSVをDBへ蓄積し、そのDB全体を正本として以下のシートを安定して生成する。

- 国内取引
- 外国取引
- 金銭残高（円）
- 金銭残高（ドル）
- 元データ

特に以下を重視する。

- DBへの重複登録防止
- 別CSV追加時の再生成整合性
- 平均取得単価の計算精度
- 簿価の計算基準の統一
- 銘柄ごとの残高のズレ防止
- 表示ルールと内部保持ルールの分離
- テストを回しながら安全に修正できる状態を保つ

---

## 現在の最優先

- DB運用の仕上げ
- 実CSVでの重複排除確認
- 実CSVでの追加蓄積確認
- Webアプリ結果画面の見える化
- `runSmokeTests` / `runAllTests` による検証運用

---

## 現在の前提・確定事項

以下はこの案件で現在固定している重要事項。  
詳細な仕様の正本は `spec.md` / `trade-rules.md` を参照する。

### 計算ルール
- 平均取得単価は内部小数保持、表示整数
- 簿価（現物売却・現物買取・強制償還（売））は `acquisitionPrice` を使う
- `bookValue = -acquisitionPrice`
- 強制償還（売）の `手数料抜き売値` は `受渡金額/決済損益`
- 償還は「一つ前の保有数が0かどうか」で分岐する
- 現物売却 / 現物買取 / 強制償還（売） / 償還 で平均取得単価が無い場合は「対象外」ではなく「平均取得単価が未計算」とアラート
- 平均取得単価そのものを先に丸めて別計算に使わない

### 並び順
- 取引シートは `商品 → 銘柄名 → 受渡日 → 約定日 → 取引区分優先順位` で昇順ソート
- `compareTradePriority_` を使う

### 表示ルール
- 保有数0は赤字
- 最後の取引で保有数が正なら銘柄名セルを水色
- 金額系は基本的に整数表示
- レートは小数表示

### 非表示列
#### 国内取引
- 摘要
- 発行通貨
- レート
- 決済通貨

#### 外国取引
- 摘要

### ユーティリティ
- `normalizeZero_` は `utils.gs` に入れる

### DB運用
- DB本体は `取引DB`
- 取込履歴は `取込履歴`
- 重複判定は `rowHash` ベース
- `rowHash` はファイル名ではなく取引内容から作る
- 別CSVでも同じ取引ならスキップ対象になる
- Webアプリ入口は DB フローに接続済み
- URL入力 / CSVアップロードのどちらでも DB へ追加してから4シートを再生成する

---

## 対象ファイル

### 主要コード
- `src/builder.gs`
- `src/writer.gs`
- `src/utils.gs`
- `src/import.gs`
- `src/parser.gs`
- `src/config.gs`
- `src/web.gs`
- `src/db.gs`
- `src/db_config.gs`

### テスト
- `src/test.gs`

### 画面
- `Index.html`

---

## 現在の状況

- `develop` の最新変更は `feature/use-db` に取り込み済み
- `builder.gs` は 4/6 の最新仕様反映済み
- `test.gs` は `develop` 最新テスト + DBテストに整理済み
- `db.gs` / `db_config.gs` は共有DB対応済み
- `web.gs` / `import.gs` は DBフローへ接続済み
- Webアプリから実際にCSVを追加できることは確認済み
- 同一CSV再投入時の重複スキップ確認は実施しやすい状態
- 結果画面で DB 取込件数 / 追加件数 / スキップ件数 / DBリンク を表示する改善版あり
- PR時の自動テスト導入は保留中

---

## テスト運用

### 普段の確認
- 実行関数: `runSmokeTests`
- 用途: builder / utils / import / db の軽い確認

### 仕上げ確認
- 実行関数: `runAllTests`
- 用途: builder / utils / writer / import / db をまとめて確認

### DB運用確認
- 同じCSVを再投入する
  - `insertedCount = 0`
  - `skippedCount = rowCount`
  を確認する
- 一部重複を含む別CSVを投入する
  - `insertedCount > 0`
  - `skippedCount > 0`
  を確認する
- `取引DB` の行数が想定どおり増えるか確認する
- `取込履歴` の最新行で取込結果を確認する

### 注意
- writer系テストでは一時スプレッドシートを作る
- `SpreadsheetApp` / `DriveApp` の権限承認が必要
- Apps Script では末尾 `_` の関数は実行メニューに出ない

---

## 次にやること

### 最優先
- [ ] 同じCSVを再投入して、`insertedCount = 0` / `skippedCount = rowCount` を確認する
- [ ] 一部重複を含む別CSVを投入して、`insertedCount` と `skippedCount` が両方立つことを確認する
- [ ] `取引DB` と `取込履歴` を実データで目視確認する
- [ ] `runSmokeTests`
- [ ] `runAllTests`

### その次
- [ ] 結果画面の改善版 `Index.html` を正式反映する
- [ ] 結果画面に DB URL / 追加件数 / スキップ件数 が常に見える状態にする
- [ ] DB重複判定対象列（`rowHash` の項目）を最終確認する
- [ ] `feature/use-db` 用の運用手順を簡単にメモ化する

### その後
- [ ] `docs/spec.md` / `docs/trade-rules.md` と DB運用の整合を最終確認する
- [ ] commit
- [ ] push
- [ ] 必要なら PR 用の説明文を作る

---

## 懸念点チェックリスト

- [ ] 銘柄ごとの残高が 1 / -1 ずれる再発がないか
- [ ] `-0` 表示が再発しないか
- [ ] 平均取得単価がない売却時に正しいアラートになるか
- [ ] 全売却後の次の取引で古い平均取得単価を拾わないか
- [ ] 並び順が仕様どおり維持されているか
- [ ] writer 側の条件付き書式が仕様どおりか
- [ ] 別CSV追加時に意図しない重複登録が起きないか
- [ ] 別CSV追加時に本来入るべき新規行までスキップしていないか
- [ ] 共有DB運用で権限エラーが起きないか
- [ ] 結果画面と実際の `取込履歴` の件数が一致するか

---

## 保留事項

### PR時の自動テスト導入
- GitHub PR 作成時に軽量テストを自動実行したい
- GAS依存部分と純ロジック部分を分離してから着手する
- `core.gs` の切り出し設計をする
- GitHub Actions で軽量テストを回す

### 今はやらないこと
- 大規模リファクタリング
- Apps Script API 経由のCI実行
- writer系テストの無理な自動化
- 大きな仕様変更
- DBスキーマの大幅変更

---

## 作業ルール

- `spec.md` と `trade-rules.md` を正とする
- 仕様変更時は、コードより先に仕様を更新する
- 仕様変更でない修正は差分を小さくする
- 1回の修正ごとに `runSmokeTests` を回す
- 最後に `runAllTests` を回す
- 問題が再現しないなら無理に予防修正を入れない
- `feature/use-db` の作業は `develop` の軽微修正と混同しない

---

## よくあるハマりどころ

- 末尾 `_` の関数は実行メニューに出ない
- ChatGPT のコードブロック記号をそのまま貼ると壊れる
- 部分差し替えで `{}` を壊しやすい
- writer テストは権限承認が必要
- テストだけ通って実CSVでズレることがある
- `develop` と `feature/use-db` の `test.gs` が競合しやすい
- Webアプリ画面で件数が見えていても、`取込履歴` 側で最終確認した方が安全

---

## 再開用プロンプト

```text
この案件の続きです。

GASで「取引履歴CSVから4シートを生成するWebアプリ」を作っています。
現在は feature/use-db ブランチで、CSVをDBに蓄積し、そのDB全体から4シートを再生成する方式を進めています。

最新コード前提で、以下のファイルを確認しながら進めてください。
- src/builder.gs
- src/writer.gs
- src.utils.gs
- src/import.gs
- src/web.gs
- src/db.gs
- src/db_config.gs
- src/test.gs
- Index.html
- docs/spec.md
- docs/trade-rules.md
- docs/TODO.md

重要仕様:
- 平均取得単価は内部小数保持、表示整数
- 簿価(現物売却・現物買取・強制償還（売）)は acquisitionPrice を使う
- bookValue = -acquisitionPrice
- 強制償還（売）の手数料抜き売値は 受渡金額/決済損益
- 償還は一つ前の保有数が0かどうかで分岐
- 取引シートは 商品 → 銘柄名 → 受渡日 → 約定日 → 取引区分優先順位 で昇順ソート
- compareTradePriority_ を使う
- 保有数0は赤字
- 最後の取引で保有数が正なら銘柄名セルを水色
- 国内取引の非表示列: 摘要 / 発行通貨 / レート / 決済通貨
- 外国取引の非表示列: 摘要
- normalizeZero_ は utils.gs に入れる

DB運用の前提:
- 重複判定は rowHash ベース
- 別CSVでも同じ取引ならスキップ対象
- Webアプリ入口は DB フローに接続済み
- URL入力 / CSVアップロードのどちらでも DB に追加してから4シートを再生成する

現在の状況:
- develop の変更は feature/use-db に取り込み済み
- WebアプリからCSV追加は確認済み
- 次は、同じCSV再投入時の skippedCount 確認と、一部重複を含む別CSVで insertedCount / skippedCount の両立確認を進めたい
- 変更差分はできるだけ小さくしたい

今回やりたいこと:
- DB運用の最終確認
- 必要なら Index.html / db.gs / test.gs を最小修正
- 必要なら docs/TODO.md も更新

触らないもの:
- PR自動テスト導入
- core.gs への大規模切り出し
- 大きな仕様変更
```