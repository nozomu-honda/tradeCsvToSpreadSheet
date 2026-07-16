# GAS Web App E2E

最小構成の GAS Web アプリ E2E は、CI runnerの一時project設定を `clasp --project` で明示してテスト専用 Apps Script プロジェクトへpushし、GitHub Actions から開ける一時 Web アプリ deployment を作成してから Playwright で野村・楽天CSVアップロードの代表ケースを確認する。

> 2026-07-16現在、GitHub Actionsは全面停止中です。停止中はWeb E2E workflow、rerun、最終CIラベル、テストApps Scriptへの手動pushを実行しません。

## 方針

- PR #43 の古い楽天配当金 7 件 E2E は使わず、現在の `develop` に合わせて小さく作り直す。
- 初回対象は楽天日本株 CSV アップロード 1 ケースだけにした。現在は野村共通CSVの日本株1ケースに加え、楽天日本株、楽天米国株、楽天投資信託、楽天入出金履歴、楽天配当金・分配金・元本払戻金の代表ケースを確認する。
- 外部スプレッドシート URL は使わず、Playwright のローカル CSV fixture をアップロードする。
- PRの最終確認では、現在head SHAとdevelop base SHAのレビュー完了コメント後に `run-final-ci` ラベルで起動する。変更分類が `gas-tests-and-web-e2e` の場合だけ、GAS Tests成功後のjobとして実行する。
- `.github/workflows/gas-web-e2e.yml` は `workflow_dispatch` の手動fallbackとして残す。
- `pull_request_target` は使わない。
- fork / external PR では Google Secrets を使う step へ進ませない。
- 軽量ゲートはPR単位のconcurrencyで独立して判定する。GAS Tests と GAS Web App E2E は同じテスト専用 Apps Script プロジェクトと Script Properties を共有するため、重い実処理だけを共通の `gas-shared-test-project` concurrency groupへ入れ、GAS Tests -> Web E2E -> cleanupの順に直列実行する。`cancel-in-progress: false` により実行中cleanupを自動キャンセルしない。backend GAS-onlyではWeb E2E jobを起動しない。
- 同じhead/base SHAの組で `Deploy test Web app and run Playwright E2E` の成功Check Runが存在する場合、Final CIは既存checkを再利用し、Web E2E job、一時deployment作成、Playwright、cleanupをすべて省略する。Web E2Eを実行した場合は最終結果を対象head SHAへ同名Check Runとして明示発行し、Check Run出力にbase SHAも記録する。
- Web E2E対象はUI、Web runtime／設定、認証、manifest、テスト用／本番用Web App deployment、`tests/e2e/**`、Playwright、E2E用workflow／scriptです。deployment更新ロジックはWeb公開境界を変えるため対象に含めます。未知の変更パスは安全側でWeb E2E対象とし、docs-onlyや既知のbackend GAS-onlyでは起動しません。
- WebアプリURLがHTTP 403でPlaywright未実行になった場合は未検証として扱い、成功Check Runを発行しない。次回の同一head/base再実行でも再利用対象にしない。
- CI用のclasp project設定は `${RUNNER_TEMP}` 配下へ生成し、すべてのclasp呼び出しで `--project <CI専用設定ファイル>` と `--ignore <repo .claspignore>` を明示する。リポジトリ直下の `.clasp.json` は生成・利用しない。設定ファイルは一時領域に置くが、`rootDir` は `GITHUB_WORKSPACE` の絶対パスへ正規化し、push対象は常にリポジトリルート配下にする。`.claspignore` もリポジトリ直下のファイルを使い、CI用NodeスクリプトやdocsをGAS push対象にしない。
- E2E CIでは従来どおり `.claspignore` を使い、テスト専用 Apps Script プロジェクトへテストコードもpushできる。本番反映では `.clasp.productionignore` を使い、`src/test/**` を本番Apps Scriptへpushしない。
- workflow 内では、テスト専用 Apps Script プロジェクトへ push する直前の `appsscript.json` にだけ `webapp.access = ANYONE_ANONYMOUS` / `webapp.executeAs = USER_DEPLOYING` を注入する。リポジトリ上の manifest は通常運用向けのままにする。
- 同じく push 直前の CI ローカル source にだけ、`DB_CONFIG.DB_FOLDER_ID`、`nomura_test` の固定DB Spreadsheet ID、固定 TEST_OUTPUT Spreadsheet ID を空にする。これにより、動的公開E2Eは clasp 実行ユーザーがアクセスできない既存Driveフォルダや固定Spreadsheetへ向かわず、テスト専用projectの実行ユーザーDrive rootに test DB / test output を作成または再利用する。リポジトリ上の `db_config.gs` は変更しない。`nomura_corp_a` / `nomura_corp_b` の固定IDは本番法人DB向け設定として維持し、CIローカル変換では空にしない。
- 既定の `dynamic-public` モードでは、CI run ごとに一時 Web アプリ deployment を作成し、その `/exec` URL を Playwright にだけ渡す。実 URL はログに出さず、GitHub Actions の mask 対象にする。
- `CI_E2E_TOKEN` Script Property が設定されているテストprojectでは、Web アプリの server function は token 付き payload を必須にする。Script Property が未設定の初回は、token 保護された `prepareE2EWebAppRun` が GitHub Secret 由来の payload から初期化する。Playwright は token を URL や DOM には出さず、`google.script.run` の payload にだけ含める。
- E2E 開始時に token 保護された `prepareE2EWebAppRun` を呼び、ケースごとに指定した `nomura_test` / `rakuten_test` などの test DB だけ root storage mode を有効化する。Playwright helper は、準備対象DB、UIで選ぶDB、期待する実追加先DB、期待するDB種別、出力Spreadsheet検査DB、cleanup/rollback DBをケースごとに明示して検証する。
- `prepareE2EWebAppRun` は、各ケース開始前にE2E専用出力Spreadsheetを既知の初期状態へ戻す。初期化では `株管理ツール_E2E_TEST_OUTPUT` という固定名のE2E出力Spreadsheetだけを対象にし、`元データ`、野村/楽天の既知出力シート、金銭残高シートなどE2Eが生成する業務出力シートを削除する。任意Spreadsheet IDは受け取らず、token保護とtest DB限定を維持し、未知の制御用シートとSpreadsheet自体は壊さない。
- 出力リンクが作成された後は、token 保護された `inspectE2EOutputSpreadsheetFromWebApp` で出力 Spreadsheet の主要シート名と主要セル値を確認する。全セル完全一致ではなく、CSV fixture の一意な銘柄コード、銘柄名、ティッカー、ファンド名、入出金摘要が期待シートに出ていることを最小限確認する。
- PR #63 時点では、検査helperがデフォルト25行 / 40列、最大100行 / 80列の `getDisplayValues()` 結果をクライアントへ返し、Playwright側で列検索していた。この方式は、test DBに有効レコードが残る、fixture明細が増える、出力列が増える、といった場合に正しい出力でも期待値が取得範囲外になり得る。
- 現在は条件検索方式とし、Playwrightは `requiredSheets` / `absentSheets` / `checks` / `rowChecks` だけをpayloadに渡す。GAS側は許可済みシートの1行目から `headerName` を完全一致で探し、`checks` では見つけた列の実最終行まで `expectedValue` を完全一致検索する。`rowChecks` ではアンカー列・値で候補行を探し、その同じ行にある複数列を完全一致で検査する。クライアントへは存在判定、検出可否、列番号、行番号など最小限の結果だけを返し、セル全体の二次元配列は返さない。
- `checks` は後方互換用の単独列検索であり、複数列が同じ明細行にあることまでは保証しない。行の整合性が必要な検査、特に元本払戻金のように買付行と払戻行が同じファンド名で並ぶケースでは `rowChecks` を使う。
- Playwright 実行後は、一時 Web アプリ deployment を削除する。削除に失敗した場合は、公開URLが残る可能性があるため workflow を失敗させ、Web E2EのCheck Runもfailureにする。
- 固定 `/exec` URL を使う `fixed-url` モードを使う場合は、`GAS_TEST_WEBAPP_DEPLOYMENT_ID` が同じテスト Apps Script プロジェクトに属していること、かつその Web アプリ URL が GitHub Actions から対話的な Google ログインなしで開けることを確認する。
- Web アプリ URL が GitHub Actions から HTTP 403 を返す場合、ソース push と deployment 試行までは確認し、Playwright E2E は明示的に skip する。このskipは成功扱いにせず、Final CIでは再利用対象外のfailureとして扱う。`dynamic-public` モードでも 403 が続く場合は、Google Workspace / OAuth / アカウント側の公開制限を確認する。

## 対象ケース

各ケースは次の共通フローで確認する。

1. GAS Web アプリを開く。
2. 追加先 DB としてケースごとに指定した UI 表示DBを選ぶ。現在は野村・楽天どちらも UI 上では `nomura_test` を選ぶ。
3. CSV fixture をアップロードする。
4. 実行する。
5. 入力形式として検出され、ケースごとの期待どおりに内部ルーティングされることを確認する。野村共通CSVは `nomura_test`、楽天CSVは `rakuten_test` に保存される。
6. 結果表示で、検出形式、選択 DB キー、実際の追加先 DB キー、実際の追加先 DB 種別、取込 ID、読込件数、追加件数、出力リンクを確認する。
7. 出力件数表示から対象シート系統の件数が増えていることを確認する。
8. 出力リンクの Spreadsheet ID を使い、E2E helper 経由で主要シート名と主要セル値を条件検索する。
9. E2E cleanup helper から対象 `importId` をケースごとの cleanup 対象 test DB 内で論理ロールバックする。
10. cleanup 結果は Playwright attachment と workflow summary に保存する。

現在の代表ケースは次の8つ。

- 野村共通 日本株 CSV: `nomura_common` として検出し、UI選択DBと実追加先DBがどちらも `nomura_test`、DB種別が野村DBであることを確認する。読込件数1、追加件数1、スキップ件数0、出力 Spreadsheet に共通 `日本株` があり `楽天日本株` がないこと、fixture の銘柄コード・銘柄名が `日本株` に出ていること、`nomura_test` 内で rollback できることを確認する。
- 楽天日本株 CSV: `rakuten_jp_stock` として検出し、日本株出力件数が1件以上であること、出力 Spreadsheet に `楽天日本株` があり共通 `日本株` が残っていないこと、fixture の銘柄コード・銘柄名が `楽天日本株` に出ていることを確認する。
- 楽天米国株 CSV: `rakuten_us_stock` として検出し、米国株と金銭残高（ドル）の出力件数が1件以上であること、出力 Spreadsheet に `楽天米国株` / `金銭残高（ドル）` があり共通 `米国株` が残っていないこと、fixture のティッカー・銘柄名が出ていることを確認する。
- 楽天投資信託 CSV: `rakuten_fund` として検出し、投信と金銭残高（円）の出力件数が1件以上であること、出力 Spreadsheet に `楽天投資信託` / `金銭残高（円）` があり共通 `投信` が残っていないこと、fixture のファンド名が出ていることを確認する。
- 楽天入出金履歴 CSV: `rakuten_cash` として検出し、金銭残高（円）の出力件数が2件以上であること、出力 Spreadsheet に `金銭残高（円）` があり、fixture の入金・出金摘要が出ていることを確認する。
- 楽天米国株配当 CSV: `rakuten_dividend` として検出し、米国株と金銭残高（ドル）の出力件数が1件以上であること、`楽天米国株` で税金、受渡金額USドル/円、為替レート、現地源泉税、国内源泉所得税を条件検索で確認する。
- 楽天投信分配金 CSV: `rakuten_dividend` として検出し、投信と金銭残高（ドル）の出力件数が1件以上であること、`楽天投資信託` で分配金、受付金額、受渡金額を確認し、`金銭残高（ドル）` に分配金受取・税額が反映されることを確認する。
- 楽天元本払戻金 CSV: 先に同一ファンドの楽天投信買付 CSV を取り込み、その後 `rakuten_dividend` の元本払戻金行を取り込む。`楽天投資信託` では `rowChecks` でファンド名をアンカーにし、同じ払戻行の `元金払戻金`、受付金額、受渡金額、空欄の平均取得単価、空欄の簿価、銘柄ごとの残高を確認する。`入金（分配金）` は簿価・平均取得単価を更新せず、銘柄ごとの残高を維持する。`金銭残高（円）` への反映と2件分の rollback も確認する。

## GitHub Actions から HTTP 403 になる主な原因

PR #60 時点のログでは、`clasp push --force` は成功していたが、`clasp deploy --deploymentId` は `Requested entity was not found` で固定 deployment を更新できていなかった。その後、設定済み Web アプリ URL への probe はすべて HTTP 403 だった。

主な原因候補は次のとおり。

- `GAS_TEST_WEBAPP_DEPLOYMENT_ID` が `GAS_TEST_SCRIPT_ID` のテスト Apps Script プロジェクトに属していない。
- 固定 Web アプリ deployment のアクセス設定が `MYSELF` / `DOMAIN` / `ANYONE` で、GitHub Actions runner がログインなしで開けない。
- Web アプリが `USER_ACCESSING` 実行になっており、GitHub Actions runner で利用者OAuthができない。
- `USER_DEPLOYING` 実行に切り替えたものの、clasp 実行ユーザーが `DB_CONFIG.DB_FOLDER_ID` の Drive フォルダを開けない。
- Google Workspace または OAuth consent / 公開制限により、匿名アクセス可能な Web アプリ deployment を作れない。
- `GAS_TEST_WEBAPP_URL` が固定 deployment と一致していない、または古い deployment URL を指している。

公式の Apps Script Web app 設定では、アクセス権は `MYSELF` / `DOMAIN` / `ANYONE` / `ANYONE_ANONYMOUS`、実行主体は `USER_ACCESSING` / `USER_DEPLOYING` を使う。GitHub Actions 上でブラウザE2Eを通すには、テスト専用projectで `ANYONE_ANONYMOUS` + `USER_DEPLOYING` の一時deploymentを使う。

## 必要な GitHub Secrets

- `CLASPRC_JSON`: CI アカウントの clasp 認証 JSON。
- `GAS_TEST_SCRIPT_ID`: テスト専用 Apps Script プロジェクトの Script ID。
- `CI_E2E_TOKEN`: cleanup helper 呼び出し用トークン。

任意:

- `CLASP_USER`: `clasp --user` が必要な場合だけ設定する。
- `CLASP_PROJECT_JSON`: `GAS_TEST_SCRIPT_ID` だけでは足りないclasp project設定が必要な場合だけ設定する。CI runnerの一時ファイルへ書き込み、リポジトリ直下には作成しない。Secret内の `scriptId`、`rootDir`、`srcDir` はそのまま使わず、CI側で `GAS_TEST_SCRIPT_ID` とリポジトリルート基準へ正規化する。
- `GAS_TEST_WEBAPP_DEPLOYMENT_ID`: `fixed-url` モードで更新対象の固定 Web アプリ deployment ID を使う場合だけ設定する。
- `GAS_TEST_WEBAPP_URL`: `fixed-url` モードで固定 Web アプリ URL を使う場合だけ設定する。

`E2E_INPUT_SPREADSHEET_URL` は初回 E2E では使わない。

`CI_E2E_TOKEN` をローテーションした場合、テスト Apps Script project 側に保存済みの `CI_E2E_TOKEN` Script Property も更新または削除してから再実行する。

## Apps Script 側の設定

テスト専用 Apps Script プロジェクトの Script Properties に、GitHub Secret と同じ値の `CI_E2E_TOKEN` を設定する。トークンは URL や DOM に出さず、Playwright から `google.script.run` の payload にだけ含める。

cleanup helper は `nomura_test` / `rakuten_test` だけを対象にし、既存の `rollbackImport_()` を使って `rolledBackAt` を記録する。取込レコードの物理削除はしない。

出力 Spreadsheet 検査 helper は `CI_E2E_TOKEN` を必須にし、test DB target だけを許可する。読み取り対象は E2E root storage mode の出力名 `株管理ツール_E2E_TEST_OUTPUT` に限定し、シート名もWeb E2Eで必要な出力シートだけを allowlist 化する。本番 Spreadsheet や任意シートを読む用途には使わない。

検査payloadは次の制限を持つ。

- `requiredSheets` / `absentSheets` は配列のみ、各10件まで。
- `checks` は配列のみ、20件まで。
- `rowChecks` は配列のみ、10件まで。各 `rowChecks[].checks` は1件以上10件まで。
- `sheetName` / `headerName` / `expectedValue` は文字列のみで、長さ上限を持つ。
- 任意のA1範囲、数式、取得行数、取得列数はpayloadから受け取らない。
- helperはシート全体のセル値やattachment用のraw配列を返さない。

`dynamic-public` モードの Web アプリ画面自体は、GitHub Actions が開けるよう一時的に匿名アクセス可能になる。そのため、この workflow の対象は必ずテスト専用 Apps Script プロジェクトに限定し、本番 DB / 本番 Drive フォルダ / 本番 Spreadsheet へ権限を持たせない。`CI_E2E_TOKEN` Script Property がある場合は、通常の upload / staging / reset / rollback / DB参照 server function も token 付き payload を必須にする。

## Workflow Summary

workflow summary には次を残す。

- deploy mode
- deployment inventory の件数と、固定 deployment ID がテストprojectに属しているか
- 一時 Web アプリ deployment の作成結果
- Web app probe の結果
- Playwright 実行または skip 理由
- 出力 Spreadsheet の主要シート名・主要セル値の条件検索結果
- cleanup / rollback 結果
- CI ローカルの test storage 設定
  - `DB_CONFIG.DB_FOLDER_ID`、`nomura_test` の固定DB ID、固定 TEST_OUTPUT IDを空にしたこと
  - `nomura_corp_a` / `nomura_corp_b` の固定IDを維持したこと
- 一時 Web アプリ deployment の削除結果
- head SHA上へ発行したWeb E2E Check Runのstatus / conclusion

## ローカル確認

```bash
npm ci
npx playwright test --list
```

実際の Web アプリ E2E をローカルで実行する場合は、環境変数 `GAS_TEST_WEBAPP_URL` と `CI_E2E_TOKEN` を設定する。実 Script ID、deployment ID、Web アプリ URL、OAuth token、実 Spreadsheet URL はリポジトリへコミットしない。
