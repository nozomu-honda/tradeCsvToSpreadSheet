# CI・E2E運用ポリシー

## 位置付け

この文書は、`tradeCsvToSpreadSheet` におけるCI・E2Eの起動条件を定めるプロジェクトの恒久ルールである。

Codex、ChatGPT、人間のいずれが作業する場合も、この文書を最優先で守る。`docs/current-status.md`、`docs/TODO.md`、個別Issue、個別PR、過去の会話、既存workflowの挙動がこの文書と矛盾する場合は、この文書を優先する。

この方針は、ユーザーの明示承認を受けた専用Issue・専用PRなしに変更、緩和、迂回してはならない。

## 不変の基本方針

1. docs-onlyでは、docsに関連のない通常CI・GAS Tests・Web E2Eを一切実行しない。
2. PRの作成・更新中は、通常CI・GAS Tests・Web E2Eを実行しない。
3. 差分レビュー、仕様確認、秘密情報確認、未解決指摘確認など、CI以外の確認がすべて完了した時点で、固定したhead SHAに対して初めて最終CIを実行する。
4. 最終CIは原則として同一head SHAに1回だけ実行し、成功済み結果を再利用する。
5. E2Eは影響範囲がある変更に限って実行し、通常のコード変更すべてに自動適用しない。

## 標準フロー

```text
PR作成・更新
  ↓
通常CI・GAS Tests・Web E2Eは起動しない
  ↓
ChatGPT／人間による差分レビュー・仕様確認・安全確認
  ↓
必要ならCodexが修正
  ↓
CI以外の問題がすべて解消
  ↓
レビュー完了状態とhead SHAを確定
  ↓
最終CIを原則1回だけ実行
  ↓
影響範囲がある場合だけWeb E2Eを実行
  ↓
最終結果を確認してマージ判断
```

## docs-onlyの定義

次の文書ファイルだけを変更しているPRを、docs-only候補とする。

- `docs/**`
- `README.md`
- `AGENTS.md`
- プロジェクトが明示的に許可したMarkdownまたは文書ファイル

次のいずれかを含む場合はdocs-onlyとして扱わない。

- GAS実行コード
- HTML、CSS、クライアントJavaScriptなどWeb UIへ影響するファイル
- `appsscript.json`
- `.github/workflows/**`
- CI・E2E・本番反映用スクリプト
- `package.json`、lockfile、テスト設定
- clasp設定またはignore境界
- docs以外の生成物や設定ファイル

文書とコードが混在するPRはdocs-onlyではない。判定を曖昧なまま軽量扱いにしてはならない。

## docs-onlyで禁止する処理

docs-only PRでは、次の処理を起動してはならない。

- 通常CI
- GAS Tests
- テスト用Apps Scriptへの`clasp push`
- Web E2E
- Playwrightのinstall・実行
- 動的Webアプリdeploymentの作成・更新・削除
- 本番preflight
- 本番deploy
- 本番smoke
- ドキュメントと関係のないNodeテスト
- runtime bundle検証
- required checkを成功させるためだけの空run

原則としてdocs-only PRではGitHub Actions自体を起動しない。Markdownやリンクの検証が将来必要になった場合も、通常CIとは分離し、明示手動実行または十分に軽量な専用経路として設計する。

## レビュー完了ゲート

最終CIを開始できるのは、少なくとも次をすべて満たす場合だけとする。

- PRがopenである
- Draftではない
- base branchが想定どおりである
- same-repository PRである
- 起動対象のhead SHAと現在のhead SHAが一致する
- CI以外の差分レビューが完了している
- 未解決review threadが0件である
- `changes-requested`などのレビュー未完了状態ではない
- 秘密情報、認証情報、ID、URLなどの混入確認が完了している
- 仕様上の未解決事項がない
- 最終CIの実行を許可するレビュー完了状態が、現在のhead SHAに対して有効である

単にラベルが付いていることだけを、レビュー完了の根拠にしてはならない。workflow側でも現在のPR状態とhead SHAを再検証する。

## head SHAの固定と失効

レビュー完了後にcommitが追加された場合、以前のレビュー完了状態、最終CI実行許可、成功済みcheckの流用可否を現在のhead SHAに対して再評価する。

新しいhead SHAをレビューしていない状態では、重いCI・E2Eを実行してはならない。古いhead SHAに対するラベル、コメント、承認、checkを新しいhead SHAの根拠として扱わない。

同一head SHAで同じcheckが成功済みの場合は、その結果を再利用し、重い処理を再実行しない。

## CIとE2Eの分類

### docs-only PR

- 通常CI: 0回
- GAS Tests: 0回
- Web E2E: 0回
- clasp操作: 0回
- deployment操作: 0回

### 通常コードPR

- レビュー完了までは重いCIを0回とする
- レビュー完了後にGAS Testsを原則1回実行する
- Web E2Eへの影響がなければE2Eは実行しない

### UI・Webアプリ・認証・deployment・E2E基盤へ影響するPR

- レビュー完了後にGAS Testsを実行する
- GAS Tests成功後に限りWeb E2Eを原則1回実行する
- 実GAS deploymentを使うE2Eは、パス判定または明示的な最終実行許可がある場合だけ実行する

### workflow・CIスクリプト変更

- Actions全面停止中はローカル検証を先に行う
- 変更内容に必要な最小の最終検証だけを明示的に実行する
- workflow変更そのものを理由に、無関係なGAS TestsやWeb E2Eを自動実行しない

## GitHub Actionsの起動条件

重いCI・E2Eの起動条件に、次を使用してはならない。

- PR作成
- PRへの通常push
- `synchronize`
- `ready_for_review`
- developへの通常pushだけを理由とした重い再検証

最終CIの入口は、レビュー完了後の明示操作に限定する。入口がラベル、手動dispatch、レビュー状態のいずれであっても、重いjob開始前にレビュー完了ゲートを再検証する。

古いrunはPR番号と対象種別に応じた`concurrency`で整理する。ただし、共有GAS projectや動的deploymentのcleanupを中断して残骸を生む設計にしてはならない。

## required checksとbranch protection

docs-only PRに存在しないcheckを必須化して、永久待機させてはならない。また、required checkを満たすためだけに空のActions runを作ってはならない。

branch protectionは、次のいずれかを満たす設計にする。

- docs-onlyでは該当check自体を要求しない
- 条件付きrequired workflowなど、Actions消費を伴わずに正しく分岐できる仕組みを利用する
- マージ前の手動確認手順を明文化し、存在しないcheck待ちを発生させない

branch protection変更が必要な場合は、workflow実装と同じIssue・PRの完了条件に含める。

## 禁止事項

次の変更を行ってはならない。

- 全PRでCIやE2Eを自動起動する
- docs-onlyでも通常CIやE2Eを起動する
- レビュー前や修正途中に「早期確認」の名目で重いCIを常時起動する
- ラベルが付いているだけでレビュー完了とみなす
- 新commit後も古いレビュー完了状態を有効扱いする
- E2Eを通常CIの無条件後続jobにする
- required checkのためだけに空runを作る
- GitHub Actions消費量を考慮せずmatrix、重複checkout、重複install、重複deploymentを増やす
- このポリシーと矛盾する自動化を、個別Issueの都合だけで導入する

## 例外

緊急障害対応などで例外的なCI・E2E実行が必要な場合も、ユーザーの明示承認を得る。例外は対象PR、対象head SHA、実行するcheck、理由を限定し、恒久的な自動起動へ変更しない。

本番デプロイは通常CIとは別系統とし、人間の明示操作と本番用保護を必須とする。通常のPRイベントから本番処理を起動してはならない。

## 方針変更の手続き

この文書を変更する場合は、次をすべて必要とする。

1. ユーザーが方針変更を明示的に承認する
2. 専用Issueを作成する
3. 影響、Actions消費量、docs-only、レビュー完了ゲート、E2E条件への影響を記載する
4. 専用PRで`AGENTS.md`とこの文書を同時に更新する
5. ChatGPTまたは人間が、元の不変方針を意図せず緩和していないかレビューする

実装上の都合、GitHubの設定都合、required checkの都合だけでは変更理由にならない。

## 実装時の受け入れ条件

CI・E2Eのworkflowまたは判定ロジックを変更するPRでは、少なくとも次を確認する。

- docsのみ変更: 重いrun 0回
- READMEのみ変更: 重いrun 0回
- docsとコード混在: docs-only扱いにしない
- レビュー前の最終CI要求: 重いjob 0回
- 未解決threadあり: 重いjob 0回
- レビュー完了後に新commit: 古い許可を失効し、重いjob 0回
- 同一head SHAで成功済み: 重い処理を再実行せず結果を再利用
- backendのみ変更: GAS Testsのみ
- UI・Webアプリ関連変更: GAS Tests成功後にWeb E2E
- fork・external PR: Secretsを使用するjob 0回

## 関連Issue

- #98 GitHub Actionsを一時停止し、CI・E2Eの実行量を削減する
- #99 レビュー完了後だけ最終CIを実行し、docs-onlyでは通常CI・E2Eを完全停止する
- #100 CI・E2Eの最終実行方針を恒久ルールとして明文化する
