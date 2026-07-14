# 本番反映control workflow同期メモ

PR #84で追加する本番反映は、develop上の実装だけではラベル起動が完結しない。

## なぜmain同期が必要か

このリポジトリのdefault branchは `main`。
GitHub ActionsのPRラベル起動は、default branch上のworkflow定義で評価される。

そのため、PR #84をdevelopへマージした後、次のworkflow定義を `main` へ同期する後続対応が必要。

- `.github/workflows/production-deploy-control.yml`
- `.github/workflows/deploy-production.yml`

## control workflowの役割

`production-deploy-control.yml` は `pull_request_target: labeled` で起動するが、PR headはcheckoutしない。
本番Secrets、production Environment、clasp、本番Apps Script、本番Webアプリには触れない。

許可ラベル:

- `deploy-production-dry-run`
- `deploy-production`
- `deploy-production-force`

検証内容:

- eventが `pull_request_target:labeled`。
- 対象PRがmerged。
- base branchが `develop`。
- same repository PR。
- fork / external PRではない。
- merge commit SHAが40文字の完全SHA。
- merge commit SHAが最新 `develop` HEAD。

条件を満たした場合だけ、`deploy-production.yml` を `ref: develop` でworkflow_dispatchする。
これにより、GitHub Environment Deploymentの対象SHAは `main` 側control workflowのSHAではなく、実際の反映対象である最新 `develop` のSHAになる。

## 後続Issue候補

PR #84マージ後、次の内容だけを扱う小さな後続Issueを作る。

- default branch `main` へcontrol workflowとdeploy workflow定義を同期する。
- `main` 上でPRラベル起動が有効になることを確認する。
- Production Status Issue、Environment、Secrets / Variables、起動ラベルは人間が設定する。
- 本番workflowの実行、本番Apps Scriptへのpush、本番Webアプリdeployment更新はこの同期作業では行わない。
