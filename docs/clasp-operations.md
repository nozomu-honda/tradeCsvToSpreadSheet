# clasp反映手順

このドキュメントは、CI用Apps Scriptと本番Apps Scriptのどちらへ、どの方法でソースを反映するかをまとめた運用ガイドです。

## 最初に判断すること

| やりたいこと | 接続先 | 操作する場所 | 実行方法 |
| --- | --- | --- | --- |
| PRのGASテスト | テスト専用Apps Script | GitHub Actions | PRへ `run-gas-tests` ラベルを付ける |
| PRのWeb E2E | テスト専用Apps Script | GitHub Actions | PRへ `gas-web-e2e` ラベルを付ける |
| 本番ソースの確認 | 本番Apps Script | ローカルPC | `npm run gas:production:status` |
| 本番ソースの反映 | 本番Apps Script | ローカルPC | `npm run gas:production:push` |
| 本番エディタを開く | 本番Apps Script | ローカルPC | `npm run gas:production:open` |
| 公開中Webアプリの更新 | 本番Webアプリ | Apps Script画面 | 新バージョンを作成して再デプロイ |

迷った場合は、次の2点だけ先に確認してください。

- CI用へ反映する場合、ローカルPCでは何もpushしません。GitHub Actionsだけを使います。
- 本番用へ反映する場合、CI用の設定やコマンドは使いません。本番専用npmコマンドだけを使います。

## CI用Apps Scriptへの反映

### 誰が反映するか

GitHub Actionsが自動で反映します。人やCodexがローカルPCからCI用Apps Scriptへpushすることはありません。

### GAS Testsを実行する

1. 対象PRのレビューと修正を終える。
2. PRへ `run-gas-tests` ラベルを付ける。
3. GitHub Actionsの `Push test GAS project and run tests` が完了するまで待つ。
4. 成功したことを確認する。

ラベルを付けると、GitHub Actionsは次を自動実行します。

1. CI用認証をGitHub Secretsからrunnerへ用意する。
2. テスト専用Apps Scriptへ最新ソースをpushする。
3. GASテストを9バッチに分けて実行する。
4. 結果をPRのcheckへ反映する。

テスト成功後に追加コミットした場合は、`run-gas-tests` ラベルを一度外して再度付け、最新headで実行し直します。

### Web E2Eを実行する

1. 対象PRへ `gas-web-e2e` ラベルを付ける。
2. GitHub Actionsの `Deploy test Web app and run Playwright E2E` が完了するまで待つ。
3. Playwright、cleanup、rollback、一時deployment削除が成功したことを確認する。

Web E2Eでは一時Webアプリdeploymentを作成しますが、テスト終了後に自動削除されます。固定の本番Webアプリは更新しません。

### CI用で使われる設定

- 接続先: `GAS_TEST_SCRIPT_ID`で指定されたテスト専用Apps Script
- 認証: GitHub Secretの`CLASPRC_JSON`
- project設定: GitHub Actions runnerの一時領域
- ignore: `.claspignore`
- テストコード: `src/test/**`もpush対象

これらの実値をローカルファイルへコピーしたり、コミットしたりしません。

## 本番Apps Scriptへの反映

### 初回だけ行う準備

以下はWindows PowerShellで、ローカルリポジトリのルートから実行します。

1. 依存関係をインストールする。

```powershell
npm ci
```

2. 本番用project設定のサンプルをコピーする。

```powershell
Copy-Item .clasp.production.example.json .clasp.production.json
```

3. `.clasp.production.json`を開き、`scriptId`のplaceholderだけを本番Apps ScriptのScript IDへ置き換える。

`.clasp.production.json`はローカル専用で、Git管理対象外です。ファイルの内容やScript IDをIssue、PR、コメントへ貼らないでください。

4. 本番用named userとしてclaspへログインする。

```powershell
npm exec -- clasp login --user production
```

ブラウザが開いたら、本番Apps Scriptを管理するGoogleアカウントで許可します。CI用Googleアカウントではログインしません。

5. 本番設定と認証を確認する。

```powershell
npm run gas:production:status
```

エラーにならず、本番へ送る予定のファイルが表示されれば初回準備は完了です。`src/test/**` と `src/app/e2e_helpers.gs` が対象に含まれていないことも確認します。

### 毎回の本番反映手順

1. `develop`へ移動し、最新状態へ更新する。

```powershell
git switch develop
git pull --ff-only origin develop
```

2. working treeがcleanであることを確認する。

```powershell
git status --short
```

何も表示されない状態で進めます。

3. 本番へ送るファイルを確認する。

```powershell
npm run gas:production:status
```

4. 本番Apps Scriptへソースをpushする。

```powershell
npm run gas:production:push
```

確認画面で、内容を確認してから次の文字列を入力します。

```text
PRODUCTION PUSH
```

このコマンドは、次の条件を満たさない場合は自動停止します。

- 現在のブランチが`develop`
- working treeに未コミット変更がない
- `HEAD`が最新の`origin/develop`と一致する
- `.clasp.production.json`が有効
- named user `production`で認証済み
- `.clasp.productionignore`が有効
- 確認文字列が一致する

### 公開中Webアプリへ反映する

`npm run gas:production:push`が更新するのは、Apps Scriptプロジェクトのソースです。公開中のWebアプリがversioned deploymentを使っている場合、pushだけでは公開版は更新されません。

本番Webアプリも更新する場合は、push成功後に次を行います。

1. 本番Apps Scriptを開く。

```powershell
npm run gas:production:open
```

2. Apps Script画面右上の「デプロイ」から「デプロイを管理」を開く。
3. 現在の本番Webアプリdeploymentを選び、編集する。
4. バージョンで「新バージョン」を選ぶ。
5. 内容を確認して「デプロイ」を実行する。
6. 必要なOAuth権限が追加された場合は、本番運用アカウントで承認する。
7. 本番Webアプリの主要画面を手動確認する。

新しいdeploymentを追加するのではなく、通常は現在の本番deploymentを新バージョンへ更新します。これにより既存のWebアプリURLを維持できます。

本番へのpushと再デプロイは人が実行します。Codexは実行しません。

## 本番用で使われる設定

- 接続先: `.clasp.production.json`で指定した本番Apps Script
- 認証: clasp named user `production`
- project設定: `.clasp.production.json`
- ignore: `.clasp.productionignore`
- テストコード: `src/test/**`はpush対象外
- E2E専用helper: `src/app/e2e_helpers.gs`はpush対象外

## 絶対に実行しない操作

次の操作は禁止です。

```powershell
clasp push
npx clasp push
npm exec -- clasp push
```

理由は、暗黙のproject設定やデフォルト認証を使い、CI用と本番用を取り違える可能性があるためです。

次の情報はコミット、Issue、PR、コメントへ載せません。

- Script ID
- Deployment ID
- Web App URL
- Spreadsheet URLまたはID
- Drive folder ID
- OAuth token
- `.clasprc.json`の内容
- `.clasp.production.json`の実値
- GitHub Secretsの実値

## 困ったとき

### 本番用project設定がない

`.clasp.production.example.json`を`.clasp.production.json`へコピーし、`scriptId`のplaceholderを本番Script IDへ置き換えます。

### production認証を確認できない

次を再実行し、本番運用アカウントでログインします。

```powershell
npm exec -- clasp login --user production
```

### developではない、または最新developではない

```powershell
git switch develop
git pull --ff-only origin develop
```

未コミット変更がある場合は、内容を確認してcommitまたはstashしてから進めます。

### CIが失敗した

- GAS Testsの詳細は[`docs/gas-ci.md`](gas-ci.md)を確認する。
- Web E2Eの詳細は[`docs/gas-web-e2e.md`](gas-web-e2e.md)を確認する。
- CI用設定を直すためにローカルからCI用Apps Scriptへpushしない。
