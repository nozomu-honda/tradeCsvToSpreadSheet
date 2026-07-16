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

1. 新しい最終CIのcheck名と起動条件を確認する
2. docs-onlyをblockしないbranch protection／rulesetへ更新する
3. 必要なrequired checkだけを設定する
4. GitHub Actionsを再度有効化する
5. まず低コストな検証だけで段階的に動作確認する
6. レビュー完了後の通常コードPRで、最終CIが1回だけ起動することを確認する
7. UI・Webアプリ影響PRでのみWeb E2Eが起動することを確認する
8. 消費時間を確認してから本番系workflowを再開する

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
