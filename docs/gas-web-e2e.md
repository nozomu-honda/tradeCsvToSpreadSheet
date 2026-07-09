# GAS Web App E2E

最小構成の GAS Web アプリ E2E は、テスト専用 Apps Script プロジェクトへ `clasp push --force` し、GitHub Actions から開ける一時 Web アプリ deployment を作成してから Playwright で 1 ケースだけ確認する。

## 方針

- PR #43 の古い楽天配当金 7 件 E2E は使わず、現在の `develop` に合わせて小さく作り直す。
- 初回対象は楽天日本株 CSV アップロード 1 ケースだけにする。
- 外部スプレッドシート URL は使わず、Playwright のローカル CSV fixture をアップロードする。
- workflow は `workflow_dispatch` または同一リポジトリ PR に `gas-web-e2e` ラベルが付いた時だけ実行する。
- `pull_request_target` は使わない。
- fork / external PR では Google Secrets を使う step へ進ませない。
- 既存 required check の `Push test GAS project and run tests` とは別 workflow とし、通常の GAS CI fallback 方針を変えない。
- workflow 内では、テスト専用 Apps Script プロジェクトへ push する直前の `appsscript.json` にだけ `webapp.access = ANYONE_ANONYMOUS` / `webapp.executeAs = USER_DEPLOYING` を注入する。リポジトリ上の manifest は通常運用向けのままにする。
- 既定の `dynamic-public` モードでは、CI run ごとに一時 Web アプリ deployment を作成し、その `/exec` URL を Playwright にだけ渡す。実 URL はログに出さず、GitHub Actions の mask 対象にする。
- Playwright 実行後は、一時 Web アプリ deployment を削除する。削除に失敗した場合は、公開URLが残る可能性があるため workflow を失敗させる。
- 固定 `/exec` URL を使う `fixed-url` モードを使う場合は、`GAS_TEST_WEBAPP_DEPLOYMENT_ID` が同じテスト Apps Script プロジェクトに属していること、かつその Web アプリ URL が GitHub Actions から対話的な Google ログインなしで開けることを確認する。
- Web アプリ URL が GitHub Actions から HTTP 403 を返す場合、ソース push と deployment 試行までは確認し、Playwright E2E は明示的に skip する。`dynamic-public` モードでも 403 が続く場合は、Google Workspace / OAuth / アカウント側の公開制限を確認する。

## 対象ケース

1. GAS Web アプリを開く。
2. 追加先 DB として UI 上の `nomura_test` を選ぶ。
3. 楽天日本株 CSV fixture をアップロードする。
4. 実行する。
5. 楽天入力として検出され、内部ルーティングで `rakuten_test` に保存されることを確認する。
6. 結果表示で、検出形式、選択 DB キー、実際の追加先 DB キー、実際の追加先 DB 種別、取込 ID、出力リンクを確認する。
7. E2E cleanup helper から対象 `importId` を `rakuten_test` 内で論理ロールバックする。
8. cleanup 結果は Playwright attachment に保存する。

## GitHub Actions から HTTP 403 になる主な原因

PR #60 時点のログでは、`clasp push --force` は成功していたが、`clasp deploy --deploymentId` は `Requested entity was not found` で固定 deployment を更新できていなかった。その後、設定済み Web アプリ URL への probe はすべて HTTP 403 だった。

主な原因候補は次のとおり。

- `GAS_TEST_WEBAPP_DEPLOYMENT_ID` が `GAS_TEST_SCRIPT_ID` のテスト Apps Script プロジェクトに属していない。
- 固定 Web アプリ deployment のアクセス設定が `MYSELF` / `DOMAIN` / `ANYONE` で、GitHub Actions runner がログインなしで開けない。
- Web アプリが `USER_ACCESSING` 実行になっており、GitHub Actions runner で利用者OAuthができない。
- Google Workspace または OAuth consent / 公開制限により、匿名アクセス可能な Web アプリ deployment を作れない。
- `GAS_TEST_WEBAPP_URL` が固定 deployment と一致していない、または古い deployment URL を指している。

公式の Apps Script Web app 設定では、アクセス権は `MYSELF` / `DOMAIN` / `ANYONE` / `ANYONE_ANONYMOUS`、実行主体は `USER_ACCESSING` / `USER_DEPLOYING` を使う。GitHub Actions 上でブラウザE2Eを通すには、テスト専用projectで `ANYONE_ANONYMOUS` + `USER_DEPLOYING` の一時deploymentを使う。

## 必要な GitHub Secrets

- `CLASPRC_JSON`: CI アカウントの clasp 認証 JSON。
- `GAS_TEST_SCRIPT_ID`: テスト専用 Apps Script プロジェクトの Script ID。
- `CI_E2E_TOKEN`: cleanup helper 呼び出し用トークン。

任意:

- `CLASP_USER`: `clasp --user` が必要な場合だけ設定する。
- `CLASP_PROJECT_JSON`: `GAS_TEST_SCRIPT_ID` だけでは足りない `.clasp.json` 設定が必要な場合だけ設定する。
- `GAS_TEST_WEBAPP_DEPLOYMENT_ID`: `fixed-url` モードで更新対象の固定 Web アプリ deployment ID を使う場合だけ設定する。
- `GAS_TEST_WEBAPP_URL`: `fixed-url` モードで固定 Web アプリ URL を使う場合だけ設定する。

`E2E_INPUT_SPREADSHEET_URL` は初回 E2E では使わない。

## Apps Script 側の設定

テスト専用 Apps Script プロジェクトの Script Properties に、GitHub Secret と同じ値の `CI_E2E_TOKEN` を設定する。トークンは URL や DOM に出さず、Playwright から `google.script.run` の payload にだけ含める。

cleanup helper は `nomura_test` / `rakuten_test` だけを対象にし、既存の `rollbackImport_()` を使って `rolledBackAt` を記録する。物理削除はしない。

`dynamic-public` モードの Web アプリ画面自体は、GitHub Actions が開けるよう一時的に匿名アクセス可能になる。そのため、この workflow の対象は必ずテスト専用 Apps Script プロジェクトに限定し、本番 DB / 本番 Drive フォルダ / 本番 Spreadsheet へ権限を持たせない。通常の cleanup / rollback helper は `CI_E2E_TOKEN` 必須で保護する。

## Workflow Summary

workflow summary には次を残す。

- deploy mode
- deployment inventory の件数と、固定 deployment ID がテストprojectに属しているか
- 一時 Web アプリ deployment の作成結果
- Web app probe の結果
- Playwright 実行または skip 理由
- cleanup / rollback 結果
- 一時 Web アプリ deployment の削除結果

## ローカル確認

```bash
npm ci
npx playwright test --list
```

実際の Web アプリ E2E をローカルで実行する場合は、環境変数 `GAS_TEST_WEBAPP_URL` と `CI_E2E_TOKEN` を設定する。実 Script ID、deployment ID、Web アプリ URL、OAuth token、実 Spreadsheet URL はリポジトリへコミットしない。
