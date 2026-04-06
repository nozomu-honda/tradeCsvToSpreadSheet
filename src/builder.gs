function buildTradeRows_(records, alerts) {
  const rows = [];
  const stateBySymbol = {};
  let prevSymbol = null;

  records.forEach((r, index) => {
    const symbol = r['銘柄名'];

    if (prevSymbol !== null && prevSymbol !== symbol) {
      rows.push(makeBlankTradeRow_());
    }
    prevSymbol = symbol;

    const st = stateBySymbol[symbol] || {
      holding: 0,
      balance: 0,
      avgUnitPrice: ''
    };

    const qty = r['数量'];
    const price = r['単価'];
    const amount = r['受渡金額/決済損益'];
    const fee = r['手数料（税込）'];
    const rate = r['レート'];
    const tx = r['取引区分'];
    const product = r['商品'];
    const settlementCurrency = normalizeCurrency_(r['決済通貨']);

    const prevHolding = st.holding;
    const prevBalance = st.balance;
    const prevAvgUnitPrice = st.avgUnitPrice;

    let holdingDelta = 0;
    if (['現物買付', '現物再投', '入庫（増減資）', '現物募集', '株転換取得（買）'].includes(tx)) {
      holdingDelta = qty;
    } else if (['現物売却', '現物買取', '強制償還（売）'].includes(tx)) {
      holdingDelta = -qty;
    } else if (tx === '償還') {
      holdingDelta = prevHolding === 0 ? 0 : -qty;
    } else if (['入金（利金）', '入金（配当金）', '入金（分配金）'].includes(tx)) {
      holdingDelta = 0;
    } else {
      alerts.push(`保有数: 対象外の取引区分: ${tx || '(空欄)'} / 銘柄名: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])}`);
    }

    const holding = prevHolding + holdingDelta;

    let feeTax = '';
    if (tx === '現物買付') {
      feeTax = Math.floor((fee / 1.1) * 0.1);
    } else if (tx === '現物再投') {
      feeTax = 0;
    }

    let avgUnitPrice = '';
    let sellNet = '';
    let acquisitionPrice = '';
    let realizedGain = '';
    let bookValue = '';

    if (['現物売却', '現物買取'].includes(tx)) {
      sellNet = product === '投信' ? qty * price / 10000 : qty * price;
    } else if (tx === '償還') {
      if (prevHolding !== 0) {
        sellNet = product === '投信' ? qty * price / 10000 : qty * price;
      }
    } else if (tx === '強制償還（売）') {
      sellNet = amount;
    }

    if (['現物売却', '現物買取', '強制償還（売）'].includes(tx)) {
      if (prevAvgUnitPrice !== '') {
        acquisitionPrice = product === '投信' ? prevAvgUnitPrice * qty / 10000 : prevAvgUnitPrice * qty;
      } else {
        acquisitionPrice = '';
      }
    } else if (tx === '償還') {
      if (prevHolding !== 0) {
        if (prevAvgUnitPrice !== '') {
          acquisitionPrice = product === '投信' ? prevAvgUnitPrice * qty / 10000 : prevAvgUnitPrice * qty;
        } else {
          acquisitionPrice = '';
        }
      }
    }

    if (['現物買付', '現物再投', '現物募集'].includes(tx)) {
      const tax = feeTax === '' ? 0 : feeTax;
      if (settlementCurrency && settlementCurrency !== 'JPY') {
        if (rate && rate !== 0) {
          bookValue = amount * rate - tax * rate;
        } else {
          alerts.push(`簿価: レート未入力: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])} / 決済通貨: ${settlementCurrency}`);
          bookValue = amount - tax;
        }
      } else {
        bookValue = amount - tax;
      }

    } else if (tx === '株転換取得（買）') {
      if (settlementCurrency && settlementCurrency !== 'JPY') {
        if (rate && rate !== 0) {
          bookValue = amount * rate;
        } else {
          alerts.push(`簿価: レート未入力: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])} / 決済通貨: ${settlementCurrency}`);
          bookValue = amount;
        }
      } else {
        bookValue = amount;
      }

    } else if (['現物売却', '現物買取', '強制償還（売）'].includes(tx)) {
      if (acquisitionPrice !== '') {
        bookValue = -acquisitionPrice;
      } else {
        bookValue = '';
        alerts.push(`簿価: 平均取得単価が未計算: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])} / 取引区分: ${tx}`);
      }

    } else if (tx === '償還') {
      if (prevHolding === 0) {
        bookValue = amount;
      } else if (acquisitionPrice !== '') {
        bookValue = -acquisitionPrice;
      } else {
        bookValue = '';
        alerts.push(`簿価: 平均取得単価が未計算: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])} / 取引区分: ${tx}`);
      }

    } else if (['入庫（増減資）', '入金（利金）', '入金（配当金）', '入金（分配金）'].includes(tx)) {
      bookValue = '';

    } else {
      alerts.push(`簿価: 対象外の取引区分: ${tx || '(空欄)'} / 銘柄名: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])}`);
    }

    bookValue = normalizeZero_(bookValue);

    let symbolBalance = prevBalance;
    if (['現物買付', '現物再投', '現物売却', '現物買取', '現物募集', '強制償還（売）'].includes(tx)) {
      symbolBalance = prevBalance + (bookValue === '' ? 0 : bookValue);
    } else if (tx === '償還') {
      symbolBalance = prevHolding === 0 ? prevBalance : prevBalance + (bookValue === '' ? 0 : bookValue);
    } else if (['株転換取得（買）', '入庫（増減資）', '入金（利金）', '入金（配当金）', '入金（分配金）'].includes(tx)) {
      symbolBalance = prevBalance;
    } else {
      alerts.push(`銘柄ごとの残高: 対象外の取引区分: ${tx || '(空欄)'} / 銘柄名: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])}`);
    }

    symbolBalance = normalizeZero_(symbolBalance);

    if (['現物買付', '現物再投', '現物募集', '株転換取得（買）'].includes(tx) && holding > 0) {
      if (prevBalance > 0) {
        avgUnitPrice = (prevBalance + (bookValue === '' ? 0 : bookValue)) / holding;
      } else {
        avgUnitPrice = (bookValue === '' ? 0 : bookValue) / holding;
      }
    } else if (['現物売却', '現物買取', '入庫（増減資）', '強制償還（売）', '償還', '入金（利金）', '入金（配当金）', '入金（分配金）'].includes(tx)) {
      avgUnitPrice = '';
    } else {
      alerts.push(`平均取得単価: 対象外の取引区分: ${tx || '(空欄)'} / 銘柄名: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])}`);
    }

    avgUnitPrice = normalizeZero_(avgUnitPrice);

    if (['現物売却', '現物買取', '強制償還（売）'].includes(tx) && sellNet !== '' && acquisitionPrice !== '') {
      realizedGain = sellNet - acquisitionPrice;
    } else if (tx === '償還' && prevHolding !== 0 && sellNet !== '' && acquisitionPrice !== '') {
      realizedGain = sellNet - acquisitionPrice;
    }

    realizedGain = normalizeZero_(realizedGain);
    acquisitionPrice = normalizeZero_(acquisitionPrice);
    sellNet = normalizeZero_(sellNet);

    const lastTradeOfSymbol =
      index === records.length - 1 ||
      records[index + 1]['銘柄名'] !== symbol;

    rows.push([
      r['約定日'],
      r['受渡日'],
      r['商品'],
      r['銘柄コード'],
      r['銘柄名'],
      r['摘要'],
      r['取引区分'],
      r['預り区分'],
      r['発行通貨'],
      displayValue_(qty),
      displayValue_(price),
      displayValue_(amount),
      displayValueKeepZero_(fee),
      displayValue_(rate),
      r['決済通貨'],
      displayValue_(r['売買損益（円）']),
      holding,
      feeTax,
      avgUnitPrice,
      sellNet,
      acquisitionPrice,
      realizedGain,
      bookValue,
      symbolBalance,
      '',
      lastTradeOfSymbol && holding > 0 ? 'YES' : ''
    ]);

    stateBySymbol[symbol] = {
      holding,
      balance: symbolBalance,
      avgUnitPrice: avgUnitPrice !== '' ? avgUnitPrice : prevAvgUnitPrice
    };
  });

  return rows;
}

function buildCashRows_(records) {
  const rows = [];
  let runningBalance = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const next = records[i + 1] || null;

    const amount = r['受渡金額/決済損益'];
    const tx = r['取引区分'];

    let delta = 0;
    if (['現物買付', '現物再投', '出金（振込）', '現物募集'].includes(tx)) {
      delta = -amount;
    } else if (['現物売却', '入金（利金）', '入金（配当金）', '償還', '入金（振込）', '入金（分配金）'].includes(tx)) {
      delta = amount;
    }

    runningBalance += delta;
    runningBalance = normalizeZero_(runningBalance);

    const monthEndBalance =
      !next || !sameYearMonth_(r['受渡日'], next['受渡日']) ? runningBalance : '';

    rows.push([
      r['約定日'],
      r['受渡日'],
      r['商品'],
      r['銘柄コード'],
      r['銘柄名'],
      r['摘要'],
      r['取引区分'],
      r['預り区分'],
      r['発行通貨'],
      displayValue_(r['数量']),
      displayValue_(r['単価']),
      displayValue_(amount),
      displayValueKeepZero_(r['手数料（税込）']),
      displayValue_(r['レート']),
      r['決済通貨'],
      displayValue_(r['売買損益（円）']),
      runningBalance,
      monthEndBalance
    ]);
  }

  return rows;
}

function sortTradeRows_(a, b) {
  return compareText_(a['商品'], b['商品']) ||
         compareText_(a['銘柄名'], b['銘柄名']) ||
         compareDate_(a['受渡日'], b['受渡日']) ||
         compareDate_(a['約定日'], b['約定日']) ||
         compareTradePriority_(a['取引区分'], b['取引区分']);
}

function sortCashRows_(a, b) {
  return compareDate_(a['受渡日'], b['受渡日']) ||
         compareDate_(a['約定日'], b['約定日']) ||
         compareText_(a['銘柄名'], b['銘柄名']);
}

function compareTradePriority_(a, b) {
  const priority = {
    '現物買付': 1,
    '現物再投': 2,
    '現物募集': 3,
    '株転換取得（買）': 4,
    '入庫（増減資）': 5,
    '現物売却': 6,
    '現物買取': 7,
    '強制償還（売）': 8,
    '償還': 9,
    '入金（利金）': 10,
    '入金（配当金）': 11,
    '入金（分配金）': 12
  };

  const pa = priority[a] || 999;
  const pb = priority[b] || 999;
  return pa - pb;
}
function makeBlankTradeRow_() {
  return new Array(TRADE_HEADERS.length + 1).fill('');
}
