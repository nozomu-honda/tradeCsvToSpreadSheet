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
      avgUnitPrice: '',
      acquisitionCostUnknown: false
    };

    const qty = r['数量'];
    const price = r['単価'];
    const amount = r['受渡金額/決済損益'];
    const fee = r['手数料（税込）'];
    const rate = r['レート'];
    const tx = r['取引区分'];
    const product = r['商品'];
    const settlementCurrency = normalizeCurrency_(r['決済通貨']);
    const isPrincipalReturn = r['元本払戻金'] === true;
    const isRakutenUsStockRecord = r.__rakutenUsStockFeeTaxRequired === true;
    const rakutenUsSettlementAmountJpy = toOptionalNumber_(r.__rakutenUsStockSettlementAmountJpy);
    const priorAcquisitionCostUnknown = isRakutenUsStockRecord && st.acquisitionCostUnknown === true;

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

    const manualDomesticTax = r['国内消費税等（円）'];
    const rakutenUsFeeTaxRequired = r.__rakutenUsStockFeeTaxRequired === true;
    let feeTax = '';
    if (manualDomesticTax !== '' && manualDomesticTax !== null && manualDomesticTax !== undefined) {
      feeTax = manualDomesticTax;
    } else if (tx === '現物買付' && !rakutenUsFeeTaxRequired) {
      feeTax = Math.floor((fee / 1.1) * 0.1);
    } else if (tx === '現物再投') {
      feeTax = 0;
    }
    const rakutenUsFeeTaxUnavailable = r.__rakutenUsStockFeeTaxUnavailable === true;
    const rakutenUsBookValueUnavailable = r.__rakutenUsStockBookValueUnavailable === true;
    const rakutenUsTaxConversionUnavailable = r.__rakutenUsStockTaxConversionUnavailable === true;
    const rakutenUsSettlementAmountJpyUnavailable = r.__rakutenUsStockSettlementAmountJpyUnavailable === true;
    const currentAcquisitionCostUnknown = isRakutenUsStockRecord &&
      tx === '現物買付' && rakutenUsBookValueUnavailable;
    const acquisitionCostUnknownForRow = priorAcquisitionCostUnknown || currentAcquisitionCostUnknown;
    if (rakutenUsFeeTaxUnavailable && tx === '現物買付') {
      alerts.push(`簿価: 楽天米国株の手数料の消費税額が取得できません: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])}`);
    } else if (rakutenUsTaxConversionUnavailable && tx === '現物買付') {
      alerts.push(`簿価: 楽天米国株の円換算レートが取得できません: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])}`);
    } else if (rakutenUsSettlementAmountJpyUnavailable && tx === '現物買付') {
      alerts.push(`簿価: 楽天米国株の受渡金額［円］が取得できません: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])}`);
    }
    if (priorAcquisitionCostUnknown && ['現物買付', '現物売却'].includes(tx)) {
      alerts.push(`取得原価: 楽天米国株の取得原価が不明なため計算できません: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])}`);
    }

    let avgUnitPrice = '';
    let sellNet = '';
    let acquisitionPrice = '';
    let realizedGain = '';
    let bookValue = '';

    if (['現物売却', '現物買取'].includes(tx)) {
      if (product === '投信') {
        sellNet = qty * price / 10000;
      } else if (product === '外株') {
        if (rate && rate !== 0) {
          sellNet = qty * price * rate;
        } else {
          alerts.push(`手数料抜き売値: レート未入力: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])} / 商品: ${product}`);
          sellNet = qty * price;
        }
      } else {
        sellNet = qty * price;
      }
    } else if (tx === '償還') {
      if (prevHolding !== 0) {
        sellNet = qty * price;
      }
    } else if (tx === '強制償還（売）') {
      sellNet = amount;
    }

    if (acquisitionCostUnknownForRow && ['現物売却', '現物買取', '強制償還（売）'].includes(tx)) {
      acquisitionPrice = '';
    } else if (['現物売却', '現物買取', '強制償還（売）'].includes(tx)) {
      if (prevAvgUnitPrice !== '') {
        acquisitionPrice = product === '投信'
          ? prevAvgUnitPrice * qty / 10000
          : prevAvgUnitPrice * qty;
      } else {
        acquisitionPrice = '';
      }
    } else if (tx === '償還') {
      if (prevHolding !== 0) {
        if (prevAvgUnitPrice !== '') {
          acquisitionPrice = product === '投信'
            ? prevAvgUnitPrice * qty / 10000
            : prevAvgUnitPrice * qty;
        } else {
          acquisitionPrice = '';
        }
      }
    }

    if (isPrincipalReturn) {
      bookValue = '';
    } else if (acquisitionCostUnknownForRow && ['現物買付', '現物再投', '現物募集', '現物売却', '現物買取', '強制償還（売）'].includes(tx)) {
      bookValue = '';
    } else if (['現物買付', '現物再投', '現物募集'].includes(tx)) {
      const tax = feeTax === '' ? 0 : feeTax;

      if (isRakutenUsStockRecord) {
        bookValue = rakutenUsSettlementAmountJpy === ''
          ? ''
          : rakutenUsSettlementAmountJpy - tax;
      } else if (settlementCurrency && settlementCurrency !== 'JPY') {
        if (rate && rate !== 0) {
          bookValue = amount * rate - tax;
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

    } else if (tx === '入金（分配金）') {
      bookValue = '';

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

    } else if (['入庫（増減資）', '入金（利金）', '入金（配当金）'].includes(tx)) {
      bookValue = '';

    } else {
      alerts.push(`簿価: 対象外の取引区分: ${tx || '(空欄)'} / 銘柄名: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])}`);
    }

    bookValue = normalizeZero_(bookValue);

    let symbolBalance = prevBalance;
    if (isRakutenUsStockRecord && acquisitionCostUnknownForRow) {
      symbolBalance = '';
    } else if (['現物買付', '現物再投', '現物売却', '現物買取', '現物募集', '強制償還（売）'].includes(tx)) {
      symbolBalance = prevBalance + (bookValue === '' ? 0 : bookValue);
    } else if (tx === '償還') {
      symbolBalance = prevHolding === 0 ? prevBalance : prevBalance + (bookValue === '' ? 0 : bookValue);
    } else if (tx === '入金（分配金）') {
      symbolBalance = prevBalance;
    } else if (['株転換取得（買）', '入庫（増減資）', '入金（利金）', '入金（配当金）'].includes(tx)) {
      symbolBalance = prevBalance;
    } else {
      alerts.push(`銘柄ごとの残高: 対象外の取引区分: ${tx || '(空欄)'} / 銘柄名: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])}`);
    }

    symbolBalance = normalizeZero_(symbolBalance);

    if (holding > 0 && !acquisitionCostUnknownForRow) {
      if (product === '投信' && ['現物買付', '現物再投', '現物募集'].includes(tx)) {
        const balanceBase = prevBalance > 0
          ? (prevBalance + (bookValue === '' ? 0 : bookValue))
          : (bookValue === '' ? 0 : bookValue);
        avgUnitPrice = balanceBase / holding * 10000;
      } else if (product !== '投信' && ['現物買付', '現物再投', '現物募集', '入庫（増減資）', '株転換取得（買）'].includes(tx)) {
        const balanceBase = prevBalance > 0
          ? (prevBalance + (bookValue === '' ? 0 : bookValue))
          : (bookValue === '' ? 0 : bookValue);
        avgUnitPrice = balanceBase / holding;
      } else if (!['現物売却', '現物買取', '入庫（増減資）', '強制償還（売）', '償還', '入金（利金）', '入金（配当金）', '入金（分配金）', '株転換取得（買）'].includes(tx)) {
        alerts.push(`平均取得単価: 対象外の取引区分: ${tx || '(空欄)'} / 銘柄名: ${symbol || '(空欄)'} / 受渡日: ${formatDateForAlert_(r['受渡日'])}`);
      }
    }

    avgUnitPrice = normalizeZero_(avgUnitPrice);

    if (!acquisitionCostUnknownForRow && ['現物売却', '現物買取', '強制償還（売）'].includes(tx) && sellNet !== '' && acquisitionPrice !== '') {
      realizedGain = sellNet - acquisitionPrice;
    } else if (!acquisitionCostUnknownForRow && tx === '償還' && prevHolding !== 0 && sellNet !== '' && acquisitionPrice !== '') {
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
      displayValueKeepZero_(r['国内消費税等（円）']),
      displayValueKeepZero_(r['現地源泉税（円）']),
      displayValueKeepZero_(r['国内源泉所得税（円）']),
      displayValueKeepZero_(r['国内源泉地方税（円）']),
      displayNullableBooleanFlag_(r['元本払戻金']),
      displayValueKeepZero_(r['国内手数料（円）']),
      displayValueKeepZero_(r['現地手数料（円）']),
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

    const nextAcquisitionCostUnknown = isRakutenUsStockRecord &&
      acquisitionCostUnknownForRow && holding !== 0;
    stateBySymbol[symbol] = {
      holding: holding,
      balance: nextAcquisitionCostUnknown ? '' : symbolBalance,
      avgUnitPrice: nextAcquisitionCostUnknown
        ? ''
        : (avgUnitPrice !== '' ? avgUnitPrice : prevAvgUnitPrice),
      acquisitionCostUnknown: nextAcquisitionCostUnknown
    };
  });

  return rows;
}

function buildRakutenJapanStockRows_(records, alerts) {
  return buildTradeRows_(records, alerts).map(function(tradeRow) {
    const get = function(header) {
      const index = TRADE_HEADERS.indexOf(header);
      return index >= 0 ? tradeRow[index] : '';
    };

    const tx = text_(get('取引区分'));
    const row = [
      get('約定日'),
      get('受渡日'),
      get('銘柄コード'),
      get('銘柄名'),
      '',
      get('預り区分'),
      mapRakutenJapanOutputTradeCategory_(tx),
      mapRakutenJapanOutputSellBuy_(tx),
      '',
      '',
      get('数量'),
      get('単価'),
      get('国内手数料（円）'),
      get('国内消費税等（円）'),
      get('現地手数料（円）'),
      '',
      get('受渡金額/決済損益'),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      get('保有数'),
      get('手数料の消費税額'),
      get('平均取得単価'),
      get('手数料抜き売値'),
      get('取得価格'),
      get('売却損益'),
      get('簿価'),
      get('銘柄ごとの残高'),
      get('FX2の期末簿価'),
    ];

    return row.concat([tradeRow[TRADE_HEADERS.length] || '']);
  });
}

function mapRakutenJapanOutputTradeCategory_(tx) {
  if (tx === '現物買付' || tx === '現物売却') return '現物';
  if (tx === '入庫（増減資）') return '';
  return tx || '';
}

function mapRakutenJapanOutputSellBuy_(tx) {
  if (tx === '現物買付') return '買付';
  if (tx === '現物売却') return '売付';
  if (tx === '入庫（増減資）') return '入庫';
  return tx || '';
}

function buildRakutenUsStockRows_(records, alerts) {
  const calculationRecords = prepareRakutenUsStockRecordsForTradeCalculation_(records);
  const state = { index: 0 };
  return buildTradeRows_(calculationRecords, alerts).map(function(tradeRow) {
    const sourceRecord = takeSourceRecordForOutputRow_(records, tradeRow, state);
    const sourceDb = getRakutenDbSource_(sourceRecord);
    const get = function(header) {
      const index = TRADE_HEADERS.indexOf(header);
      return index >= 0 ? tradeRow[index] : '';
    };

    const tx = text_(get('取引区分'));
    const qty = get('数量');
    const price = get('単価');
    const rate = get('レート');
    const amount = get('受渡金額/決済損益');
    const settlementCurrency = normalizeCurrency_(get('決済通貨'));
    const allowLegacyUsdToJpyFallback = !sourceRecord || !sourceRecord.__rakutenDb;
    const settlementAmounts = getRakutenUsOutputSettlementAmounts_(
      amount,
      rate,
      settlementCurrency,
      sourceDb.netAmount,
      allowLegacyUsdToJpyFallback
    );
    const feeUsd = get('現地手数料（円）');
    const domesticFeeJpy = multiplyOptionalNumbers_(feeUsd, rate);
    const domesticTaxJpy = get('国内消費税等（円）');
    const sourceTaxUsd = getRakutenSourceNumber_(sourceDb, 'tax');
    const grossAmountUsd = getRakutenSourceNumber_(sourceDb, 'grossAmount');
    const isDividend = tx === '入金（配当金）' || tx === '入金（分配金）';
    const calculatedDomesticTaxJpy = !isDividend ? multiplyOptionalNumbers_(sourceTaxUsd, rate) : '';

    const row = [
      get('約定日'),
      get('受渡日'),
      get('銘柄コード'),
      get('銘柄名'),
      get('預り区分'),
      mapRakutenUsOutputTradeCategory_(tx),
      mapRakutenUsOutputSellBuy_(tx),
      '',
      '',
      get('決済通貨'),
      qty,
      price,
      grossAmountUsd !== '' ? grossAmountUsd : multiplyOptionalNumbers_(qty, price),
      rate,
      feeUsd,
      sourceTaxUsd,
      settlementAmounts.usd,
      settlementAmounts.jpy,
      get('現地源泉税（円）'),
      get('国内源泉所得税（円）'),
      get('保有数'),
      domesticFeeJpy,
      domesticTaxJpy !== '' ? domesticTaxJpy : calculatedDomesticTaxJpy,
      get('平均取得単価'),
      get('手数料抜き売値'),
      get('取得価格'),
      get('売却損益'),
      get('簿価'),
      get('銘柄ごとの残高'),
      get('FX2の期末簿価'),
    ];

    return row.concat([tradeRow[TRADE_HEADERS.length] || '']);
  });
}

function prepareRakutenUsStockRecordsForTradeCalculation_(records) {
  return records.map(function(record) {
    const sourceDb = getRakutenDbSource_(record);
    if (text_(sourceDb.sourceType) !== 'rakuten_us_stock') {
      return record;
    }

    const prepared = {};
    Object.keys(record).forEach(function(key) {
      prepared[key] = record[key];
    });

    const explicitTaxJpy = toOptionalNumber_(record['国内消費税等（円）']);
    const sourceTaxUsd = getRakutenSourceNumber_(sourceDb, 'tax');
    const resolvedTaxJpy = explicitTaxJpy !== ''
      ? explicitTaxJpy
        : sourceTaxUsd === 0
          ? 0
          : multiplyOptionalNumbers_(sourceTaxUsd, record['レート']);
    const rate = toOptionalNumber_(record['レート']);
    const settlementCurrency = normalizeCurrency_(record['決済通貨']);
    const sourceSettlementAmountJpy = toOptionalNumber_(sourceDb.netAmount);
    const settlementAmountJpy = sourceSettlementAmountJpy !== ''
      ? sourceSettlementAmountJpy
      : (settlementCurrency === 'JPY'
        ? toOptionalNumber_(record['受渡金額/決済損益'])
        : '');
    prepared['国内消費税等（円）'] = resolvedTaxJpy;
    prepared.__rakutenUsStockSettlementAmountJpy = settlementAmountJpy;
    prepared.__rakutenUsStockSettlementAmountJpyUnavailable = settlementAmountJpy === '';
    prepared.__rakutenUsStockFeeTaxRequired = true;
    prepared.__rakutenUsStockFeeTaxUnavailable = explicitTaxJpy === '' && sourceTaxUsd === '';
    prepared.__rakutenUsStockTaxConversionUnavailable =
      explicitTaxJpy === '' &&
      sourceTaxUsd !== '' &&
      sourceTaxUsd !== 0 &&
      (rate === '' || rate === 0);
    prepared.__rakutenUsStockBookValueUnavailable =
      resolvedTaxJpy === '' ||
      settlementAmountJpy === '';
    return prepared;
  });
}

function mapRakutenUsOutputTradeCategory_(tx) {
  if (tx === '現物買付' || tx === '現物売却') return '現物';
  return tx || '';
}

function mapRakutenUsOutputSellBuy_(tx) {
  if (tx === '現物買付') return '買付';
  if (tx === '現物売却') return '売付';
  return tx || '';
}

function getRakutenUsOutputSettlementAmounts_(amount, rate, settlementCurrency, settlementAmountJpy, allowLegacyUsdToJpyFallback) {
  const amountNumber = toOptionalNumber_(amount);
  const rateNumber = toOptionalNumber_(rate);
  const currency = normalizeCurrency_(settlementCurrency);
  const result = { usd: '', jpy: '' };

  if (amountNumber === '') {
    return result;
  }

  if (currency === 'JPY') {
    result.jpy = amountNumber;
    if (rateNumber !== '' && rateNumber !== 0) {
      result.usd = normalizeZero_(amountNumber / rateNumber);
    }
    return result;
  }

  result.usd = amountNumber;
  const originalSettlementAmountJpy = toOptionalNumber_(settlementAmountJpy);
  if (originalSettlementAmountJpy !== '') {
    result.jpy = originalSettlementAmountJpy;
  } else if (allowLegacyUsdToJpyFallback && rateNumber !== '' && rateNumber !== 0) {
    // Metadataなしの旧base record出力だけは、従来の表示互換を維持する。
    result.jpy = normalizeZero_(amountNumber * rateNumber);
  }
  return result;
}

function multiplyOptionalNumbers_(left, right) {
  const leftNumber = toOptionalNumber_(left);
  const rightNumber = toOptionalNumber_(right);
  if (leftNumber === '' || rightNumber === '') return '';
  return normalizeZero_(leftNumber * rightNumber);
}

function buildRakutenFundRows_(records, alerts) {
  const state = { index: 0 };
  return buildTradeRows_(records, alerts).map(function(tradeRow) {
    const sourceRecord = takeSourceRecordForOutputRow_(records, tradeRow, state);
    const sourceDb = getRakutenDbSource_(sourceRecord);
    const get = function(header) {
      const index = TRADE_HEADERS.indexOf(header);
      return index >= 0 ? tradeRow[index] : '';
    };

    const tx = text_(get('取引区分'));
    const sourceType = text_(sourceDb.sourceType);
    const isDividendDistribution = sourceType === 'rakuten_dividend' && tx === '入金（分配金）';
    const distributionType = sourceType === 'rakuten_fund'
      ? text_(sourceDb.rawProduct)
      : (isDividendDistribution ? '分配金' : '');
    const receiptAmount = sourceType === 'rakuten_fund' || isDividendDistribution
      ? getRakutenSourceNumber_(sourceDb, 'grossAmount')
      : '';
    const row = [
      get('約定日'),
      get('受渡日'),
      get('銘柄名'),
      distributionType,
      get('預り区分'),
      mapRakutenFundOutputTrade_(tx),
      get('摘要'),
      get('数量'),
      get('単価'),
      get('手数料（税込）'),
      get('レート'),
      receiptAmount,
      get('受渡金額/決済損益'),
      get('決済通貨'),
      get('国内手数料（円）'),
      get('国内消費税等（円）'),
      get('国内源泉所得税（円）'),
      get('元本払戻金'),
      get('保有数'),
      get('手数料の消費税額'),
      get('平均取得単価'),
      get('手数料抜き売値'),
      get('取得価格'),
      get('売却損益'),
      get('簿価'),
      get('銘柄ごとの残高'),
      get('FX2の期末簿価'),
    ];

    return row.concat([tradeRow[TRADE_HEADERS.length] || '']);
  });
}

function mapRakutenFundOutputTrade_(tx) {
  if (tx === '現物買付') return '買付';
  if (tx === '現物買取') return '解約';
  if (tx === '現物再投') return '再投資';
  return tx || '';
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
    if (['現物買付', '現物再投', '出金（振込）', '現物募集', '為替買付'].includes(tx)) {
      delta = -amount;
    } else if (['現物売却', '現物買取', '入金（利金）', '入金（配当金）', '償還', '入金（振込）', '入金（分配金）', '為替売却'].includes(tx)) {
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
      displayValueKeepZero_(r['国内消費税等（円）']),
      displayValueKeepZero_(r['現地源泉税（円）']),
      displayValueKeepZero_(r['国内源泉所得税（円）']),
      displayValueKeepZero_(r['国内源泉地方税（円）']),
      displayNullableBooleanFlag_(r['元本払戻金']),
      displayValueKeepZero_(r['国内手数料（円）']),
      displayValueKeepZero_(r['現地手数料（円）']),
      runningBalance,
      monthEndBalance
    ]);
  }

  return rows;
}

function buildRakutenCashJpyRows_(records) {
  return buildCashRows_(records).map(function(cashRow) {
    const get = function(header) {
      const index = CASH_HEADERS.indexOf(header);
      return index >= 0 ? cashRow[index] : '';
    };

    const product = text_(get('商品'));
    const tx = text_(get('取引区分'));
    const amount = get('受渡金額/決済損益');
    const isDeposit = tx === '入金（振込）';
    const isWithdrawal = tx === '出金（振込）';

    return [
      get('約定日'),
      get('受渡日'),
      product,
      get('銘柄コード'),
      get('銘柄名'),
      tx,
      get('決済通貨'),
      product === '株式' ? amount : '',
      product === '外株' ? amount : '',
      product === '投信' ? amount : '',
      isDeposit ? amount : '',
      isWithdrawal ? amount : '',
      isDeposit || isWithdrawal ? get('摘要') : '',
      '',
      get('残高'),
      get('月次残高'),
    ];
  });
}

function buildRakutenCashUsdRows_(records) {
  return buildCashRows_(records).map(function(cashRow, index) {
    const sourceDb = getRakutenDbSource_(records[index]);
    const get = function(header) {
      const index = CASH_HEADERS.indexOf(header);
      return index >= 0 ? cashRow[index] : '';
    };

    const product = text_(get('商品'));
    const tx = text_(get('取引区分'));
    const amount = get('受渡金額/決済損益');
    const isDividend = tx === '入金（配当金）' || tx === '入金（分配金）';
    const dividendGrossAmount = isDividend ? getRakutenSourceNumber_(sourceDb, 'grossAmount') : '';
    const dividendTaxAmount = isDividend ? getRakutenSourceNumber_(sourceDb, 'tax') : '';

    return [
      get('約定日'),
      get('受渡日'),
      product,
      get('銘柄コード'),
      get('銘柄名'),
      get('預り区分'),
      tx,
      get('発行通貨') || get('決済通貨'),
      get('決済通貨'),
      product === '外株' && !isDividend ? amount : '',
      product === '投信' && !isDividend ? amount : '',
      isDividend ? amount : '',
      dividendGrossAmount,
      dividendTaxAmount,
      isDividend ? get('レート') : '',
      isDividend ? get('現地源泉税（円）') : '',
      isDividend ? get('国内源泉所得税（円）') : '',
      amount,
      get('残高'),
      get('月次残高'),
    ];
  });
}

function takeSourceRecordForOutputRow_(records, outputRow, state) {
  if (isBlankOutputRow_(outputRow)) {
    return null;
  }
  const record = records[state.index] || null;
  state.index++;
  return record;
}

function isBlankOutputRow_(row) {
  return (row || []).every(function(value) {
    return value === '' || value === null || value === undefined;
  });
}

function getRakutenDbSource_(record) {
  return record && record.__rakutenDb ? record.__rakutenDb : {};
}

function getRakutenSourceNumber_(sourceDb, key) {
  if (!sourceDb || !sourceDb.hasOwnProperty(key)) {
    return '';
  }
  return toOptionalNumber_(sourceDb[key]);
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
