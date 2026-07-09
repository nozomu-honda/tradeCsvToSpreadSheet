# GAS Web App E2E

最小構成の GAS Web アプリ E2E は、テスト専用 Apps Script プロジェクトへ `clasp push --force` し、固定の Web アプリ deployment を更新してから Playwright で 1 ケースだけ確認する。

## 方針

- PR #43 の古い楽天配当金 7 件 E2E は使わず、現在の `develop` に合わせて小さく作り直す。
- 初回対象は楽天日本株 CSV アップロード 1 ケースだけにする。
- 外部スプレッドシート URL は使わず、Playwright のローカル CSV fixture をアップロードする。
- workflow は `workflow_dispatch` または同一リポジトリ PR に `gas-web-e2e` ラベルが付いた時だけ実行する。
- `pull_request_target` は使わない。
- fork / external PR では Google Secrets を使う step へ進ませない。
- 既存 required check の `Push test GAS project and run tests` とは別 workflow とし、通常の GAS CI fallback 方針を変えない。

## 対象ケース

1. GAS Web アプリを開く。
2. 追加先 DB として UI 上の `nomura_test` を選ぶ。
3. 楽天日本株 CSV fixture をアップロードする。
4. 実行する。
5. 楽天入力として検出され、内部ルーティングで `rakuten_test` に保存されることを確認する。
6. 結果表示で、検出形式、選択 DB キー、実際の追加先 DB キー、実際の追加先 DB 種別、取込 ID、出力リンクを確認する。
7. E2E cleanup helper から対象 `importId` を `rakuten_test` 内で論理ロールバックする。
8. cleanup 結果は Playwright attachment に保存する。

## 必要な GitHub Secrets

- `CLASPRC_JSON`: CI アカウントの clasp 認証 JSON。
- `GAS_TEST_SCRIPT_ID`: テスト専用 Apps Script プロジェクトの Script ID。
- `GAS_TEST_WEBAPP_DEPLOYMENT_ID`: 更新対象の固定 Web アプリ deployment ID。
- `GAS_TEST_WEBAPP_URL`: テスト専用 Web アプリ URL。
- `CI_E2E_TOKEN`: cleanup helper 呼び出し用トークン。

任意:

- `CLASP_USER`: `clasp --user` が必要な場合だけ設定する。
- `CLASP_PROJECT_JSON`: `GAS_TEST_SCRIPT_ID` だけでは足りない `.clasp.json` 設定が必要な場合だけ設定する。

`E2E_INPUT_SPREADSHEET_URL` は初回 E2E では使わない。

## Apps Script 側の設定

テスト専用 Apps Script プロジェクトの Script Properties に、GitHub Secret と同じ値の `CI_E2E_TOKEN` を設定する。トークンは URL や DOM に出さず、Playwright から `google.script.run` の payload にだけ含める。

cleanup helper は `nomura_test` / `rakuten_test` だけを対象にし、既存の `rollbackImport_()` を使って `rolledBackAt` を記録する。物理削除はしない。

## ローカル確認

```bash
npm ci
npx playwright test --list
```

実際の Web アプリ E2E をローカルで実行する場合は、環境変数 `GAS_TEST_WEBAPP_URL` と `CI_E2E_TOKEN` を設定する。実 Script ID、deployment ID、Web アプリ URL、OAuth token、実 Spreadsheet URL はリポジトリへコミットしない。
