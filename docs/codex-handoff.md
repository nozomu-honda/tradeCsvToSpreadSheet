# Codex Handoff

## 現在の開発状態

このプロジェクトは、Google Apps Scriptで証券会社の取引CSV/スプレッドシートを読み込み、DBスプレッドシートへ保存し、法人投資管理用の出力シートを生成するツールです。

既存の主対象は野村證券で、現在は楽天証券対応 Phase 1 を追加中です。

## 直近で完了したこと

### 楽天証券 Phase 1 設計

楽天証券の入力フォーマットは野村と列構造が異なるため、楽天CSVを直接DBへ入れるのではなく、内部共通レコードへ正規化してから既存処理に流す方針にしました。

Phase 1 対象:

- 楽天日本株
- 楽天米国株

将来対象:

- 楽天投信
- 楽天配当金・分配金
- 楽天入出金履歴

### 楽天用の入力判定・正規化

追加した主な設計/関数:

- `source_routing_rakuten_phase1.gs`
- `detectInputSourceTypeFromRows_(rows)`
- `normalizeRowsForImport_(rows)`
- `normalizeRakutenJapanStockRowsToRecords_(rows, headerRowIndex)`
- `normalizeRakutenUsStockRowsToRecords_(rows, headerRowIndex)`
- `routeTargetDbKeyBySource_(selectedTargetDbKey, sourceType)`

判定される入力形式:

- `nomura_common`
- `rakuten_jp_stock`
- `rakuten_us_stock`

### DBルーティング

UIでは従来通り以下のみ表示します。

- 法人A
- 法人B
- テスト用DB

楽天入力の場合だけ内部的に以下へルーティングします。

- `corp_a` → `rakuten_corp_a`
- `corp_b` → `rakuten_corp_b`
- `test` → `rakuten_test`

楽天専用DBは `uiVisible: false` としてUIに出さない方針です。

### 楽天日本株の実取込

楽天日本株の取込はテストDBで成功済みです。

確認済みの結果:

- 全件数: 30
- 日本株: 30
- 米国株: 0
- 外債: 0
- 投信: 0
- 金銭残高（円）: 30
- 金銭残高（ドル）: 0
- DB追加先: テスト用DB（楽天・赤セルバリデーション無視）
- 読込件数: 30
- 追加件数: 30
- スキップ件数: 0

### 楽天米国株

楽天米国株も試験投入済みですが、最終確認は未完了です。

期待する確認ポイント:

- 検出形式が `rakuten_us_stock`
- 実際の追加先DBキーが `rakuten_test`
- 出力先が米国株シート
- `商品 = 外株`
- `銘柄コード = ティッカー`
- `レート = 為替レート`
- `決済通貨` が `JPY` または `USD` に正規化される
- 円決済は金銭残高（円）
- USドル決済は金銭残高（ドル）

## DB作成先フォルダ指定

DBスプレッドシートが存在しない場合に、指定したGoogle Driveフォルダ内へ作成できるようにしました。

追加/変更した考え方:

- `DB_CONFIG.DB_FOLDER_ID` を使う。
- `spreadsheetId` が設定されているDBは `SpreadsheetApp.openById()` を使う。
- `spreadsheetId` が空欄のDBは、指定フォルダ内で `spreadsheetName` を検索する。
- 見つからなければ新規作成し、指定フォルダへ移動する。

注意:

- 実際のフォルダIDはコミットしない。
- サンプル値や説明に留める。

## OAuth / Drive権限問題

別ユーザーにWebアプリを試してもらったところ、`DriveApp.getFolderById()` 関連の権限エラーが発生しました。

確認済み:

- フォルダID自体は正しい。
- Apps Scriptエディタ上で、オーナーアカウントの `testDriveAuth_()` は `folder=DB` まで成功。
- つまり、オーナーの権限とIDは問題なし。

現在の本番運用方針:

- 本番Webアプリは所有者本人だけがアクセスする。
- 本番Webアプリはデプロイしたユーザーとして実行する。
- `appsscript.json` では `webapp.access = MYSELF` / `webapp.executeAs = USER_DEPLOYING` を維持する。
- テスト用Web E2Eの一時manifest設定とは混同しない。

必要な `appsscript.json` の例:

```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "webapp": {
    "access": "MYSELF",
    "executeAs": "USER_DEPLOYING"
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

manifest変更後は、Webアプリを必ず新しいバージョンで再デプロイする必要があります。

## UI表示の未完了タスク

結果画面にDBキーや検出形式が表示されていないため、表示追加したいです。

表示したい項目:

- 検出形式: `res.detectedSourceType`
- 選択DBキー: `res.requestedTargetDbKey`
- 実際の追加先DBキー: `res.routedTargetDbKey` または `res.db.dbTargetKey`
- 追加先DBラベル: `res.db.dbTargetLabel`

期待表示例:

```text
DB取込結果:
検出形式: rakuten_jp_stock
選択DBキー: test
実際の追加先DBキー: rakuten_test
追加先DB: テスト用DB（楽天・赤セルバリデーション無視）
取込ID: import_...
読込件数: 30
追加件数: 30
スキップ件数: 0
```

## 次にCodexへ頼むとよいタスク

最初の小さいタスクとして、次を推奨します。

```text
結果画面のDB取込結果に、検出形式・選択DBキー・実際の追加先DBキーを表示してください。
既存の件数表示とDB取込結果表示は壊さないでください。
関連ファイルは Index.html と import.gs です。
```

次に進めるタスク:

1. 楽天米国株の実取込結果確認と不具合修正
2. UI結果画面へのDBキー表示追加
3. Drive権限問題の再検証
4. 楽天 Phase 2 設計
5. 楽天投信対応
6. 楽天配当金・分配金対応
7. 楽天入出金履歴対応

## 重要な注意

- スプレッドシートID、フォルダID、WebアプリURLなどの実値はコミットしない。
- ユーザーの実データCSVやDB内容もコミットしない。
- 仕様変更時は `docs/` を更新する。
- 楽天DBをUIに表示しない方針を維持する。
- テスト用DBの赤セルバリデーション無視仕様を維持する。
