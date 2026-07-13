# Current Status

最終更新: 2026-07-13

このファイルは、最新 `develop` とGitHub上のIssue/PR状態を前提に、次の作業判断に必要な現状だけをまとめる。
長い履歴や完了済みの古い推測は `docs/TODO.md` ではなく、このファイルの完了事項として整理する。

## 現在のGitHub状態

- Issue #71「CI用と本番反映用のclasp設定・操作を完全分離する」は完了済み。
- PR #72「CI用と本番反映用のclasp操作を分離する」は `develop` にマージ済み。
- Issue #73「CI用と本番用のclasp反映手順を分かりやすく整理する」は完了済み。
- PR #74「CI用と本番用のclasp反映手順を整理する」は `develop` にマージ済み。
- 2026-07-13時点で、本番Apps Scriptへのpushと本番Webアプリ再デプロイは未実施。

## 完了済みの主な範囲

### 基本機能

- 野村CSV/スプレッドシート取込の既存仕様を維持。
- 取込データを内部共通レコードへ正規化し、DB保存と出力生成へ流す構成を維持。
- 6シート出力に対応済み。
  - `日本株`
  - `米国株`
  - `外債`
  - `投信`
  - `金銭残高（円）`
  - `金銭残高（ドル）`
- Web UIの見出し、実行ボタン、結果表示は6シート前提へ更新済み。
- 実行結果に `外債件数` を表示済み。
- 出力タブ順は `日本株 -> 米国株 -> 外債 -> 投信` を含む固定順へ整理済み。
- `runStagingSheetFromWebApp` の重複定義は現在の `develop` では確認されない。
- `test DB` では赤セル必須入力バリデーションをスキップできる設計を維持。
- 重複判定は `rowHash`、ロールバックは `importId` 単位の論理削除を維持。

### 楽天対応

- 楽天証券 Phase 1 / Phase 2 の主要入力形式に対応済み。
  - 楽天日本株
  - 楽天米国株
  - 楽天投資信託
  - 楽天配当金・分配金
  - 楽天入出金履歴
- 楽天入力時は、取込UIで選んだ通常DBキーを内部で楽天DBキーへルーティングする。
  - `nomura_corp_a` -> `rakuten_corp_a`
  - `nomura_corp_b` -> `rakuten_corp_b`
  - `nomura_test` -> `rakuten_test`
- 楽天DBは `uiVisible: false` とし、取込用UIには直接表示しない。
- DBリセット/ロールバック用UIでは、楽天DBも対象に含める。
- 楽天DBは `RAKUTEN_DB_HEADERS` を使って保存する。
- 楽天DBレコードから共通計算モデルへ戻す変換は実装済み。
- 楽天配当金CSVの手入力列 `レート` / `現地源泉税［円］` / `国内源泉税［円］` は検出・バリデーション・DB保存・出力反映まで初期対応済み。
- 楽天出力は次の初期専用シート対応まで完了。
  - `楽天日本株`
  - `楽天米国株`
  - `楽天投資信託`
  - `金銭残高（円）`
  - `金銭残高（ドル）`
- 楽天配当金・分配金・元本払戻金は、既存楽天タブと金銭残高への代表値反映、E2Eでの主要値確認まで進んでいる。

### GAS CI / clasp運用

- PR向けGAS CIは `run-gas-tests` ラベル付与時だけ起動する。
- PR向けGAS CIは、テスト専用Apps Scriptプロジェクトだけへpushする。
- CIでは `pull_request_target` を使わず、fork / external PRへGoogle Secretsを渡さない。
- GAS CIは `runAllTests()` の1回実行ではなく、`runGasTestBatch01` から `runGasTestBatch09` までの9バッチを順番に実行する。
- バッチ定義の欠落・重複・公開入口数の不一致を検知する検証を追加済み。
- `runSmokeTests()` と `runAllTests()` は手動確認用の既存テスト入口として残っている。未実装タスクではない。
- CI用clasp project設定はrunner一時領域へ生成し、すべてのCI側clasp操作で `--project <CI専用設定ファイル>` と `--ignore <repo .claspignore>` を明示する。
- CI用project設定の `rootDir` はリポジトリルートの絶対パスへ正規化し、`CLASP_PROJECT_JSON` の相対 `srcDir` はCIでは使わない。
- GAS Tests と GAS Web App E2E の実runは、共通の `gas-shared-test-project` concurrency groupで直列化する。
- 対象外ラベルのignore/skip runは固有groupへ分離し、待機中の実runをキャンセルしない。
- CI用と本番用のclasp操作は分離済み。
- 本番Apps Script操作は次の本番専用npmコマンドだけを使う。
  - `npm run gas:production:open`
  - `npm run gas:production:status`
  - `npm run gas:production:push`
- 本番用project設定は `.clasp.production.json`、本番用ignoreは `.clasp.productionignore`、認証はclasp named user `production` を使う。
- clasp反映手順は `docs/clasp-operations.md` に整理済み。

### Web App E2E

- GAS Web App E2Eは、テスト専用Apps Scriptプロジェクトへpushし、一時Webアプリdeploymentを作成してからPlaywrightで確認する。
- 一時Webアプリdeploymentはテスト後に削除する。
- Web App E2Eは楽天系の代表7ケースまで拡張済み。
  - 楽天日本株
  - 楽天米国株
  - 楽天投資信託
  - 楽天入出金履歴
  - 楽天米国株配当
  - 楽天投信分配金
  - 楽天元本払戻金
- 出力Spreadsheet検査は `checks` と `rowChecks` に対応済み。
- `rowChecks` により、同じ行の複数列を検査できる。
- 楽天元本払戻金E2Eでは、買付行と払戻行の取り違えを避けるため、払戻行そのものを `rowChecks` で確認する。

### ドキュメント / 運用ルール

- `AGENTS.md` に、GitHub上の人間が読む文章を原則日本語で書くルールを追加済み。
- `docs/gas-ci.md` にGAS CIの実行条件、Secrets、失敗判定、clasp run fallbackを整理済み。
- `docs/gas-web-e2e.md` にWeb App E2Eの対象、Secrets、セキュリティ境界、workflow summaryを整理済み。
- `docs/clasp-operations.md` にCI用と本番用の反映手順を整理済み。

## 未完了 / 確認待ち

- 本番Apps Scriptへの `npm run gas:production:push` は未実施。
- 本番Webアプリの新バージョン再デプロイは未実施。
- 本番Webアプリの主要画面確認は未実施。
- 別ユーザーでのDrive OAuth承認、DBフォルダ編集権限、Webアプリ実行確認は未完了。
- 楽天米国株・楽天投資信託・楽天金銭残高・配当金/分配金/元本払戻金は、代表fixtureの自動テストが進んでいるが、実運用データでの最終確認は未完了。
- 楽天専用ロールバックUI分離は初期対応済みだが、実運用でのWeb UI表示確認は未完了。
- 楽天配当金・分配金・元本払戻金の専用出力は代表値反映まで進んでいるが、全列・全ケースを楽天専用出力として完全再現する対応は残っている。
- Web App E2Eは楽天主要ケースを優先して整備済み。野村共通CSV、外債、大容量CSV、異常系、rollback異常系は未整備。

## 次の開発優先順位

1. 野村共通CSV Web E2Eを追加する。
2. 外債Web E2Eを追加する。
3. 大容量CSV Web E2Eを追加する。
4. header不足、不正CSV、重複importなどの異常系Web E2Eを追加する。
5. rollback異常系Web E2Eを追加する。
6. 楽天の実運用データ確認を進める。
7. 楽天の残りの専用出力対応を進める。

## テスト運用

- 軽い手動確認は `runSmokeTests()` を使う。
- 手動の一括確認入口は `runAllTests()` を使う。
- CIではApps Scriptの実行時間上限を避けるため、`runAllTests()` 相当の一覧を `runGasTestBatch01` から `runGasTestBatch09` までに分割して実行する。
- PRの最終GAS確認は `run-gas-tests` ラベルで起動する。
- Web App E2Eは `gas-web-e2e` ラベル、または `workflow_dispatch` で起動する。

## Codexへの伝え方

手動マージや手動確認をした後は、このファイルを更新してからCodexに以下のように伝える。

```text
最新の docs/current-status.md を読んで、develop 最新を前提に作業してください。
まだコード変更はしないでください。
```

Codexへの依頼テンプレートは `docs/codex-prompts.md` を使う。
AutoHotkeyショートカットの説明は `docs/codex-shortcuts.md` を参照する。

## 注意点

- 実際のScript ID、Deployment ID、Web App URL、Spreadsheet URL、Drive folder ID、OAuth token、GitHub Secrets実値はコミットしない。
- 人・Codexともに、リポジトリ直下でbareな `clasp push` を実行しない。
- CI操作はGitHub Actionsだけに任せ、本番反映は人間が本番専用npmコマンドで行う。
- Codexは本番反映、GitHub Secrets変更、本番GAS・本番DB・本番Drive操作を実行しない。
- `appsscript.json` のOAuth scope変更後は、Webアプリの新バージョン再デプロイが必要。
- Webアプリを「アクセスしているユーザー」として実行する場合、利用者ごとにDrive権限承認とDBフォルダ編集権限が必要。
- `spreadsheetId` 未設定DBは Script Properties の `DB_SPREADSHEET_ID_<DB_KEY>` に実ファイルIDを保存して再利用する。
