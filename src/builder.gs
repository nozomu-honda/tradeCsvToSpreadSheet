function buildTradeRows_(records) {
  const rows = [];
  const stateBySymbol = {};
  let prevSymbol = null;

  records.forEach(r => {
    const symbol = r['銘柄名'];

    if (prevSymbol !== null && prevSymbol !== symbol) {
      rows.push(new Array(TRADE_HEADERS.length).fill(''));
    }
    prevSymbol = symbol;

    const st = stateBySymbol[symbol] || { holding: 0, balance: 0 };

    const qty = r['数量'];
    const price = r['単価'];
    const amount = r['受渡金額/決済損益'];
    const fee = r['手数料（税込）'];
    const tx = r['取引区分'];
    const product = r['商品'];

    const prevHolding = st.holding;
    const prevBalance = st.balance;

    let holdingDelta = 0;
    if (['現物買付', '現物再投', '入庫（増減資）'].includes(tx)) {
      holdingDelta = qty;
    } else if (['現物売却', '現物買取'].includes(tx)) {
      holdingDelta = -qty;
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
    }

    if (['現物売却', '現物買取'].includes(tx) && prevHolding !== 0) {
      acquisitionPrice = (prevBalance / prevHolding) * qty;
    }

    if (['現物買付', '現物再投', '入庫（増減資）'].includes(tx)) {
      const tax = feeTax === '' ? 0 : feeTax;
      bookValue = amount - tax;
    } else if (['現物売却', '現物買取'].includes(tx) && acquisitionPrice !== '') {
      bookValue = -acquisitionPrice;
    }

    const symbolBalance = prevBalance + (bookValue === '' ? 0 : bookValue);

    if (['現物買付', '現物再投'].includes(tx) && prevHolding > 0 && holding !== 0) {
      avgUnitPrice = product === '投信'
        ? Math.ceil((symbolBalance / holding) * 10000)
        : Math.ceil(symbolBalance / holding);
    }

    if (sellNet !== '' && acquisitionPrice !== '') {
      realizedGain = sellNet - acquisitionPrice;
    }

    stateBySymbol[symbol] = { holding, balance: symbolBalance };

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
      displayValue_(r['レート']),
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
      ''
    ]);
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
    } else if (['現物売却', '入金（利金）', '入金（配当金）', '償還', '入金（振込）'].includes(tx)) {
      delta = amount;
    }

    runningBalance += delta;

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
         compareDate_(a['約定日'], b['約定日']);
}

function sortCashRows_(a, b) {
  return compareDate_(a['受渡日'], b['受渡日']) ||
         compareDate_(a['約定日'], b['約定日']) ||
         compareText_(a['銘柄名'], b['銘柄名']);
}