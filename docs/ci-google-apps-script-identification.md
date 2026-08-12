# CI用Googleアカウント / Apps Script 識別ガイド

このドキュメントは、`tradeCsvToSpreadSheet` のCI用Googleアカウント、テスト専用Apps Script、本番Apps Scriptを取り違えないための識別手順と、認証障害時の安全な対応方針をまとめます。

## 最重要ルール

- CI用Googleアカウントと本番用Googleアカウントは分離して扱う。
- CI用Apps Scriptへの反映はGitHub Actionsだけが行う。
- CI調査や認証復旧のために、ローカルPCでCI用の`clasp login` / `clasp push` / `clasp logout`を行わない。
- ローカルPC上の本番用named user `production` の認証には触れない。
- Script ID、Deployment ID、OAuth token、`.clasprc.json`、GitHub Secrets実値、Googleアカウントのメールアドレスは、公開リポジトリ、Issue、PR、コメント、Actionsログへ記載しない。
- Google Cloud / OAuth設定を変更する前に、対象がCI用Apps Scriptに紐づくプロジェクトであることをApps Script側から確認する。名前が似ている別プロジェクトを推測で変更しない。

## 2026-08-12時点で確認できているCI側のApps Script候補

CI専用GoogleアカウントのApps Scriptダッシュボードでは、少なくとも次の2件が確認できています。

- `tradeCsvToSpreadSheet GAS CI Test`
  - 独立したApps Scriptプロジェクトとして表示される。
  - `GAS_TEST_SCRIPT_ID` が指すテスト専用Apps Scriptの最有力候補。
  - Apps Scriptの「プロジェクトの設定」で、**標準GCPプロジェクト**に紐づいていることを確認済み。
  - プロジェクト番号の実値は公開ドキュメントへ記載しない。
  - ただし、プロジェクト名とGCP種別だけを根拠に `GAS_TEST_SCRIPT_ID` との一致までは断定しない。後述の確認手順でCIテスト入口とGitHub側設定の整合を確認して正本とする。
- `株管理ツールGASCI用`
  - Spreadsheetに紐づくApps Scriptとして表示される。
  - 役割は未確定。テスト用Spreadsheet側の補助スクリプトである可能性があるため、CI本体と決めつけない。

Apps Scriptプロジェクト名は人が識別するための補助情報です。CIの接続先の機械的な正本はGitHub Secret `GAS_TEST_SCRIPT_ID`です。実値はドキュメントへ記載しません。

## CI用テストApps Scriptの確認手順

1. 本番用Googleアカウントではなく、CI専用Googleアカウントへ切り替える。
2. `https://script.google.com/` の「マイ プロジェクト」を開く。
3. `tradeCsvToSpreadSheet GAS CI Test` を候補として開く。
4. コードを編集せず、次の公開テスト入口が存在するか確認する。
   - `runGasTestBatch01`
   - `runGasTestBatch09`
5. 必要に応じて `runAllTests()` とCI用テストファイルが存在することも確認する。
6. Apps Scriptの「プロジェクトの設定」で、Google Cloud Platform（GCP）プロジェクトの状態を確認する。
7. 2026-08-12時点では `tradeCsvToSpreadSheet GAS CI Test` が標準GCPプロジェクトを使用していることを確認済み。
8. OAuth / GCP設定を変更する場合は、このApps Scriptから確認したGCPプロジェクトだけを対象にする。

2026-08-12時点の正規GASテスト数は113件で、Final CIはfull fallback時に9入口から全113件を実行する設計です。

## `clasp run` / Apps Script APIとの関係

Apps Script APIの `scripts.run` を使うには、Apps Scriptと呼び出し側OAuthクライアントが同じ**標準GCPプロジェクト**を共有する必要があります。

`tradeCsvToSpreadSheet GAS CI Test` が標準GCPプロジェクトへ紐づいていることは確認できたため、標準GCPという前提条件は満たしています。ただし、次は別途確認が必要です。

- OAuthクライアントが同じ標準GCPプロジェクト内にあること
- Google Apps Script APIがそのGCPプロジェクトで有効であること
- API executable deploymentが現在も有効であること
- `CLASPRC_JSON` がそのCI用OAuth構成に対応していること

これらを確認する前に、新しいGCPプロジェクトやOAuthクライアントを推測で作成しません。

## 本番Apps Scriptとの見分け方

本番側のApps ScriptとCI側のApps Scriptは、名前やコードが似ていても同じものとして扱いません。

- 本番Apps Script
  - 本番用Googleアカウント / 本番用認証で管理する。
  - 本番反映はGitHub ActionsのProduction deploy経路を原則とする。
  - ローカルfallbackではnamed user `production` と本番専用project設定を使う。
  - `src/test/**` やE2E専用helperを本番へ送らない。
- CI用Apps Script
  - CI専用Googleアカウントで管理する。
  - GitHub Secret `GAS_TEST_SCRIPT_ID` / `CLASPRC_JSON` からGitHub Actionsだけが利用する。
  - `src/test/**` を含むCI用bundleをテスト専用Apps Scriptへpushする。
  - 人やCodexがローカルPCからpushしない。

## CI認証障害時の対応

### 典型例: `invalid_grant`

2026-08-11、PR #114のFinal CIで次の状態を確認しました。

- Final CI review gate: 成功
- head / base固定確認: 成功
- GAS test source / manifest / runner同期: 113件で成功
- mapped test file area監査: 成功
- GAS Tests選択: full / 113件
- `clasp push`: `invalid_grant` で失敗
- 実GAS Tests: 未実行
- Web E2E: 未実行

この場合、テストコードの失敗と認証失敗を混同しません。`clasp push`前後の認証で止まっているため、PRの実GASテスト不合格とは扱いません。

### 復旧時の禁止事項

- ローカルPCでCI用`clasp login`を行わない。
- ローカルの本番用`production`認証を上書き・削除しない。
- 本番Apps ScriptへCI用コードをpushしない。
- CI Apps Scriptを確認する前に、新しいGCPプロジェクトやOAuthクライアントを推測で作らない。
- 別プロジェクトのGoogle Auth Platform設定を変更しない。

### 復旧方針

1. CI専用Googleアカウント上でテスト専用Apps Scriptを特定する。
2. Apps Script側の「プロジェクトの設定」から、紐づくGCPプロジェクトの状態を確認する。
3. 認証再発行が必要な場合は、ローカルPCから隔離した環境を使う。
4. 更新対象はCI用GitHub Secret `CLASPRC_JSON` に限定する。
5. Secret更新後、PRのhead/baseを再確認してFinal CIを再実行する。
6. `clasp push`、実GAS Tests、必要なWeb E2Eが成功したことを確認してからマージ判断する。

具体的な認証再発行コマンドは、GCP / OAuth構成を確認してから決めます。未確認の構成を前提に固定手順を書かないでください。

## GitHub側の正本

CIで使う主な設定は次のとおりです。

- `GAS_TEST_SCRIPT_ID`: テスト専用Apps ScriptのScript ID
- `CLASPRC_JSON`: CI用clasp認証
- `GAS_TEST_DEPLOYMENT_ID`: 既存API executable deploymentを使う場合のDeployment ID
- `CLASP_USER`: named userを使う場合だけ設定

実値はGitHub Secretsだけに保持し、ドキュメントへコピーしません。

## 確認が済んだら更新する項目

`tradeCsvToSpreadSheet GAS CI Test` の設定確認後、必要に応じてこの文書へ次を追記します。

- `GAS_TEST_SCRIPT_ID` との一致確認結果
- OAuthクライアントが同じ標準GCPプロジェクトにあるか
- Google Apps Script APIの有効状態
- API executable deploymentの状態
- 認証再発行の正式手順

実IDや認証情報は、確認後も記載しません。
