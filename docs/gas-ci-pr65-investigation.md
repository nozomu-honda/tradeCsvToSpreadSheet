# PR #65 GAS CI 調査メモ

作成日: 2026-07-10

## 目的

PR #65 の `Push test GAS project and run tests` が green だった一方で、実際の `clasp run runAllTests` は権限エラーで実行されず、構文検証と `clasp push` だけで成功扱いになった原因と解消方法を整理する。

このメモでは Secret 値、Script ID、Deployment ID、Spreadsheet ID、実URLは記載しない。

## 1. 原因

原因は2段階。

1. PR #65 の最終headでは、最新コミットが docs-only だったため、直前headの成功済みcheckを根拠に重いGAS実行をスキップして green になった。
2. その直前headでは、`clasp push` 後に `clasp run runAllTests` を試行したが、権限エラーで実行されなかった。ただし `scripts/ci/run-gas-tests.sh` のfallbackにより、`clasp run unavailable` として成功扱いになった。

ログ上の要点:

```text
GAS_TEST_DEPLOYMENT_ID is not set
Unable to run script function. Please make sure you have permission to run the script function.
runAllTests could not be executed after clasp push: clasp was not authorized to execute the function.
clasp run was unavailable for: runAllTests. Source validation and clasp push completed.
```

該当実装:

- `scripts/ci/run-gas-tests.sh`
  - `Unable to run script function`
  - `not authorized to execute the function`
  - `clasp was not authorized`
  を検出すると `unavailable=1` にする。
- その場合、`exit_code=0` に変更する。
- `unavailable_functions` があっても、最終的に `exit 0` で終了する。

このfallbackは PR #53「Handle unavailable clasp run in GAS CI」で意図的に追加された。

## 2. GitHub/GAS側の設定だけで直せるか

`clasp run` を通すだけなら、設定だけで直せる可能性はある。

ただし、必要条件が多い。

- テスト専用 Apps Script project が API executable として実行可能であること。
- OAuth token がスクリプトの必要scopeを含むこと。
- スクリプトとOAuth clientが同じ標準Google Cloud projectを共有していること。
- その標準Google Cloud projectで Apps Script API が有効であること。
- `clasp run` の devMode 実行を使う場合、CI認証ユーザーが script owner であること。

現状確認できたこと:

- `CLASPRC_JSON` と `GAS_TEST_SCRIPT_ID` はGitHub Secretsに存在する。
- `GAS_TEST_DEPLOYMENT_ID` はGitHub Secretsに存在しない。
- `CLASP_USER` はGitHub Secretsに存在しない。
- `clasp push` は成功しているため、少なくともpush権限と認証情報の基本読み込みは通っている。
- `clasp run` は権限エラーで止まっているため、push権限と実行権限は別問題として扱う必要がある。

## 3. リポジトリ変更が必要か

必要。

設定だけで `clasp run` を通せる可能性はあるが、現在のrequired check名は `Push test GAS project and run tests` であり、greenなら `runAllTests` が実行済みと解釈される。

そのため、`runAllTests` 未実行でもgreenになる現在のfallbackは、required checkとしてはfalse positiveになる。

少なくともrequired checkでは、`clasp run unavailable` を成功扱いにしない修正が必要。

fallbackを残す場合は、required checkではない別job/別check名に分離する。

## 4. 必要な設定手順

設定で `clasp run` を通す場合の手順。

すべてテスト専用 Apps Script project で行う。本番GAS、本番DB、本番Driveには触れない。

1. テスト専用 Apps Script project を開く。
2. Project Settingsで標準Google Cloud projectへ切り替える。
3. その標準Cloud projectで Apps Script API を有効化する。
4. OAuth consent screenを設定する。
5. 同じ標準Cloud projectでOAuth clientを作成する。
6. CI用Googleアカウントを、必要に応じてtest userに追加する。
7. CI用Googleアカウントで `clasp login --creds ... --use-project-scopes --include-clasp-scopes` し直す。
8. 生成された `.clasprc.json` を `CLASPRC_JSON` secretへ更新する。
9. `clasp login --user <ci-user>` 形式で生成した場合は、`CLASP_USER` secretも設定する。
10. API executable deploymentを作成し、CIユーザーが実行できるaccess設定にする。
11. `GAS_TEST_DEPLOYMENT_ID` を使う運用にする場合は、そのdeployment IDをsecretへ追加する。
12. devModeのまま運用する場合は、CIユーザーがscript ownerであることを確認する。ownerにできない場合は、`clasp run --nondev` を使う設計変更を検討する。

## 5. Secretを表示せず確認する方法

Secret値を出さずに確認する方法。

- `gh secret list --repo nozomu-honda/tradeCsvToSpreadSheet`
  - secret名と更新日時だけ確認する。
  - 値は表示しない。
- GitHub Actionsログを確認する。
  - `GAS_TEST_DEPLOYMENT_ID is not set`
  - `No credentials found`
  - `Unable to run script function`
  - `clasp run unavailable`
  の有無を見る。
- GitHub UIの Settings > Secrets and variables > Actions でsecret名と更新日時だけ確認する。
- Apps Script editorで、API executable deployment、access設定、標準Cloud project紐付け、OAuth scopesを確認する。
- CI用Googleアカウントでテスト専用Apps Script projectを開き、owner/editorどちらかを確認する。

確認時も、Script ID、Deployment ID、Spreadsheet ID、実URL、OAuth tokenはチャットやPR本文に貼らない。

## 6. 修正PRが必要な場合の最小タスク

最小修正PRの対象。

- `scripts/ci/run-gas-tests.sh`
  - `Unable to run script function`
  - `not authorized`
  - `clasp was not authorized`
  をrequired checkでは失敗扱いに戻す。
  - `clasp run unavailable` の `exit 0` をやめる。
  - エラー時に設定確認手順をStep Summaryへ出す。
- `docs/gas-ci.md`
  - required checkは `runAllTests` 実行成功まで要求する方針へ更新する。
  - fallbackはrequired checkでは使わない方針へ変更する。
- `docs/current-status.md`
  - PR #53由来のfallback説明を更新する。

任意の追加検討:

- `GAS_TEST_DEPLOYMENT_ID` が設定されている場合に `clasp run --nondev` を使う設計。
- ただしこれは最小修正より一段大きい。

## 7. fallbackを維持すべきか、失敗扱いにすべきか

required checkでは失敗扱いにすべき。

理由:

- check名が `Push test GAS project and run tests` なので、greenなら `runAllTests` 実行済みと解釈される。
- PR #65では `runAllTests` が実行されていないのに、required checkがgreenになった。
- false positiveを避けるという当初方針と矛盾する。
- 手動 `runAllTests` を許容する場合でも、required checkとは別に「手動確認が必要」と明示するべき。

推奨方針:

- required checkでは `clasp run runAllTests` が実行できない場合はfail。
- fallbackを残すなら、別check名または手動確認用の非required jobに分離する。

## 次にCodexへ依頼する場合の最小依頼文

```text
docs/gas-ci-pr65-investigation.md を読んで、GAS CIのrequired checkで clasp run runAllTests が権限エラーになった場合に成功扱いしない修正PRを作ってください。

制約:
- 本番GAS・本番DBに触れない
- Secretや認証情報を表示・変更しない
- required check名は維持する
- clasp push / 構文検証成功だけでは green にしない
- runAllTests未実行なら fail にする
- docs/gas-ci.md と docs/current-status.md も更新する
- developへ直接コミットしない
- Draft PRまで
```
