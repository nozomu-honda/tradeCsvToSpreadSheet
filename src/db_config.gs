/**
 * DB化ブランチ用の設定
 *
 * 役割:
 * - 取引データを保存するDB用スプレッドシート/シート名の定義
 * - DB保存用ヘッダーの定義
 * - 取込履歴用ヘッダーの定義
 *
 * 方針:
 * - 計算列（保有数、平均取得単価、簿価など）はDBに保存しない
 * - DBには「正規化済みの元データ」と管理用メタ情報だけを保存する
 * - 4シートはDB保存後に再計算して生成する
 */
const DB_CONFIG = {
  /**
   * 共有DBとして固定利用したいスプレッドシートID
   *
   * 使い方:
   * - 共有用DBを手で1つ作成し、そのスプレッドシートIDをここに入れる
   * - 値が入っている場合は、そのDBを全員で共通利用する
   * - 空欄の場合は、従来どおり Drive 上で名前検索し、無ければ新規作成する
   *
   * 例:
   * DB_SPREADSHEET_ID: '1AbCdEfGhIjKlMnOpQrStUvWxYz'
   */
  DB_SPREADSHEET_ID: '1XqCr8PpcENcx_-krJV1jRKb5_yU9tVBVXvEtypCSLGY',

  /**
   * DB本体となるスプレッドシート名
   *
   * DB_SPREADSHEET_ID が空欄のときだけ、
   * Drive上でこの名前のSpreadsheetを探し、
   * あればそれを使い、なければ新規作成する。
   */
  DB_SPREADSHEET_NAME: '取引DB',

  /**
   * 取引データを蓄積するシート名
   * 1取引 = 1行で保存する。
   */
  SHEET_TRANSACTIONS: '取引DB',

  /**
   * 取込履歴を保存するシート名
   * どのCSVを、いつ、何件取り込んだかを管理する。
   */
  SHEET_IMPORT_LOGS: '取込履歴',
};

/**
 * 取引DBシートのヘッダー定義
 *
 * 構成:
 * - 管理用メタ情報
 * - 元CSV由来の正規化済み列（BASE_HEADERS）
 * - 監査/更新用メタ情報
 *
 * 注意:
 * - TRADE_HEADERS のような計算列は入れない
 * - rowHash は重複判定に使う
 */
const DB_HEADERS = [
  /**
   * DB上の主キー
   * 1レコードごとにユニークなUUIDを入れる想定
   */
  'recordId',

  /**
   * 1回の取込処理単位を表すID
   * 同じCSV投入で入った行を追跡するために使う
   */
  'importId',

  /**
   * 元ファイル名や入力元名
   * 例: link.csv, nomura_202604.csv など
   */
  'sourceName',

  /**
   * 元CSV内の行番号
   * どの行から作られたレコードかを追跡するために使う
   */
  'sourceRowNo',

  /**
   * 重複判定用のハッシュ
   * 同じ取引を二重登録しないために使う
   */
  'rowHash',

  /**
   * 元CSVの正規化済み基本列
   */
  ...BASE_HEADERS,

  /**
   * 作成日時
   * DBに最初に保存した日時
   */
  'createdAt',

  /**
   * 更新日時
   * 将来、無効化や再保存をした場合の更新時刻
   */
  'updatedAt',

  /**
   * 論理削除・無効化フラグ
   * true の行だけを通常利用対象にする想定
   */
  'isActive',
];

/**
 * 取込履歴シートのヘッダー定義
 *
 * 役割:
 * - 取込単位のログを残す
 * - 何件読んで、何件追加し、何件スキップしたかを把握する
 */
const IMPORT_LOG_HEADERS = [
  /**
   * 取込処理単位のID
   */
  'importId',

  /**
   * 取込実行日時
   */
  'importedAt',

  /**
   * 元ファイル名や入力元名
   */
  'sourceName',

  /**
   * 入力種別
   * 例: url / upload
   */
  'inputType',

  /**
   * 正規化後のURL
   * URL取込時のみ入る想定
   */
  'normalizedUrl',

  /**
   * 読み込んだレコード総数
   */
  'rowCount',

  /**
   * DBに新規追加した件数
   */
  'insertedCount',

  /**
   * 重複などで追加せずスキップした件数
   */
  'skippedCount',

  /**
   * 取込時に出たアラート件数
   */
  'alertCount',
];
