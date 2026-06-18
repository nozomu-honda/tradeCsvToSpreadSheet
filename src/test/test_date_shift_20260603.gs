/**
 * 日付前倒し再発防止テスト
 */

function test_parseDate_stringYmd_keepsSameCalendarDate_20260603_() {
  const d = parseDate_('2026/06/03');
  assertEquals_(2026, d.getFullYear(), '年');
  assertEquals_(5, d.getMonth(), '月は0始まり');
  assertEquals_(3, d.getDate(), '日');
  assertEquals_(12, d.getHours(), 'タイムゾーンずれ回避のため12時固定');
}

function test_normalizeRecordForDb_dateString_keepsSameCalendarDate_20260603_() {
  const record = makeTradeRecord_({
    約定日: '2026/06/03',
    受渡日: '2026/06/04',
    銘柄名: 'DATE_FIX_20260603'
  });

  const dbRecord = normalizeRecordForDb_(record, {
    importId: 'import_test',
    sourceName: 'date_test',
    sourceRowNo: 1,
    now: new Date('2026-06-03T00:00:00Z')
  });

  assertEquals_(2026, dbRecord['約定日'].getFullYear(), '約定日 年');
  assertEquals_(5, dbRecord['約定日'].getMonth(), '約定日 月は0始まり');
  assertEquals_(3, dbRecord['約定日'].getDate(), '約定日 日');
  assertEquals_(2026, dbRecord['受渡日'].getFullYear(), '受渡日 年');
  assertEquals_(5, dbRecord['受渡日'].getMonth(), '受渡日 月は0始まり');
  assertEquals_(4, dbRecord['受渡日'].getDate(), '受渡日 日');
}
