# Codex Workflow Kit

Codex向けのプロジェクト横断ショートカット/プロンプト運用キットは、別リポジトリへ切り出しました。

```text
https://github.com/nozomu-honda/codex-workflow-kit
```

## このリポジトリ側の方針

このリポジトリには、株管理ツール固有の前提だけを残します。

- `AGENTS.md`
- `docs/current-status.md`
- `docs/TODO.md`
- 株管理ツール固有の仕様ドキュメント

共通ショートカット本体、AutoHotkey定義、インストール手順は `codex-workflow-kit` 側を参照します。

## ローカルPCで使う場合

初回セットアップは共通キット側で行います。

```powershell
git clone https://github.com/nozomu-honda/codex-workflow-kit.git "$env:USERPROFILE\codex-workflow-kit"
Set-Location "$env:USERPROFILE\codex-workflow-kit"
.\install.ps1
```

起動:

```powershell
& "$env:USERPROFILE\codex-prompts\common\codex-cross-project-autohotkey-v2.ahk"
```

## 使い方

Codex入力欄で以下を使います。

```text
;cxgo
;cxq
;cxpr
;cxgas
;cxmkpr
```

共通ショートカットは、このリポジトリの `AGENTS.md` や `docs/current-status.md` を読むようにCodexへ指示します。
