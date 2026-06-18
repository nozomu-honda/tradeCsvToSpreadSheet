/**
 * Apps Script テストランナー
 * ファイルを分割しても、Apps Script 上では同一グローバルで動作します。
 */

const CORE_TESTS_ = [
  test_averageUnitPrice_keepsDecimal_,
  test_bookValue_usesAcquisitionPrice_,
  test_sellWithoutAvg_addsAlert_,
  test_sortTradeRows_usesPriority_,
  test_buildTradeRows_avgUnitPrice_updatesOnStockConversionBuy_20260526_,
  test_forcedRedemptionSell_updatesHoldingAndBookValue_,
  test_redemption_tradeRowAndCashRow_withNoPreviousHolding_,
  test_redemption_tradeRowAndCashRow_withPreviousHolding_,
  test_manualDomesticTax_overridesFeeTax_,
  test_collectInputAlerts_supportedForeignBond_,
  test_collectInputAlerts_supportedProductAndCurrency_doNothing_,
  test_collectInputAlerts_unsupportedProduct_,
  test_collectInputAlerts_unsupportedSettlementCurrency_,
  test_readInputRecords_preambleBeforeHeader_ok_,
  test_readInputRecords_detailRowBeforeHeader_throws_,
  test_readInputRecords_headerRowAppearsInMiddle_,
  test_readInputRecords_optionalTaxColumns_,
  test_readInputRecords_optionalTaxHeaderNameMismatch_throws_,
  test_holdingZero_and_balanceZero_,
  test_lastTradeHighlightFlag_,
  test_buildCashRows_runningBalance_,
  test_normalizeZero_,
  test_buildRowHash_sameRecord_sameHash_,
  test_buildRowHash_differentRecord_differentHash_,
  test_normalizeRecordForDb_setsMetadata_,
  test_normalizeRakutenRecordForDb_mapsDividendManualColumns_20260618_,
  test_dbRecordToRow_mapsHeaders_,
  test_dbTargets_defaultSelection_,
  test_getResetDbTargetList_includesHiddenTargets_20260616_,
  test_appendRecordsToDb_writesOnlySelectedDb_,
  test_listRecentImports_returnsOnlySelectedDbLogs_,
  test_rollbackImport_marksImportInactive_,
  test_rollbackImport_setsRolledBackAt_,
  test_rollbackImport_twice_throws_,
  test_resetDbData_resetsOnlySelectedDb_,
  test_resetDbData_recreatesSheetsAndClearsFormats_,
  test_rakutenDb_usesRakutenHeadersAndReadsAsBaseRecord_20260617_,
  test_rakutenDb_existingOldHeaderWithData_throwsBeforeHeaderRewrite_20260617_,
  test_rakutenDb_rollback_marksOnlyTargetImportInactive_20260617_,
  test_readInputRecords_manualColumns_20260511_,
  test_readInputRecords_manualColumnHeaderMismatch_20260511_,
  test_buildTradeRows_foreignStockSellNet_usesRate_20260511_,
  test_buildTradeRows_bookValue_foreignBuy_minusFeeTaxOnly_20260529_,
  test_buildTradeRows_avgUnitPrice_updatesOnStockTransferIn_20260511_,
  test_buildTradeRows_avgUnitPrice_updatesOnFundOffering_20260526_,
  test_buildTradeRows_principalReturn_distributionDoesNotChangeBalance_20260511_,
  test_buildTradeRows_distributionDoesNotChangeBalance_20260515_,
  test_buildRowHash_changesWhenManualColumnsChange_20260511_,
  test_findInputSheetByHeader_singleCandidate_,
  test_findInputSheetByHeader_noCandidate_throws_,
  test_findInputSheetByHeader_multipleCandidates_throws_,
  test_createSpreadsheetFromSourceSpreadsheetUsingDb_readsDetectedSheet_,
  test_buildRowsWithAdditionalManualHeaders_appendsInSpecifiedOrder_,
  test_validateRequiredManualInputsOnSheet_requiresForeignStockManualInputs_,
  test_validateRequiredManualInputsOnSheet_allowsWhenForeignStockManualInputsFilled_,
  test_createStagingSpreadsheetFromSourceSpreadsheet_createsSingleSheet_,
  test_buildOutputSheetsFromDbRecords_splitsIntoSixSheets_,
  test_shouldSkipRequiredManualValidationForTarget_testDb_true_,
  test_shouldSkipRequiredManualValidationForTarget_normalDb_false_,
  test_createSpreadsheetFromSourceSpreadsheetUsingDb_testDb_skipsManualValidation_,
  test_applyStagingManualHighlights_fundBuyAndReinvest_20260529_,
  test_detectInputSourceTypeFromRows_rakutenJapanStock_20260615_,
  test_detectInputSourceTypeFromRows_rakutenUsStock_20260615_,
  test_normalizeRakutenJapanStockRowsToRecords_buy_20260615_,
  test_normalizeRakutenUsStockRowsToRecords_yenSettlement_20260615_,
  test_routeTargetDbKeyBySource_rakuten_20260615_,
  test_detectInputSourceTypeFromRows_rakutenFund_20260616_,
  test_normalizeRakutenFundRowsToRecords_buyAndSell_20260616_,
  test_detectInputSourceTypeFromRows_rakutenDividend_20260616_,
  test_normalizeRakutenDividendRowsToRecords_usStockDividend_20260616_,
  test_normalizeRakutenDividendRowsToRecords_requiresManualHeaders_20260618_,
  test_normalizeRakutenDividendRowsToRecords_requiresRateForForeignCurrency_20260618_,
  test_detectInputSourceTypeFromRows_rakutenCash_20260616_,
  test_normalizeRakutenCashRowsToRecords_depositAndWithdrawal_20260616_,
  test_rakutenDbHeaders_includeDividendManualColumns_20260617_,
];

const FULL_ONLY_TESTS_ = [
  test_writeSheet_japanStockHiddenColumns_,
  test_writeSheet_usStockHiddenColumns_,
  test_writeSheet_foreignBondHiddenColumns_,
  test_writeSheet_fundHiddenColumns_,
  test_writeSheet_tradeConditionalFormatRules_,
  test_writeSheet_averageUnitPriceNumberFormat_,
];

function runSmokeTests() {
  return runSelectedTests_(CORE_TESTS_, '軽い確認テスト');
}

function runAllTests() {
  return runSelectedTests_(CORE_TESTS_.concat(FULL_ONLY_TESTS_), 'フルテスト');
}

function runSelectedTests_(tests, label) {
  ensureManagedScriptPropertiesIfAvailable_();

  const results = [];
  let failed = 0;

  try {
    tests.forEach(function(fn) {
      try {
        fn();
        results.push('OK  ' + fn.name);
      } catch (e) {
        failed++;
        results.push('NG  ' + fn.name + ' :: ' + e.message);
      }
    });
  } finally {
    cleanupSuiteTempSpreadsheet_();
    cleanupSuiteTempDbSpreadsheets_();
  }

  const message = '[' + label + ']\n' + results.join('\n');
  Logger.log(message);
  if (failed > 0) throw new Error(message);
  return message;
}

function ensureManagedScriptPropertiesIfAvailable_() {
  if (typeof ensureManagedScriptProperties_ === 'function') {
    ensureManagedScriptProperties_();
  }
}
