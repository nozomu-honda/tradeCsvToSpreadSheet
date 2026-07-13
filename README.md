# 株管理ツール / 取引履歴CSV 4シート生成 Webアプリ

取引履歴CSVを入力として、新しい Google スプレッドシートを作成し、以下の 4 シートを自動生成する Google Apps Script Webアプリです。

- 国内取引
- 外国取引
- 金銭残高（円）
- 金銭残高（ドル）

また、1 シート目には元データを `元データ` シートとして保存します。

---

## ドキュメント構成

このリポジトリでは、仕様および作業メモを以下のファイルに分けて管理しています。

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

- [`docs/TODO.md`](docs/TODO.md)
  - 現在の作業状況
  - 次にやること
  - 保留事項
  - 再開用メモ

---

## このリポジトリでのルール

- `docs/spec.md` と `docs/trade-rules.md` を仕様の正本とする
- `docs/TODO.md` は作業管理・保留事項・再開用メモとして使う
- 変更履歴や作業メモは、正本仕様に直接混ぜない
- 修正時は、まず仕様を更新し、その後コードを修正する
- ChatGPT に再実装や修正を依頼する際は、`docs/spec.md` と `docs/trade-rules.md` を渡す
- 作業再開時は必要に応じて `docs/TODO.md` も参照する

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

bareな `clasp push` は使わない。CI用と本番用のApps Script project設定・認証を混同しないため、用途ごとに入口を分ける。

CI用の反映はGitHub Actionsだけが行う。ローカルPCからテスト専用Apps Scriptプロジェクトへ手動pushしない。

本番反映は、本番専用設定を用意したうえで次のnpmコマンドだけを使う。

```bash
npm run gas:production:status
npm run gas:production:push
```

本番用のApps Scriptエディタを開く場合だけ、次を使う。

```bash
npm run gas:production:open
```

本番反映には、ローカル専用の `.clasp.production.json` とclasp named user `production` を使う。`.clasp.production.json`、`.clasprc.json`、Script ID、Deployment ID、Web App URL、Spreadsheet URL、OAuth token、GitHub Secrets実値はコミットしない。

`gas:production:status` は内部で `clasp show-file-status` を実行し、本番専用project設定と本番専用ignoreでpush対象を確認する。

`gas:production:push` は、`develop` ブランチ、clean working tree、最新 `origin/develop` 一致、production認証、production専用ignore、確認入力を満たさない限り停止する。

---

## Codex

- Codexへの依頼テンプレートとAutoHotkeyショートカットは [docs/codex-shortcuts.md](./codex-shortcuts.md) を参照。
