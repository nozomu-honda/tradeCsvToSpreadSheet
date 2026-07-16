# required status check一時削除記録

## 実施日

2026-07-16

## 実施内容

ユーザーの操作報告により、`develop`を対象とするbranch protection／rulesetから次のrequired status checkを一時的に削除した。

```text
Push test GAS project and run tests
```

この変更はCI・E2E削減改革を進めるための一時措置であり、恒久廃止ではない。

## 復旧時の設定値

- 対象リポジトリ: `nozomu-honda/tradeCsvToSpreadSheet`
- 対象branch: `develop`
- required status check名: `Push test GAS project and run tests`
- 旧最終CI起動ラベル: `run-final-ci`

## 復旧場所

Rulesetの場合:

```text
Settings
→ Rules
→ Rulesets
→ developを対象にするRuleset
→ Require status checks to pass
→ Add checks
→ Push test GAS project and run tests
→ Save changes
```

旧形式のBranch protectionの場合:

```text
Settings
→ Branches
→ Branch protection rules
→ developを対象にするルールのEdit
→ Require status checks to pass before merging
→ Push test GAS project and run tests を追加
→ Save changes
```

## 注意

- GitHub Actions、Secrets、Variables、Environments、workflowファイルは削除しない。
- Actionsの再開とrequired checkの復旧は、Issue #99の改革完了後、ユーザーの明示承認を得て行う。
- 旧checkをそのまま恒久復旧するとdocs-only PRがblockされる可能性があるため、新しいCI設計に対応したrequired checkへ移行することを優先する。
