# GAS Web App E2E

## 目的

GAS Webアプリの手動確認で行っていた「テスト専用GASへpush、固定WebアプリDeployment更新、UI入力、実行、結果確認、後始末」を GitHub Actions と Playwright で自動化する。

このE2Eはテスト専用Apps Script、テスト専用Webアプリ、テスト専用DB、テスト用入力スプレッドシートだけを対象にする。本番GAS、本番Webアプリ、本番DB、本番Driveには触れない。

## 構成

- `.github/workflows/gas-web-e2e.yml`
  - claspでテスト専用GASへpushする
  - 固定のテスト用WebアプリDeployment IDを更新する
  - PlaywrightでWebアプリを開き、楽天配当金スプレッドシート取込を1ケース実行する
- `scripts/ci/deploy-test-webapp.sh`
  - GitHub Secretsから一時的に `.clasprc.json` / `.clasp.json` を生成する
  - `clasp push --force` と `clasp deploy --deploymentId` を実行する
  - 固定WebアプリURLがトップ画面を返すまでリトライする
- `tests/e2e/rakuten-dividend.spec.js`
  - 入力元スプレッドシートURLを設定する
  - UI上は `nomura_test` を選択し、楽天入力の内部ルーティングで `rakuten_test` に入ることを確認する
  - 完了結果、検出形式、件数、アラート、出力リンクを検証する
  - 実行後にE2E専用cleanup関数でロールバックを試みる

## 必要Secrets

- `CLASPRC_JSON`
- `CLASP_USER`
- `GAS_TEST_SCRIPT_ID`
- `GAS_TEST_WEBAPP_DEPLOYMENT_ID`
- `GAS_TEST_WEBAPP_URL`
- `CI_E2E_TOKEN`
- `E2E_INPUT_SPREADSHEET_URL`

`CLASP_PROJECT_JSON` は、既存GAS CIと同様にカスタム `.clasp.json` が必要な場合だけ使う。

## テストGAS初期設定

1. CI専用Googleアカウントを使う。
2. テスト専用Apps Scriptプロジェクトを作る。
3. CI専用アカウントで Apps Script API を有効化する。
4. CI専用アカウントの clasp ログイン情報を `CLASPRC_JSON` に保存する。
5. テスト専用Script IDを `GAS_TEST_SCRIPT_ID` に保存する。
6. テスト専用Webアプリの固定Deployment IDを `GAS_TEST_WEBAPP_DEPLOYMENT_ID` に保存する。
7. テスト専用WebアプリURLを `GAS_TEST_WEBAPP_URL` に保存する。

## Script Properties

テスト専用Apps Scriptの Script Properties に以下を設定する。

- `CI_E2E_TOKEN`: GitHub Secret `CI_E2E_TOKEN` と同じ値
- `DB_SPREADSHEET_ID_RAKUTEN_TEST`: E2E用楽天テストDBを固定したい場合に設定

`CI_E2E_TOKEN` が設定されている場合、Webアプリの取込実行とE2E cleanupは同じトークンを持つpayloadだけを受け付ける。トークンはURL、ログ、スクリーンショットへ出さない。

## Drive / Sheets共有

CI専用Googleアカウントに、以下のテスト専用リソースだけを共有する。

- テスト用入力スプレッドシート
- テスト用DB保存先フォルダ
- 楽天テストDB
- 固定出力スプレッドシートを使う場合はそのファイル

本番DBや本番Driveフォルダは共有しない。

## Actions実行

このworkflowは以下で実行できる。

- `workflow_dispatch`
- 同一リポジトリPRに `gas-web-e2e` ラベルを付けた場合

PRイベントは `opened` / `synchronize` / `reopened` / `ready_for_review` / `labeled` を受ける。ただし、WebアプリE2EはGASデプロイとブラウザ実行を含むため、初期運用では `gas-web-e2e` ラベル付きPRだけで動かす。fork / external PR ではSecretsを使うjobを実行しない。

## ローカル実行

ローカルで実行する場合は、以下の環境変数を設定する。

- `GAS_TEST_WEBAPP_URL`
- `E2E_INPUT_SPREADSHEET_URL`
- `CI_E2E_TOKEN`

実行例:

```bash
npm install --no-save --package-lock=false @playwright/test
npx playwright install chromium
npx playwright test --list
npx playwright test
```

## Artifact確認

失敗時だけ以下をArtifactとして保存する。

- `playwright-report/`
- `test-results/`

設定上、失敗時にはscreenshot、trace、videoを残す。成功時は巨大Artifactを保存し続けない。

## 後始末

E2Eは成功・失敗に関わらず、実行後に `cleanupE2EImportFromWebApp` を呼ぶ。

- `rakuten_test` / `nomura_test` 以外はcleanup対象外
- 取込IDがある場合はロールバックする
- 出力スプレッドシートが固定再利用の場合は削除せず、cleanup結果にskip理由を残す
- 固定再利用ではない出力スプレッドシートだけゴミ箱へ移動する

後始末結果はPlaywright attachmentとして残し、本体エラーとは別に読めるようにする。

## セキュリティ

- `pull_request_target` は使わない。
- fork / external PR ではSecretsを渡さない。
- Script ID、Deployment ID、WebアプリURL、OAuth情報、Cookie、トークン、storageStateはコミットしない。
- `CI_E2E_TOKEN` はpayloadでGASへ渡し、URLや画面表示には出さない。
- Playwrightの `test-results/`、`playwright-report/`、`.auth/` は `.gitignore` に入れる。

## 未対応範囲

- 野村CSVアップロード
- 複数DB全ケース
- 全出力タブのセル比較
- 負荷試験
- 全UI / 全エラーケース
