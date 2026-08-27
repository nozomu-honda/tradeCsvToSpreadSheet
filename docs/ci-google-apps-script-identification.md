# CI用Googleアカウント / Apps Script 識別・認証復旧Runbook

この文書は、`tradeCsvToSpreadSheet` のCI用Googleアカウント、テスト専用Apps Script、本番Apps Scriptを取り違えずに識別し、CI認証障害から安全に復旧するための手順です。

## 1. 最重要安全ルール

- CI用Googleアカウントと本番用Googleアカウントを分離して扱う。
- CI用Apps Scriptへの反映はGitHub Actionsだけが行う。
- ローカルPCでCI用の`clasp login` / `clasp logout` / `clasp push`を行わない。
- ローカルPCの本番用named user `production` の認証には触れない。
- 本番Apps Script、本番deployment、本番DB、本番DriveをCI確認に使用しない。
- Script ID、Deployment ID、OAuth Client ID、Client Secret、access token、refresh token、認証JSON、Googleアカウントのメールアドレスを公開リポジトリ、Issue、PR、コメント、Actionsログ、artifactへ記載しない。
- Google Cloud / OAuth設定を変更する前に、候補Apps Scriptと現在のCI接続先の同一性を確定する。
- 名前、コード、GCPの種別、テスト入口の存在だけでCI接続先を断定しない。

## 2. CI / 本番の識別

### CI用

- CI専用Googleアカウントで管理する。
- GitHub Secret `GAS_TEST_SCRIPT_ID` と`CLASPRC_JSON`をGitHub Actionsだけが利用する。
- `src/test/**`を含むCI用bundleをテスト専用Apps Scriptへ反映する。
- CI用の反映・GAS Tests・必要なWeb E2EはGitHub Actionsから実行する。

### 本番用

- 本番用Googleアカウントと本番用認証で管理する。
- 本番反映は本番用GitHub Actions経路を原則とする。
- ローカルfallbackを使う場合も、named user `production` と本番専用project設定を使う。
- `src/test/**`やE2E専用helperを本番へ送らない。

GitHub構成上も認証経路を分ける。

- CI: `CLASPRC_JSON` / `GAS_TEST_SCRIPT_ID`
- 本番: `CLASP_PRODUCTION_CREDENTIALS` / `PRODUCTION_SCRIPT_ID`

本番用SecretsはCI認証復旧の対象にしない。

## 3. Script ID同一性gate

CI Apps Scriptの識別は、次の順序で行う。

1. CI専用GoogleアカウントのApps Script一覧から候補を探す。
2. 候補のプロジェクト名、standalone / Spreadsheet-boundなどの種別を確認する。
3. コードを変更せず、`runGasTestBatch01`、`runGasTestBatch09`、`runAllTests()`、CI用テストファイルの存在を補助情報として確認する。
4. Apps Scriptのプロジェクト設定で候補のScript IDを確認する。
5. 認可済み管理者が保持する元データと、現在のCI接続先を安全な隔離環境で直接照合する。
6. 一致した場合だけ候補をCI接続先として確定する。

プロジェクト名、コード、GCP種別、テスト入口は候補探索の補助情報であり、Script ID同一性の証明ではない。GitHub Secretは登録後にUIから値を読み返せないため、Secret値をUIから取得して比較する手順は採用しない。

候補のScript IDと現在のCI接続先を安全に照合できない場合は、接続先不明のまま停止する。別の認証復旧作業でCI本体として確認済みの候補へ`GAS_TEST_SCRIPT_ID`を明示的にrebindし、rebind完了後に接続先を確定する。確認またはrebindが完了するまで、候補に紐づくGCP / OAuth設定を変更しない。

## 4. 2026-08-12時点で確認したCI側候補

CI専用GoogleアカウントのApps Script一覧では、少なくとも次の候補を確認した。

- `tradeCsvToSpreadSheet GAS CI Test`
  - standalone Apps Script。
  - CI用Apps Scriptとして人間が確認した最有力候補。
  - 標準GCPプロジェクトに紐づくことを確認済み。
- `株管理ツールGASCI用`
  - Spreadsheet-bound Apps Script。
  - 補助スクリプトの可能性があり、CI本体とは断定しない。

候補の実Script IDは記載しない。候補名やコード一致だけで、現在の`GAS_TEST_SCRIPT_ID`との同一性を断定しない。

## 5. OAuth / GCP確認

人間がCI用として確認した標準GCPのGoogle Auth Platformには、次の既存Desktop OAuth clientがある。

- `clasp CI login 2026-07`
- `clasp CI login`

新しいOAuth clientは作成していない。OAuth Client ID、Client Secret、GCPプロジェクト番号・IDは記録しない。

Google Apps Script APIやAPI executable deploymentについては、設定画面の確認だけで判断せず、確定済みCI接続先で実際に`clasp push`、deployment利用、GAS Testsが成功したことを運用上の確認結果とする。

## 6. OAuth Audienceの扱い

2026-08-12の確認時点では、CI用Googleアカウントをtest userとして登録した状態で、Audienceは次の状態だった。

- 変更前: External / Testing
- 変更後: External / In production

External / Testingはrefresh token失効と整合する有力な原因候補だが、`invalid_grant`の単一原因とは断定しない。In productionへの変更だけでは、すでに失効したrefresh tokenは復活しない。

Audience変更は人間が画面上で実施した。このPR／CodexはGoogle CloudやOAuth設定を変更していない。

## 7. 認証再発行の方針

CI認証を再発行する場合は、ローカルPCから隔離した環境を使う。今回の復旧ではGoogle Cloud Shellの隔離HOMEを使用し、新しい`.clasprc.json`を生成した。

確認するのはトークンの存在だけとし、値を表示・保存・共有しない。

- `refresh_token`が存在することを確認する。
- `access_token`が存在することを確認する。
- 検証用コピーから`access_token`を削除した状態で、refresh tokenによるアクセストークン再取得が成功することを確認する。
- CI専用Googleアカウントで対象CI Apps Scriptを確認する。

今回の認証再発行では、既存の`clasp CI login 2026-07`を使用した。ローカルPCではCI用clasp loginを行っていない。Cloud Shellでも手動`clasp push`は行わず、ソース反映は最終的にGitHub Actionsだけで行った。

## 8. `CLASPRC_JSON`更新

新しく発行したCI用認証JSONで、GitHub Repository Secret `CLASPRC_JSON`を人間が更新した。Secretの実値は記録しない。

`GAS_TEST_SCRIPT_ID`は今回変更していない。GitHub Secretは登録後にUIから値を読み返せないため、Secret値をUIから取得して候補Script IDと比較する手順は、禁止かつ実行不能な手順として扱う。

現在の運用上の確認は、次の事実を組み合わせて行う。

- CI用Googleアカウントで対象CI Apps Scriptを確認した。
- CI用と本番用のScript IDが異なることを人間がApps Scriptのプロジェクト設定で確認した。
- `GAS_TEST_SCRIPT_ID`を変更せず、確定済みのCI経路でFinal CIの反映とテストが成功した。
- full GAS Tests 113件とselected GAS Tests 27件が成功した。

これはSecret値を直接readback比較したことを意味しない。

## 9. `invalid_grant`発生時の判断

まず認証失敗とテスト失敗を分離する。`clasp push`前後で`invalid_grant`が発生した場合、実GAS Testsが不合格だったとは扱わない。

確認順序:

1. 対象PRのhead/base SHAとreview gateの結果を固定する。
2. source、manifest、runner、mapped test fileの監査結果を確認する。
3. `clasp push`の開始前後で認証エラーが発生していないか確認する。
4. CI用Googleアカウント、候補Apps Script、Script ID同一性gateを確認する。
5. 必要な場合だけ、隔離環境でCI用認証を再発行する。
6. GitHub Secret `CLASPRC_JSON`だけを更新する。本番用Secretsは変更しない。
7. Actions利用が承認・再開された後、固定済みhead/baseでFinal CIを1回実行する。
8. `clasp push`、GAS Tests、必要なWeb E2E、cleanupの結果を確認する。

## 10. 2026年の障害・復旧事例

### 認証障害

PR #114のFinal CI Run `31159793942`では、次の工程まで成功した。

- review gate
- head/base固定
- source / manifest / runnerの113件同期
- mapped test file監査
- full / 113 tests選択

その後、`clasp push`が`invalid_grant`で失敗し、実GAS TestsとWeb E2Eは未実行だった。当時の結果を、テストコードの失敗や全113件の不合格とは扱わない。

### 認証復旧後のfull Final CI

認証更新後、PR #114に対してFinal CI Run `31676808963`を実行した。

- head: `a628f820c862d288ed01f92902cff0f910febdf7`
- base: `c22b77df5c74b3cd17fe4cdeb1aff8267e16c365`
- review gate成功
- source / manifest / runnerの113件同期成功
- mapped test file監査成功
- workflow / CI script変更によりfull mode、113 tests選択
- `clasp push`成功
- API executable deployment成功
- GAS Tests 9 batches成功
- バッチ件数: 13 / 13 / 13 / 13 / 13 / 13 / 13 / 13 / 9
- 合計113件すべて成功
- Web App E2E、Playwright E2E、dynamic deployment cleanup成功
- Final CI全体成功

PR #114はその後`develop`へマージされ、merge commitは`f014a0a2711e9cd52f9621613b95c3799d40eea0`となった。

### selected modeの実動作確認

Issue #111の完了確認として、検証専用PR #120を使用したFinal CI Run `33029507390`でselected modeを確認した。

- classification: `gas-tests-only`
- mode: `selected`
- suites: 3
- tests: 27
- `database-01`: 13件
- `database-02`: 13件
- `database-03`: 1件
- 合計27件すべて成功
- full 113 testsは実行されなかった
- `clasp push`成功
- Web E2E: `not-required`
- Final CI全体成功

検証PR #120はマージせずClose済み、Issue #111もCompletedでClose済みである。更新済み`CLASPRC_JSON`がfull modeだけでなくselected modeでも継続して動作したことを示す。

## 11. 現在の確認状況

### 確認済み

- CI用Googleアカウント上の対象Apps Script候補を確認した。
- CI用と本番用のScript IDが異なることを人間が確認した。
- 既存OAuth client `clasp CI login 2026-07`を使用して隔離環境で認証を再発行した。
- `CLASPRC_JSON`を人間が更新した。
- 現行CI経路でfull 113 testsのFinal CI成功を確認した。
- 現行CI経路でselected 27 testsのFinal CI成功を確認した。
- `clasp push`、API executable deployment、GAS Tests、Web E2E、cleanupが運用上成功した。

### 確認不能として残す事項

- 2026-08-12のAudience変更前に、候補Script IDとCI接続先の同一性gateを満たしていたかどうか。

この歴史的事実は証跡がないため、満たしていたとも満たしていなかったとも推測で断定しない。現在の正式手順では、Script IDの直接照合または確認済み候補への明示的rebindを先に行う。

## 12. GitHub側の正本

- `GAS_TEST_SCRIPT_ID`: テスト専用Apps ScriptのScript ID
- `CLASPRC_JSON`: CI用clasp認証
- `GAS_TEST_DEPLOYMENT_ID`: 既存API executable deploymentを使う場合のDeployment ID
- `CLASP_USER`: named userを使う場合だけ設定

実値はGitHub Secretsだけに保持し、ドキュメント、Issue、PR、Actionsログ、artifactへコピーしない。

## 13. 復旧時の禁止事項

- ローカルPCでCI用`clasp login` / `clasp logout` / `clasp push`を行わない。
- ローカルの本番用`production`認証を上書き・削除しない。
- 本番Apps ScriptへCI用コードをpushしない。
- GitHub Secret値をログやIssueへ表示しない。
- Secret値をGitHub UIから読み返して比較しようとしない。
- Script ID同一性未確認の候補へ推測でGCP / OAuth設定変更を行わない。
- 新しいGCPプロジェクトやOAuth clientを推測で作成しない。
- 本番用Secrets、Variables、EnvironmentsをCI認証復旧のために変更しない。
- Actionsの成功を作るためだけに空runや不要なrerunを行わない。

## 14. 今後の確認記録

新しい事実を追記する場合も、次の原則を守る。

- 実ID、URL、token、Secret、メールアドレスを記録しない。
- 候補の補助情報と、Script ID同一性の確定結果を混同しない。
- Actionsのhead/base SHA、run結果、selected / fullの件数は、秘密情報を含まない範囲で記録する。
- 認証再発行、Secret更新、Final CI実行、本番操作は別々の作業として記録する。
