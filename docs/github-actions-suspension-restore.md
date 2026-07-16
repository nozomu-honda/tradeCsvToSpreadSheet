# GitHub Actions一時停止・復旧記録

## 目的

GitHub Actionsの消費量削減改革中に行う一時的な設定変更を記録し、改革完了後または緊急時に安全に復旧できるようにする。

この文書は設定値のバックアップと復旧手順であり、`docs/ci-policy.md` の恒久方針を緩和するものではない。

## 一時停止前の既知の設定

2026-07-16時点で確認できている設定は次のとおり。

- 対象リポジトリ: `nozomu-honda/tradeCsvToSpreadSheet`
- 対象branch: `develop`
- GitHub Actions: 有効
- branch protection／rulesetのrequired status check:
  - `Push test GAS project and run tests`
- 最終CIの手動起動ラベル:
  - `run-final-ci`
- 最終CIはGAS Testsの後にWeb E2Eを直列実行する構成

Secrets、Variables、Environments、workflowファイルは、復旧可能性を保つため削除しない。

## 改革中の一時設定

- リポジトリ全体のGitHub Actionsを無効化する
- `develop`のrequired status checkから、次を一時的に外す
  - `Push test GAS project and run tests`
- Actions停止中は、CI、E2E、本番deploy、preflight、自動マージなどActions依存処理を実行しない
- docs-only PRをマージするためだけに空runや重いCIを起動しない

required checkを外す操作は恒久廃止ではなく、CI改革を進めるための一時措置として記録する。

## 復旧条件

GitHub Actionsを再開するのは、次をすべて満たし、ユーザーが明示的に承認した後とする。

1. Issue #99のCI・E2E改革が実装・レビュー済みである
2. docs-onlyで通常CI・GAS Tests・Web E2Eが0回になる
3. レビュー完了前に重いCIが起動しない
4. 固定head SHAに対する最終CIだけが原則1回起動する
5. E2Eが影響範囲のある変更だけで起動する
6. branch protectionが新構成と矛盾せず、docs-onlyを存在しないcheck待ちにしない
7. 想定月間Actions使用量を確認している
8. ユーザーがActions再開を明示承認している

## 通常の復旧手順

改革完了後は、旧設定を無条件にそのまま戻すのではなく、新しいCI設計に対応した保護へ移行する。

1. Actionsを停止したまま、`npm ci`、`npm run test:final-ci-workflow`、`npm test` とworkflow差分のセルフレビューを完了する
2. `docs/**`、`README.md`、`AGENTS.md` などのdocs-onlyがcontrollerの `paths-ignore` 対象で、API側でも重いjob 0回になることを確認する
3. 現在head/develop base SHAのレビュー完了コメント、未解決thread 0件、最新review state、変更分類、同一head/base check再利用のローカル回帰テストを確認する
4. docs-onlyに存在しないcheckを全PRへ要求しないよう、branch protection／rulesetを人間が確認する。条件付き必須化を安全に実現できない場合、旧required checkは一時解除のままとする
5. ユーザーの明示承認後にGitHub Actionsを再度有効化する。この時点では本番系workflowを実行しない
6. docs-only PRへラベルを付けてもActions runが作られないことを確認する
7. backend GAS-only PRで、レビュー完了コメントの後に `run-final-ci` を付け、GAS Testsだけが1回実行されることを確認する
8. UI・Webアプリ影響PRで、GAS Tests成功後にだけWeb E2Eが1回実行されることを確認する
9. 同じhead/baseでラベルを付け直した場合に成功checkが再利用され、追加コミットまたはdevelop更新後は古いコメントとcheckが再利用されないことを確認する
10. 同じPRの旧ゲートだけがキャンセル可能で、異なるPRの軽量ゲートは共有GAS lockの前で独立して進み、GAS/Web/cleanupは `gas-shared-test-project` で直列化され自動キャンセルされないことを確認する
11. Actions消費時間と保護設定を再確認してから、本番系workflowを別途再開する

旧required check名は次のとおりであり、設定確認・緊急ロールバック時の参照用に保持する。

```text
Push test GAS project and run tests
```

## 緊急ロールバック

CI改革に重大な問題があり、旧構成へ一時的に戻す必要がある場合は、ユーザーの明示承認を得たうえで次を行う。

1. GitHub Actionsを有効化する
2. `develop`のrequired status checkへ旧check名を戻す
3. `run-final-ci`ラベルによる旧最終CI経路が存在することを確認する
4. Secrets、Variables、Environmentsが削除されていないことを確認する
5. 旧構成ではdocs-onlyがrequired check待ちになる可能性があるため、恒久運用には戻さず、復旧作業専用の一時状態として扱う

## 禁止事項

- 一時停止中にSecrets、Variables、Environmentsを削除しない
- 復旧記録なしにrequired check名を変更しない
- Actionsを再開しただけで全workflowを無条件に動かさない
- 旧構成へのロールバックを、`docs/ci-policy.md`の恒久方針変更として扱わない
- ユーザーの明示承認なしにActionsを再開しない

## 関連Issue・PR

- #98 GitHub Actionsを一時停止し、CI・E2Eの実行量を削減する
- #99 レビュー完了後だけ最終CIを実行し、docs-onlyでは通常CI・E2Eを完全停止する
- #100 CI・E2Eの最終実行方針を恒久ルールとして明文化する
- PR #101 CI・E2Eの恒久運用ルールを明文化する
