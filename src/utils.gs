function compareText_(a, b) {
  return text_(a).localeCompare(text_(b), 'ja');
}

function compareDate_(a, b) {
  const ta = a instanceof Date ? a.getTime() : 0;
  const tb = b instanceof Date ? b.getTime() : 0;
  return ta - tb;
}

function parseDate_(v) {
  if (v instanceof Date) return v;
  const s = text_(v);
  if (!s) return '';

  const normalized = s
    .replace(/年/g, '/')
    .replace(/月/g, '/')
    .replace(/日/g, '')
    .replace(/\./g, '/')
    .replace(/-/g, '/');

  const d = new Date(normalized);
  return isNaN(d.getTime()) ? '' : d;
}

function normalizeCurrency_(v) {
  const s = text_(v).toUpperCase();
  if (s === '円') return 'JPY';
  if (s === 'ドル') return 'USD';
  if (s === 'ＵＳＤ') return 'USD';
  if (s === 'ＵＳドル') return 'USD';
  return s;
}

function normalizeZero_(value) {
  if (value === '' || value === null || value === undefined) return value;
  if (Object.is(value, -0)) return 0;
  if (Math.abs(value) < 1e-9) return 0;
  return value;
}

function toNumber_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/,/g, '').trim();
  if (!s) return 0;
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function toOptionalNumber_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  const s = String(v).replace(/,/g, '').trim();
  if (!s) return '';
  const n = Number(s);
  return isNaN(n) ? '' : n;
}

function toNullableBooleanFlag_(v, label) {
  if (v === '' || v === null || v === undefined || v === false) return '';
  if (v === true) return true;

  if (typeof v === 'number') {
    if (v === 0) return '';
    if (v === 1) return true;
  }

  const raw = String(v)
    .replace(/\u00A0/g, ' ')   // NBSP
    .replace(/\u200B/g, '')    // zero-width space
    .replace(/\uFEFF/g, '')    // BOM
    .replace(/\u3000/g, ' ')   // 全角スペース
    .trim();

  if (!raw) return '';

  const upper = raw.toUpperCase();

  if (raw === '0' || raw === 'FALSE' || upper === 'FALSE') return '';
  if (raw === '1' || raw === 'TRUE' || upper === 'TRUE') return true;

  throw new Error(
    (label || 'フラグ') +
    ' は空欄または1を入力してください。' +
    ' actual=' + JSON.stringify(v) +
    ' normalized=' + JSON.stringify(raw) +
    ' type=' + (typeof v)
  );
}

function displayNullableBooleanFlag_(v) {
  return v === true ? 1 : '';
}

function text_(v) {
  return String(v || '').trim();
}

function displayValue_(n) {
  return n === 0 ? '' : n;
}

function displayValueKeepZero_(n) {
  return n;
}

function sameYearMonth_(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isEmptyRow_(row) {
  return row.every(function(v) {
    return v === '' || v === null || v === undefined;
  });
}

function padRows_(rows) {
  const maxCols = Math.max.apply(null, rows.map(function(r) {
    return r.length;
  }));

  return rows.map(function(row) {
    const newRow = row.slice();
    while (newRow.length < maxCols) newRow.push('');
    return newRow;
  });
}

function looksLikeHtml_(text) {
  if (!text) return false;
  const head = String(text).slice(0, 500).toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
}

function hasCsvLikeHeader_(text) {
  if (!text) return false;
  const head = String(text).slice(0, 3000);
  return head.includes('約定日') || head.includes('受渡日') || head.includes('取引区分');
}

function columnToLetter_(column) {
  let temp = '';
  let letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function formatDateForAlert_(dateValue) {
  if (!(dateValue instanceof Date)) return '(日付なし)';
  return Utilities.formatDate(
    dateValue,
    Session.getScriptTimeZone() || 'Asia/Tokyo',
    'yyyy/MM/dd'
  );
}
