このディレクトリは、長くなった src/test.gs を分割した Apps Script 用の .gs ファイル群です。

想定構成:
- test_runner.gs                 : テスト一覧とランナー
- test_temp_spreadsheet_helpers.gs : 一時Spreadsheetヘルパー
- test_temp_db_helpers.gs        : DB一時Spreadsheetヘルパー
- test_support_helpers.gs        : assert / makeTradeRecord など共通関数
- test_trade_rows.gs            : buildTradeRows_ / buildCashRows_ 系テスト
- test_input_reader.gs          : readInputRecords_ / findInputSheetByHeader_ 系テスト
- test_writer.gs                : writeSheet_ 系テスト
- test_db.gs                    : DB / rollback / reset 系テスト
- test_staging_sheet.gs         : 一次受け枠系テスト

使い方:
1. 既存の src/test.gs の内容を退避
2. このディレクトリの .gs ファイルを src/ 配下へ配置
3. 元の test.gs は削除するか、重複関数が出ないよう空にする
4. Apps Script で runSmokeTests / runAllTests を実行
