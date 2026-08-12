# CI用Googleアカウント / Apps Script 識別ガイド

このドキュメントは、`tradeCsvToSpreadSheet` のCI用Googleアカウント、テスト専用Apps Script、本番Apps Scriptを取り違えないための識別手順と、認証障害時の安全な対応方針をまとめます。

## 最重要ルール

- CI用Googleアカウントと本番用Googleアカウントは分離して扱う。
- CI用Apps Scriptへの反映はGitHub Actionsだけが行う。
- CI調査や認証復旧のために、ローカルPCでCI用の`clasp login` / `clasp push` / `clasp logout`を行わない。
- ローカルPC上の本番用named user `production` の認証には触れない。
- Script ID、Deployment ID、OAuth token、`.clasprc.json`、GitHub Secrets実値、Googleアカウントのメールアドレスは、公開リポジトリ、Issue、PR、コメント、Actionsログへ記載しない。
- Google Cloud / OAuth設定を変更する前に、候補Apps ScriptのScript IDと現在のCI接続先の同一性を確定する。名前、コード、GCP種別が一致しても、同一性未確認の候補を推測で変更しない。

## 2026-08-12時点で確認できているCI側のApps Script候補

CI専用GoogleアカウントのApps Scriptダッシュボードでは、少なくとも次の2件が確認できています。

- `tradeCsvToSpreadSheet GAS CI Test`
  - 独立したApps Scriptプロジェクトとして表示される。
  - `GAS_TEST_SCRIPT_ID` が指すテスト専用Apps Scriptの最有力候補。
  - Apps Scriptの「プロジェクトの設定」で、**標準GCPプロジェクト**に紐づいていることを確認済み。
  - プロジェクト番号の実値は公開ドキュメントへ記載しない。
  - ただし、プロジェクト名、GCP種別、CIテスト入口の存在だけでは、現在の `GAS_TEST_SCRIPT_ID` との同一性は未確認である。後述のScript ID確認または明示的rebindが完了するまで「CI本体」と断定しない。
- `株管理ツールGASCI用`
  - Spreadsheetに紐づくApps Scriptとして表示される。
  - 役割は未確定。テスト用Spreadsheet側の補助スクリプトである可能性があるため、CI本体と決めつけない。

Apps Scriptプロジェクト名は人が識別するための補助情報です。CIの接続先の機械的な正本はGitHub Secret `GAS_TEST_SCRIPT_ID`です。実値はドキュメントへ記載しません。

## 識別情報の強さ

### 1. 候補を探すための情報

次の情報は候補を絞り込むために使います。

- CI専用Googleアカウント内に存在すること
- Apps Scriptのプロジェクト名
- standalone / Spreadsheet-boundなどのプロジェクト種別

これらは同名・類似名の古いプロジェクトにも当てはまり得るため、CI接続先の確定条件にはしません。

### 2. 補助的なコード一致

候補を開き、次の入口やCIテストコードが存在するかを読み取り専用で確認します。

- `runGasTestBatch01`
- `runGasTestBatch09`
- `runAllTests()`
- CI用テストファイル

コード一致は、その候補が「CI用途らしい」ことを確認する補助情報です。同じCIコードを過去にpushした古いApps Scriptにも残り得るため、現在の `GAS_TEST_SCRIPT_ID` と同一である証明にはなりません。`runGasTestBatch01`などが存在するだけでCI本体と確定してはいけません。

### 3. CI接続先の確定

候補Apps ScriptのScript IDと、現在のCI接続先として管理しているScript IDが同一であることを安全に確認できた場合だけ、その候補をCI本体として確定します。同一性確認または後述の明示的rebindが完了するまでは、接続先不明として扱います。

## CI用テストApps Scriptの同一性確認手順

1. 本番用Googleアカウントではなく、CI専用Googleアカウントへ切り替える。
2. `https://script.google.com/` の「マイ プロジェクト」を開く。
3. `tradeCsvToSpreadSheet GAS CI Test` を候補として開く。
4. コードを編集せず、候補探索の補助として次の公開テスト入口が存在するか確認する。
   - `runGasTestBatch01`
   - `runGasTestBatch09`
5. 必要に応じて `runAllTests()` とCI用テストファイルが存在することも確認する。ただし、この時点ではCI本体と確定しない。
6. Apps Scriptの「プロジェクトの設定」で候補のScript IDを確認する。実値をPR、Issue、コメント、Actionsログ、artifactへ貼らない。
7. GitHub Secret設定時の元データを保持している認可済み管理者が、ローカルPCとは分離された安全な環境で、候補のScript IDと元データを直接照合する。
8. 一致した場合だけ、その候補を現在のCI接続先として確定する。
9. 元のSecret値を安全に確認できない場合は、候補名やコード一致から「現在のSecretがこの候補を指している」と推測で断定しない。接続先不明のまま停止する。
10. 接続先不明の場合は、このPRとは別の認証復旧作業で、CI本体として確認済みの候補へ `GAS_TEST_SCRIPT_ID` を明示的に再bindする。rebindが完了した時点で、以後のCI接続先をその候補として確定する。
11. 一致確認または明示的rebindが完了するまでは、候補に紐づくGCP / OAuth設定を変更しない。
12. 確定後、必要な認証復旧を別作業で行い、Actionsの利用が承認・再開された後に固定済みhead/baseのFinal CIを実行する。実際に確定済み接続先で`clasp push`とGAS Testsが動くことを最終確認する。

GitHub Secretは登録後に値をGitHub UIから読み返せません。そのため「GitHub Secretと見比べる」だけでは実行可能な手順になりません。元データを保持する認可済み管理者による直接照合ができない場合は、Secret値をログへ表示して回収せず、確認済み候補への明示的rebindを選びます。このPRではSecret変更、認証再発行、rebind、Final CI実行を行いません。

### fingerprint方式について

SHA-256 fingerprintなどで比較する場合も、候補と現在のCI接続先の両方の実値を安全に扱える隔離された経路がすでに用意されている場合だけ正式手順にできます。現在、その診断経路は実装していません。raw Script IDを`workflow_dispatch`の通常input、Actionsログ、PR、Issue、コメント、artifactへ渡してはいけません。未実装のfingerprint方式を、今すぐ使える復旧手順として扱いません。

## GCP / OAuth確認のgate

Apps Scriptの「プロジェクトの設定」で、候補に紐づくGCPプロジェクトIDや標準 / デフォルトの種別を閲覧し、状態を確認することはできます。2026-08-12時点では、最有力候補 `tradeCsvToSpreadSheet GAS CI Test` が標準GCPプロジェクトを使用していることを読み取り専用で確認済みです。

ただし、「GCPプロジェクトを確認する」ことと「設定を変更してよい」ことは別です。候補Script IDとCI接続先の同一性が確認できるまで、そのApps Scriptに紐づくGCPプロジェクトやOAuth設定を変更してはいけません。同一性確定後も、変更は別の認証復旧作業として明示的に承認された範囲だけで行います。

2026-08-12時点の正規GASテスト数は113件で、Final CIはfull fallback時に9入口から全113件を実行する設計です。

## `clasp run` / Apps Script APIとの関係

Apps Script APIの `scripts.run` を使うには、Apps Scriptと呼び出し側OAuthクライアントが同じ**標準GCPプロジェクト**を共有する必要があります。

最有力候補の `tradeCsvToSpreadSheet GAS CI Test` が標準GCPプロジェクトへ紐づいていることは確認済みです。また、人間がCI用として確認した同じ標準GCPでは、2026-08-12時点で次のOAuth 2.0 clientが存在します。

- `clasp CI login 2026-07`
  - Desktop OAuth client
  - 作成日: 2026-07-10
- `clasp CI login`
  - Desktop OAuth client
  - 作成日: 2026-06-19
- Apps Script由来のWeb application OAuth client

OAuth Client ID、Client Secret、GCPプロジェクト番号などの実値は記載しません。OAuth clientの存在と種類は確認済みですが、現在の `CLASPRC_JSON` がどのDesktop OAuth clientから発行された認証かは未確認です。また、Script ID同一性が未確認であるため、この確認結果だけで `tradeCsvToSpreadSheet GAS CI Test` が現在の `GAS_TEST_SCRIPT_ID` の接続先だとは確定しません。

次は引き続き別途確認が必要です。

- Google Apps Script APIがそのGCPプロジェクトで有効であること
- API executable deploymentが現在も有効であること
- `CLASPRC_JSON` が確認済みのCI用OAuth構成に対応していること

確認済みのOAuth clientがあるため、新しいGCPプロジェクトやOAuth clientを推測で作成しません。

## OAuth Audienceの確認・変更履歴

人間がCI用として確認した標準GCPのGoogle Auth Platformで、2026-08-12に次の状態を確認しました。

変更前:

- ユーザーの種類: External
- 公開ステータス: Testing
- CI用Googleアカウント: test userとして登録済み

その後、人間が公開ステータスを変更しました。

変更後:

- ユーザーの種類: External
- 公開ステータス: In production

このPRでGoogle Cloud / OAuth設定を変更したのではなく、人間が画面上で実施済みの変更結果を記録しています。Script ID同一性未確認gateはこの変更後も維持し、候補Apps Scriptを現在のCI本体とは断定しません。

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

2026-08-11時点で確認した、2026-08-07のPR #114 Final CI Run `31159793942`では、次の状態を確認しました。

- Final CI review gate: 成功
- head / base固定確認: 成功
- GAS test source / manifest / runner同期: 113件で成功
- mapped test file area監査: 成功
- GAS Tests選択: full / 113件
- `clasp push`: `invalid_grant` で失敗
- 実GAS Tests: 未実行
- Web E2E: 未実行

この場合、テストコードの失敗と認証失敗を混同しません。`clasp push`前後の認証で止まっているため、PRの実GASテスト不合格とは扱いません。

OAuth AudienceがExternal / Testingだったことは、refresh tokenの失効による`invalid_grant`と整合し、有力な原因候補です。ただし、Run `31159793942`の原因をこれだけで確定したとは扱いません。公開ステータスをIn productionへ変更しても、すでに失効したrefresh tokenは復活しないため、CI用認証の再発行は別の認証復旧作業として必要です。

### 復旧時の禁止事項

- ローカルPCでCI用`clasp login`を行わない。
- ローカルの本番用`production`認証を上書き・削除しない。
- 本番Apps ScriptへCI用コードをpushしない。
- CI Apps Scriptを確認する前に、新しいGCPプロジェクトやOAuthクライアントを推測で作らない。
- 別プロジェクトのGoogle Auth Platform設定を変更しない。

### 復旧方針

1. CI専用Googleアカウント上でテスト専用Apps Scriptの候補を探す。
2. 前述の手順で、候補Script IDと現在のCI接続先の同一性を確認する。確認できない場合は接続先不明のまま停止し、別作業で確認済み候補へ`GAS_TEST_SCRIPT_ID`を明示的にrebindする。
3. Apps Script側の「プロジェクトの設定」でGCPプロジェクトの状態を読み取り専用で確認できるが、必要な設定変更の判断と実変更は同一性確定後に限る。
4. 認証再発行では、既存のDesktop OAuth client `clasp CI login 2026-07` を第一候補として利用する。新しいOAuth clientを不用意に作成しない。
5. 旧Desktop OAuth client `clasp CI login` は、利用状況と移行完了を別途確認するまで削除・編集しない。
6. ローカルPCではCI用の`clasp login` / `clasp logout` / `clasp push`を行わず、認証再発行にはローカルPCから隔離した環境を使う。
7. 認証再発行で更新するGitHub SecretはCI用の`CLASPRC_JSON`に限定し、本番認証と混在させない。`GAS_TEST_SCRIPT_ID`同一性確認または明示的rebindは、認証再発行とは別のgateとして扱う。
8. Secret更新後、PRのhead/baseを再確認し、Actions利用の承認・再開後にFinal CIを実行する。
9. `clasp push`、実GAS Tests、必要なWeb E2Eが確定済み接続先で成功したことを確認してからマージ判断する。

具体的な認証再発行コマンドは、GCP / OAuth構成を確認してから決めます。未確認の構成を前提に固定手順を書かないでください。

## 誤認防止チェック

この文書を使うときは、次をすべて「不可」と判断します。

- Apps Script名だけでCI本体を確定する。
- `runGasTestBatch01`などの入口が存在するだけでCI本体を確定する。
- GitHub UIから登録済みSecretの値を読み返す。
- Script ID同一性が未確認の候補について、GCP / OAuth設定を変更する。
- SecretやScript IDの実値をActionsログへ出して比較する。

## GitHub側の正本

CIで使う主な設定は次のとおりです。

- `GAS_TEST_SCRIPT_ID`: テスト専用Apps ScriptのScript ID
- `CLASPRC_JSON`: CI用clasp認証
- `GAS_TEST_DEPLOYMENT_ID`: 既存API executable deploymentを使う場合のDeployment ID
- `CLASP_USER`: named userを使う場合だけ設定

実値はGitHub Secretsだけに保持し、ドキュメントへコピーしません。

## 確認が済んだら更新する項目

`tradeCsvToSpreadSheet GAS CI Test` の同一性と設定確認後、必要に応じてこの文書へ次を追記します。

- `GAS_TEST_SCRIPT_ID` との一致確認結果
- Google Apps Script APIの有効状態
- API executable deploymentの状態
- `CLASPRC_JSON` がどの確認済みDesktop OAuth clientに対応するか
- 認証再発行の正式手順

実IDや認証情報は、確認後も記載しません。
