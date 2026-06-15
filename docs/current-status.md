# Current Status

## 完了

- 野村CSV/スプレッドシート取込の既存仕様維持。
- 楽天証券 Phase 1 の設計作成。
- 楽天日本株の検出・正規化・DBルーティングを実装。
- 楽天米国株の検出・正規化・DBルーティングを実装。
- 楽天専用DBを `uiVisible: false` とする方針を追加。
- 楽天日本株のテスト取込は成功済み。
- DB作成先フォルダ指定の実装を追加。
- オーナー権限では `DriveApp.getFolderById()` が成功することを確認済み。

## 未完了 / 確認待ち

- 別ユーザーでのDrive OAuth承認とWebアプリ実行確認。
- 楽天米国株の実取込結果の最終確認。
- 結果画面への `detectedSourceType` / `requestedTargetDbKey` / `routedTargetDbKey` 表示追加。
- 楽天Phase 2の詳細設計。

## 直近の優先順位

1. 別ユーザーのDrive権限問題の結果待ち。
2. 楽天米国株の出力確認。
3. UI結果画面へ検出形式・DBキーを表示。
4. Codex移行用ドキュメントをリポジトリへ追加。
5. 楽天Phase 2へ進む。

## 注意点

- 実際のフォルダID・スプレッドシートID・WebアプリURLはコミットしない。
- `appsscript.json` のOAuth scope変更後は、Webアプリの新バージョン再デプロイが必要。
- Webアプリを「アクセスしているユーザー」として実行する場合、利用者ごとにDrive権限承認とDBフォルダ編集権限が必要。
