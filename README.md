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

- [`docs/clasp-operations.md`](docs/clasp-operations.md)
  - CI用Apps Scriptへの反映手順
  - 本番Apps Scriptへの反映手順
  - 本番Webアプリの再デプロイ手順
  - CI用と本番用の設定・認証・ignoreの違い

- [`docs/production-deploy.md`](docs/production-deploy.md)
  - 本番反映GitHub Actionsの運用手順
  - ラベル起動、dry-run、本番反映の違い
  - Production Status IssueとGitHub Environmentの設定

- [`docs/production-deploy-control.md`](docs/production-deploy-control.md)
  - default branch `main` へ同期が必要なcontrol workflowの役割
  - PRラベル起動と本番SHA追跡の境界

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

### 1. 初回セットアップ

このリポジトリでは、npm scriptからローカルに固定された `@google/clasp@3.3.0` を使う。初回または `package-lock.json` 更新後は、先に依存関係をインストールする。

```bash
npm ci
```

### 2. コード編集
VS Code でローカル編集する。

### 3. Apps Script へ反映

bareな `clasp push` は使わない。CI用と本番用のApps Script project設定・認証を混同しないため、用途ごとに入口を分ける。

実際の操作手順は、最初に [`docs/clasp-operations.md`](docs/clasp-operations.md) を確認する。

CI用の反映はGitHub Actionsだけが行う。ローカルPCからテスト専用Apps Scriptプロジェクトへ手動pushしない。
PRの最終CIは、現在head SHAのレビュー完了コメントを付けた後に `run-final-ci` ラベルで起動する。docs-onlyではActions自体を起動せず、backend GAS-onlyではGAS Testsだけ、UI・Web・manifest・deployment・E2E関連ではGAS Tests成功後にWeb E2Eを実行する。同じhead SHA上の成功Check Runは再利用し、旧ラベルの `run-gas-tests` / `gas-web-e2e` は最終CIの起動には使わない。詳細は [`docs/gas-ci.md`](docs/gas-ci.md) を参照する。

本番反映は、原則としてマージ済みPRへの専用ラベル付与でGitHub Actionsの `Deploy production` workflowを起動する。
PRラベルはdefault branch `main` 上のcontrol workflowが受け、条件を満たした場合だけ `deploy-production.yml` を `ref: develop` でdispatchする。
`workflow_dispatch` は人間向けfallbackとして残す。
正式運用前に、control workflowとdeploy workflow定義を `main` へ同期する後続対応が必要。
Production Status Issue番号はRepository Variable `PRODUCTION_STATUS_ISSUE_NUMBER` だけを正本にし、未設定時のstatus syncは安全にskipする。
本番workflowはEnvironmentなしpreflight、`production-preflight` Environment付きauthenticated dry-run、`production` Environment付き本番mutationを分ける。
本番workflow用の `CLASP_PRODUCTION_CREDENTIALS`、`PRODUCTION_SCRIPT_ID`、`PRODUCTION_DEPLOYMENT_ID` はRepository Secretsへ置かず、`production-preflight` と `production` の各Environment Secretsへ置く。
`PRODUCTION_WEB_APP_URL` などの非Secret値は `production-preflight` と `production` の各Environment Variablesへ置く。
production Environmentは、実本番mutationを開始したrunの履歴、required reviewers、deployment protection rules、本番URL表示に使う。
ローカル手動fallbackでは、本番専用設定を用意したうえで次のnpmコマンドだけを使う。

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
