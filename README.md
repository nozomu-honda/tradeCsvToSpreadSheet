# 株管理ツール / 取引履歴CSV 4シート生成 Webアプリ

取引履歴CSVを入力として、新しい Google スプレッドシートを作成し、以下の 4 シートを自動生成する Google Apps Script Webアプリです。

- 国内取引
- 外国取引
- 金銭残高（円）
- 金銭残高（ドル）

また、1 シート目には元データを `元データ` シートとして保存します。

---

## ドキュメント構成

このリポジトリでは、仕様を以下の 2 ファイルに分割しています。

- [`docs/spec.md`](docs/spec.md)
  - 全体仕様
  - 入出力
  - シート分類
  - 並び順
  - 表示ルール
  - アラート仕様
  - 実装上の注意

- [`docs/trade-rules.md`](docs/trade-rules.md)
  - 取引区分別ルール
  - 保有数
  - 手数料の消費税額
  - 平均取得単価
  - 手数料抜き売値
  - 取得価格
  - 売却損益
  - 簿価
  - 銘柄ごとの残高
  - FX2の期末簿価

---

## このリポジトリでのルール

- `docs/spec.md` と `docs/trade-rules.md` を仕様の正本とする
- 変更履歴や作業メモは、正本仕様に直接混ぜない
- 修正時は、まず仕様を更新し、その後コードを修正する
- ChatGPT に再実装や修正を依頼する際は、`docs/spec.md` と `docs/trade-rules.md` を渡す

---

## 対象機能

- CSVリンク入力
- ローカルCSVアップロード
- 新規スプレッドシート作成
- 元データシート生成
- 国内取引シート生成
- 外国取引シート生成
- 金銭残高（円）シート生成
- 金銭残高（ドル）シート生成
- 各種補助列の計算
- アラート出力

---

## 技術構成

- Google Apps Script
- Google Spreadsheet
- clasp
- Git / GitHub
- VS Code

---

## 開発フロー

### 1. コード編集
VS Code でローカル編集する。

### 2. Apps Script へ反映

```bash
clasp push
```

### 3. 必要に応じてバージョン作成

```bash
clasp create-version "update message"
```

### 4. 必要に応じてデプロイ更新
既存の公開用デプロイを更新する。

### 5. GitHub へ反映

```bash
git add .
git commit -m "docs: update spec"
git push
```

---

## ディレクトリ例

```text
.
├─ README.md
├─ appsscript.json
├─ Index.html
├─ src/
│  ├─ config.gs
│  ├─ web.gs
│  ├─ import.gs
│  ├─ parser.gs
│  ├─ builder.gs
│  ├─ writer.gs
│  └─ utils.gs
└─ docs/
   ├─ spec.md
   └─ trade-rules.md
```

---

## 仕様更新時のルール

仕様変更が発生した場合は、以下の順で更新する。

1. `docs/spec.md` または `docs/trade-rules.md` を修正
2. コードを修正
3. 動作確認
4. commit / push

---

## 注意事項

- `roundedAvg` のような一時的な実装都合を仕様書に持ち込まない
- 簿価、平均取得単価、取得価格のような計算項目は、計算基準を明示する
- 「変更点メモ」ではなく「最終仕様」を残す

---

## 再実装依頼時の推奨手順

新しい ChatGPT や別の人に実装を依頼する場合は、以下の 2 ファイルを渡す。

- `docs/spec.md`
- `docs/trade-rules.md`

必要に応じて、対象コードとして以下を追加する。

- `src/builder.gs`
- `src/writer.gs`
- `src/utils.gs`

---

## 今後の改善候補

- アラート文言の整理
- 仕様変更履歴ファイルの分離
- テストケース一覧の追加
- サンプルCSVの追加
- README からの各仕様へのリンク強化
