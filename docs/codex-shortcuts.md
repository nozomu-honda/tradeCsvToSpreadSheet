# Codexショートカット運用メモ

このドキュメントは、Codexへ依頼するときに使うプロンプトテンプレートと、AutoHotkeyによるショートカット入力の使い方をまとめたものです。

Codex Proを使う前提に変更したため、運用方針は「使用量節約」ではなく、**調査・実装・テスト・ドキュメント更新・Draft PR作成までを効率よく進める**方向に寄せます。

また、効率重視では細かい個別ショートカットを増やすより、よく使う入口だけを残すほうが迷わないため、AutoHotkey側のショートカットは最小セットに整理します。

## 目的

Codexへの依頼を毎回長文で書かず、短いショートカット入力でテンプレートを呼び出せるようにする。

例:

```text
;cxgo
```

と入力すると、効率重視の一括タスク用テンプレートが展開される。

## 前提ファイル

プロンプト本体は、以下のファイルにまとめる。

```text
docs/codex-prompts.md
```

AutoHotkey側は、各ショートカットから `docs/codex-prompts.md の Txx を使ってください` という短い依頼文を展開する。

## ローカルPCへの反映手順

PRやブランチで更新したAutoHotkey定義を、ローカルPCで使えるようにする手順です。

### 1. PRブランチを取得する

リポジトリのローカル作業フォルダで実行する。

```powershell
git fetch origin
git switch docs/codex-efficiency-prompts
```

すでにPRがマージ済みなら、通常の作業ブランチではなく `develop` を最新化して使う。

```powershell
git switch develop
git pull origin develop
```

### 2. AutoHotkeyファイルを起動する

以下のファイルをダブルクリックする。

```text
codex-prompts-autohotkey-v2-instant.ahk
```

起動すると、Windows右下のタスクトレイにAutoHotkeyのアイコンが表示される。

### 3. 動作確認する

メモ帳などで以下を入力する。

```text
;ahtest
```

以下に展開されれば成功。

```text
OK
```

### 4. Codexで確認する

Codex入力欄で以下を入力する。

```text
;cxgo
```

`docs/codex-prompts.md の T18 を使ってください。` から始まる文に展開されれば成功。

### 5. PC起動時に自動起動する

毎回 `.ahk` をダブルクリックしたくない場合は、スタートアップにショートカットを置く。

1. `Win + R` を押す
2. 以下を入力してEnter

```text
shell:startup
```

3. 開いたフォルダに `codex-prompts-autohotkey-v2-instant.ahk` のショートカットを置く

次回PC起動時からAutoHotkeyが自動で起動する。

### 6. 更新を反映する

`.ahk` を更新した後は、タスクトレイのAutoHotkeyアイコンを右クリックして `Reload Script` を選ぶ。

うまく反映されない場合は、一度 `Exit` してから `.ahk` を再度ダブルクリックする。

## AutoHotkeyの使い方

### 1. AutoHotkey v2を使う

Windowsでは AutoHotkey v2 を使う。

### 2. ショートカット定義ファイルを起動する

以下のファイルをダブルクリックして起動する想定。

```text
codex-prompts-autohotkey-v2-instant.ahk
```

起動すると、Windows右下のタスクトレイに AutoHotkey のアイコンが出る。

### 3. 動作確認

メモ帳などで以下を入力する。

```text
;ahtest
```

これが以下に変わればOK。

```text
OK
```

### 4. Codex入力欄で使う

Codexの入力欄で以下のように入力する。

```text
;cxgo
```

効率重視の一括タスク用テンプレートが展開される。

## PC起動時に自動で有効化する方法

`.ahk` ファイルを毎回ダブルクリックしたくない場合は、Windowsのスタートアップにショートカットを入れる。

手順:

1. `.ahk` ファイルを任意の場所に置く
2. `Win + R` を押す
3. 以下を入力してEnter

```text
shell:startup
```

4. 開いたフォルダに `.ahk` ファイルのショートカットを置く

次回PC起動時から自動でAutoHotkeyが起動する。

## 残すショートカット

### よく使う入口

| 入力 | 対応テンプレート | 用途 |
|---|---|---|
| `;cxgo` | T18 | 効率重視で調査・実装・テスト・Draft PRまで進める。通常はこれを使う |
| `;cxfast` | T18 | `;cxgo` と同じ。打ちやすい方を使う |
| `;cx18` | T18 | テンプレ番号で呼びたい場合の一括タスク |
| `;cxpr` | T03 | PRレビュー。まだコード変更させない |
| `;cxq` | T01 | 調査だけ。仕様リスクが高い時だけ使う |
| `;cxgas` | T11 | GAS反映前チェック |
| `;cxmkpr` | T17 | Draft PR作成だけ |
| `;cx00` | T00 | 初めてのリポジトリや文脈再確認 |

### 番号で残すもの

| 入力 | 対応テンプレート | 用途 |
|---|---|---|
| `;cx01` | T01 | 調査だけ |
| `;cx03` | T03 | PRレビュー |
| `;cx11` | T11 | GAS反映前チェック |
| `;cx17` | T17 | Draft PR作成 |

## 廃止したショートカット

以下は、Codex Pro前提では `;cxgo` / `;cx18` に吸収できるため、AutoHotkeyからは外す。
テンプレート本体は `docs/codex-prompts.md` に残すので、必要な場合は手入力で呼び出せる。

| 旧入力 | 旧用途 | 今後の呼び出し方 |
|---|---|---|
| `;cx02` / `;cxi` | 通常実装 | `;cxgo` |
| `;cx04` | PR差分の危険箇所洗い出し | 必要時に `docs/codex-prompts.md の T04` と直接入力 |
| `;cx05` | 複数PRのマージ順整理 | 必要時に `T05` を直接入力 |
| `;cx06` | テスト追加・修正 | `;cxgo` でタスクに含める |
| `;cx07` / `;cxbug` | バグ修正 | `;cxgo` でバグ修正タスクとして依頼 |
| `;cx08` / `;cxui` | UI修正 | `;cxgo` でUI修正タスクとして依頼 |
| `;cx09` / `;cxdb` | DBまわり修正 | `;cxgo` でDB修正タスクとして依頼 |
| `;cx10` | 楽天フォーマット追加 | `;cxgo` で楽天フォーマット追加タスクとして依頼 |
| `;cx12` / `;cxdoc` | ドキュメント更新 | `;cxgo` でドキュメント更新タスクとして依頼 |
| `;cx13` | 既存コード整理・削除 | 必要時に `T13` を直接入力 |
| `;cx14` | PR分割相談 | 必要時に `T14` を直接入力 |
| `;cx15` | PR本文作成・更新 | `;cxgo` または `;cxmkpr` に含める |
| `;cx16` | マージ後作業リスト | 必要時に `T16` を直接入力 |

## Codex Pro前提のおすすめ運用

### 1. 明確な実装依頼は `;cxgo` を使う

以前のように毎回「調査だけ」で止めるより、目的が明確な場合は `;cxgo` で一気通貫に進める。

```text
;cxgo
```

Codexには、調査・実装・テスト・必要ドキュメント更新・コミット・Draft PR作成まで任せる。

### 2. 仕様リスクがあるときだけ `;cxq`

DBスキーマ、出力列、本番GAS、本番DB、既存仕様との衝突がありそうなときは、まず `;cxq` で調査だけにする。

```text
;cxq
```

### 3. 作ったPRは `;cxpr` でレビュー

Codexが作ったPRは、いきなりReady for reviewやマージに進めず、まず `;cxpr` でレビューする。

```text
;cxpr
```

### 4. GAS反映前は `;cxgas`

GASへ反映する前は `;cxgas` を使う。

```text
;cxgas
```

確認する主な項目:

- `appsscript.json` の OAuth scope
- GAS / V8 構文
- `google.script.run` の呼び出し名
- DB_CONFIG の実値混入
- DriveAppの権限・実行ユーザー
- `runSmokeTests` / `runAllTests`
- E2EやGitHub Actionsがfalse positiveになっていないか

### 5. PR作成だけなら `;cxmkpr`

作業ブランチの実装・テスト・コミットが終わっている場合は、`T17` を使ってDraft PRを作成する。

```text
;cxmkpr
```

## 止めるべき場面

効率重視でも、以下は勝手に進めさせない。

- `develop` / `main` への直接コミット
- Ready for review化
- マージ
- 本番GASへの反映
- 本番DB / 本番Driveへの操作
- Secret、トークン、OAuth情報、実URL、実IDのコミット
- DBスキーマ変更
- 出力列変更
- 既存仕様を変える必要がある変更
- 複数PRに分けるべき大きな変更

## 注意点

- Codexアプリ本体にテンプレートボタンを追加する仕組みではない
- AutoHotkeyはPC上で文字入力を展開するだけ
- ChatGPTの入力欄に `;cxpr` と打っても展開されない
- AutoHotkeyが起動していないとショートカットは効かない
- Codexアプリで効かない場合は、ブラウザ版Codexやメモ帳で確認する
- 管理者権限のアプリ上で効かない場合は、AutoHotkeyも管理者として実行する

## プロジェクト横断化する場合

このリポジトリ固有のテンプレートは `docs/codex-prompts.md` に残しつつ、共通テンプレートをPCローカルまたは別リポジトリに分離する。

例:

```text
C:\Users\user\codex-prompts\
  common\
    cx00-context.md
    cx01-investigate.md
    cx03-review-pr.md
    cx11-gas-check.md
    cx17-draft-pr.md
    cx18-fast-task.md
  projects\
    tradeCsvToSpreadSheet\
      gas-before-deploy.md
      rakuten-import.md
    x-post-calendar-bot\
      continue.md
```

各プロジェクト固有の前提は、そのリポジトリの `AGENTS.md` / `CLAUDE.md` / `docs/current-status.md` / `docs/TODO.md` を読ませる。

## このプロジェクトでの基本方針

- Codexは実装・テスト・Draft PR作成担当
- ChatGPTは設計・整理・レビュー支援担当
- Codex Pro前提なので、明確な作業は実装からDraft PRまで進める
- ただし、Ready for review化、マージ、本番反映は人間確認後
- 1PR 1目的を維持する
- 対象ファイル候補と期待する挙動を明示する
- ドキュメント更新は必要最小限にする
