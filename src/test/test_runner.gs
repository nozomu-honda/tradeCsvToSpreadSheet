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
  test_normalizeRakutenRecordForDb_preservesDividendSourceColumns_20260709_,
  test_normalizeRakutenRecordForDb_preservesDividendPrincipalReturnViaDescription_20260710_,
  test_getDbSpreadsheetPropertyKey_skipsFixedSpreadsheetId_20260618_,
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
  test_rollbackImport_sameImportIdOnlySelectedDb_20260709_,
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
  test_buildOutputSheetsFromRecordsForTarget_dispatchesByDbKey_20260618_,
  test_buildRakutenOutputSheetsFromBaseRecords_writesJapanStockFinalLook_20260708_,
  test_buildRakutenOutputSheetsFromBaseRecords_writesUsStockFinalLook_20260708_,
  test_buildRakutenOutputSheetsFromBaseRecords_writesFundFinalLook_20260708_,
  test_buildRakutenOutputSheetsFromBaseRecords_writesCashFinalLook_20260708_,
  test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsDividendSourceColumns_20260709_,
  test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsFundDistributionSourceColumns_20260710_,
  test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsUsStockTaxSourceColumn_20260709_,
  test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsFundSourceColumns_20260709_,
  test_rakutenOutputCellComparison_fromRealLikeInputsThroughDb_20260709_,
  test_inspectE2EOutputSpreadsheet_rejectsInvalidPayload_20260710_,
  test_inspectE2EOutputSpreadsheet_rejectsUnsafeTargetsAndSheets_20260710_,
  test_inspectE2EOutputSpreadsheet_rowChecksRequireSameRow_20260710_,
  test_inspectE2EOutputSpreadsheet_findsValuesBeyondDefaultRange_20260710_,
  test_inspectE2EOutputSpreadsheet_returnsMinimalResults_20260710_,
  test_resetE2EOutputSpreadsheet_removesKnownOutputSheets_20260713_,
  test_resetE2EOutputSpreadsheet_keepsSpreadsheetNonEmpty_20260713_,
  test_resetE2EOutputSpreadsheet_rejectsUnsafeTargets_20260713_,
  test_getE2EOutputSheetNamesToReset_keepsInspectionAllowlist_20260713_,
  test_groupRakutenOutputRecords_splitsWithoutSpreadsheet_20260618_,
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
  test_normalizeRowsForImport_rakutenDividend_preservesSourceColumns_20260709_,
  test_normalizeRowsForImport_rakutenDividend_principalReturnFromMemo_20260710_,
  test_normalizeRakutenDividendRowsToRecords_requiresManualHeaders_20260618_,
  test_normalizeRakutenDividendRowsToRecords_requiresRateForForeignCurrency_20260618_,
  test_normalizeRowsForImport_rakutenDividend_warnsBlankManualTaxes_20260618_,
  test_normalizeRowsForImport_rakutenDividend_allowsZeroManualTaxes_20260618_,
  test_detectInputSourceTypeFromRows_rakutenCash_20260616_,
  test_normalizeRakutenCashRowsToRecords_depositAndWithdrawal_20260616_,
  test_rakutenDbHeaders_includeDividendManualColumns_20260617_,
  test_applyStagingManualHighlights_fundSellBuyBuybackAndReinvest_20260529_,
  test_parseDate_stringYmd_keepsSameCalendarDate_20260603_,
  test_normalizeRecordForDb_dateString_keepsSameCalendarDate_20260603_,
  test_buildTradeRows_bookValue_foreignBuy_minusFeeTaxOnly_20260511_,
];

const FULL_ONLY_TESTS_ = [
  test_writeSheet_japanStockHiddenColumns_,
  test_writeSheet_usStockHiddenColumns_,
  test_writeSheet_foreignBondHiddenColumns_,
  test_writeSheet_fundHiddenColumns_,
  test_writeSheet_tradeConditionalFormatRules_,
  test_writeSheet_averageUnitPriceNumberFormat_,
];

const ALL_GAS_TESTS_ = CORE_TESTS_.concat(FULL_ONLY_TESTS_);
const PARSER_INPUT_TESTS_ = [
  test_collectInputAlerts_supportedForeignBond_,
  test_collectInputAlerts_supportedProductAndCurrency_doNothing_,
  test_collectInputAlerts_unsupportedProduct_,
  test_collectInputAlerts_unsupportedSettlementCurrency_,
  test_readInputRecords_preambleBeforeHeader_ok_,
  test_readInputRecords_detailRowBeforeHeader_throws_,
  test_readInputRecords_headerRowAppearsInMiddle_,
  test_readInputRecords_optionalTaxColumns_,
  test_readInputRecords_optionalTaxHeaderNameMismatch_throws_,
  test_readInputRecords_manualColumns_20260511_,
  test_readInputRecords_manualColumnHeaderMismatch_20260511_,
  test_findInputSheetByHeader_singleCandidate_,
  test_findInputSheetByHeader_noCandidate_throws_,
  test_findInputSheetByHeader_multipleCandidates_throws_,
  test_parseDate_stringYmd_keepsSameCalendarDate_20260603_,
];
const DATABASE_TESTS_ = [
  test_buildRowHash_sameRecord_sameHash_,
  test_buildRowHash_differentRecord_differentHash_,
  test_normalizeRecordForDb_setsMetadata_,
  test_normalizeRakutenRecordForDb_mapsDividendManualColumns_20260618_,
  test_normalizeRakutenRecordForDb_preservesDividendSourceColumns_20260709_,
  test_normalizeRakutenRecordForDb_preservesDividendPrincipalReturnViaDescription_20260710_,
  test_getDbSpreadsheetPropertyKey_skipsFixedSpreadsheetId_20260618_,
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
  test_rollbackImport_sameImportIdOnlySelectedDb_20260709_,
  test_buildRowHash_changesWhenManualColumnsChange_20260511_,
  test_createSpreadsheetFromSourceSpreadsheetUsingDb_readsDetectedSheet_,
  test_shouldSkipRequiredManualValidationForTarget_testDb_true_,
  test_shouldSkipRequiredManualValidationForTarget_normalDb_false_,
  test_createSpreadsheetFromSourceSpreadsheetUsingDb_testDb_skipsManualValidation_,
  test_normalizeRecordForDb_dateString_keepsSameCalendarDate_20260603_,
];
const STAGING_IMPORT_TESTS_ = [
  test_buildRowsWithAdditionalManualHeaders_appendsInSpecifiedOrder_,
  test_validateRequiredManualInputsOnSheet_requiresForeignStockManualInputs_,
  test_validateRequiredManualInputsOnSheet_allowsWhenForeignStockManualInputsFilled_,
  test_createStagingSpreadsheetFromSourceSpreadsheet_createsSingleSheet_,
  test_applyStagingManualHighlights_fundBuyAndReinvest_20260529_,
  test_applyStagingManualHighlights_fundSellBuyBuybackAndReinvest_20260529_,
];
const TRADE_CALCULATION_TESTS_ = [
  test_averageUnitPrice_keepsDecimal_,
  test_bookValue_usesAcquisitionPrice_,
  test_sellWithoutAvg_addsAlert_,
  test_sortTradeRows_usesPriority_,
  test_buildTradeRows_avgUnitPrice_updatesOnStockConversionBuy_20260526_,
  test_forcedRedemptionSell_updatesHoldingAndBookValue_,
  test_redemption_tradeRowAndCashRow_withNoPreviousHolding_,
  test_redemption_tradeRowAndCashRow_withPreviousHolding_,
  test_manualDomesticTax_overridesFeeTax_,
  test_holdingZero_and_balanceZero_,
  test_lastTradeHighlightFlag_,
  test_buildCashRows_runningBalance_,
  test_normalizeZero_,
  test_buildTradeRows_foreignStockSellNet_usesRate_20260511_,
  test_buildTradeRows_bookValue_foreignBuy_minusFeeTaxOnly_20260529_,
  test_buildTradeRows_avgUnitPrice_updatesOnStockTransferIn_20260511_,
  test_buildTradeRows_avgUnitPrice_updatesOnFundOffering_20260526_,
  test_buildTradeRows_principalReturn_distributionDoesNotChangeBalance_20260511_,
  test_buildTradeRows_distributionDoesNotChangeBalance_20260515_,
  test_buildTradeRows_bookValue_foreignBuy_minusFeeTaxOnly_20260511_,
];
const OUTPUT_TESTS_ = [
  test_buildOutputSheetsFromDbRecords_splitsIntoSixSheets_,
  test_buildOutputSheetsFromRecordsForTarget_dispatchesByDbKey_20260618_,
  test_buildRakutenOutputSheetsFromBaseRecords_writesJapanStockFinalLook_20260708_,
  test_buildRakutenOutputSheetsFromBaseRecords_writesUsStockFinalLook_20260708_,
  test_buildRakutenOutputSheetsFromBaseRecords_writesFundFinalLook_20260708_,
  test_buildRakutenOutputSheetsFromBaseRecords_writesCashFinalLook_20260708_,
  test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsDividendSourceColumns_20260709_,
  test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsFundDistributionSourceColumns_20260710_,
  test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsUsStockTaxSourceColumn_20260709_,
  test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsFundSourceColumns_20260709_,
  test_rakutenOutputCellComparison_fromRealLikeInputsThroughDb_20260709_,
  test_groupRakutenOutputRecords_splitsWithoutSpreadsheet_20260618_,
].concat(FULL_ONLY_TESTS_);
const BROKER_IMPORT_TESTS_ = [
  test_detectInputSourceTypeFromRows_rakutenJapanStock_20260615_,
  test_detectInputSourceTypeFromRows_rakutenUsStock_20260615_,
  test_normalizeRakutenJapanStockRowsToRecords_buy_20260615_,
  test_normalizeRakutenUsStockRowsToRecords_yenSettlement_20260615_,
  test_routeTargetDbKeyBySource_rakuten_20260615_,
  test_detectInputSourceTypeFromRows_rakutenFund_20260616_,
  test_normalizeRakutenFundRowsToRecords_buyAndSell_20260616_,
  test_detectInputSourceTypeFromRows_rakutenDividend_20260616_,
  test_normalizeRakutenDividendRowsToRecords_usStockDividend_20260616_,
  test_normalizeRowsForImport_rakutenDividend_preservesSourceColumns_20260709_,
  test_normalizeRowsForImport_rakutenDividend_principalReturnFromMemo_20260710_,
  test_normalizeRakutenDividendRowsToRecords_requiresManualHeaders_20260618_,
  test_normalizeRakutenDividendRowsToRecords_requiresRateForForeignCurrency_20260618_,
  test_normalizeRowsForImport_rakutenDividend_warnsBlankManualTaxes_20260618_,
  test_normalizeRowsForImport_rakutenDividend_allowsZeroManualTaxes_20260618_,
  test_detectInputSourceTypeFromRows_rakutenCash_20260616_,
  test_normalizeRakutenCashRowsToRecords_depositAndWithdrawal_20260616_,
  test_rakutenDbHeaders_includeDividendManualColumns_20260617_,
];
const E2E_SUPPORT_TESTS_ = [
  test_inspectE2EOutputSpreadsheet_rejectsInvalidPayload_20260710_,
  test_inspectE2EOutputSpreadsheet_rejectsUnsafeTargetsAndSheets_20260710_,
  test_inspectE2EOutputSpreadsheet_rowChecksRequireSameRow_20260710_,
  test_inspectE2EOutputSpreadsheet_findsValuesBeyondDefaultRange_20260710_,
  test_inspectE2EOutputSpreadsheet_returnsMinimalResults_20260710_,
  test_resetE2EOutputSpreadsheet_removesKnownOutputSheets_20260713_,
  test_resetE2EOutputSpreadsheet_keepsSpreadsheetNonEmpty_20260713_,
  test_resetE2EOutputSpreadsheet_rejectsUnsafeTargets_20260713_,
  test_getE2EOutputSheetNamesToReset_keepsInspectionAllowlist_20260713_,
];
const GAS_TEST_BATCH_SIZE_ = 13;
const GAS_TEST_BATCH_ENTRY_POINTS_ = [
  'runGasTestBatch01',
  'runGasTestBatch02',
  'runGasTestBatch03',
  'runGasTestBatch04',
  'runGasTestBatch05',
  'runGasTestBatch06',
  'runGasTestBatch07',
  'runGasTestBatch08',
  'runGasTestBatch09',
];
const GAS_TEST_BATCHES_ = buildGasTestBatches_(ALL_GAS_TESTS_, GAS_TEST_BATCH_SIZE_);
const GAS_TEST_SELECTED_SUITE_DEFINITIONS_ = [
  gasTestSuiteDefinition_('parser-input-01', 'runGasTestSuiteParserInput01', PARSER_INPUT_TESTS_.slice(0, 13)),
  gasTestSuiteDefinition_('parser-input-02', 'runGasTestSuiteParserInput02', PARSER_INPUT_TESTS_.slice(13)),
  gasTestSuiteDefinition_('database-01', 'runGasTestSuiteDatabase01', DATABASE_TESTS_.slice(0, 13)),
  gasTestSuiteDefinition_('database-02', 'runGasTestSuiteDatabase02', DATABASE_TESTS_.slice(13, 26)),
  gasTestSuiteDefinition_('database-03', 'runGasTestSuiteDatabase03', DATABASE_TESTS_.slice(26)),
  gasTestSuiteDefinition_('staging-import', 'runGasTestSuiteStagingImport', STAGING_IMPORT_TESTS_),
  gasTestSuiteDefinition_('trade-calculation-01', 'runGasTestSuiteTradeCalculation01', TRADE_CALCULATION_TESTS_.slice(0, 13)),
  gasTestSuiteDefinition_('trade-calculation-02', 'runGasTestSuiteTradeCalculation02', TRADE_CALCULATION_TESTS_.slice(13)),
  gasTestSuiteDefinition_('output-01', 'runGasTestSuiteOutput01', OUTPUT_TESTS_.slice(0, 13)),
  gasTestSuiteDefinition_('output-02', 'runGasTestSuiteOutput02', OUTPUT_TESTS_.slice(13)),
  gasTestSuiteDefinition_('broker-import-01', 'runGasTestSuiteBrokerImport01', BROKER_IMPORT_TESTS_.slice(0, 13)),
  gasTestSuiteDefinition_('broker-import-02', 'runGasTestSuiteBrokerImport02', BROKER_IMPORT_TESTS_.slice(13)),
  gasTestSuiteDefinition_('e2e-support', 'runGasTestSuiteE2eSupport', E2E_SUPPORT_TESTS_),
];

function runSmokeTests() {
  return runSelectedTests_(CORE_TESTS_, '軽い確認テスト');
}

function runAllTests() {
  return runSelectedTests_(ALL_GAS_TESTS_, 'フルテスト');
}

function runGasTestSuiteByName(suiteName) {
  return runGasTestSuitesByName_([suiteName]);
}

function runGasTestSuiteParserInput01() {
  return runGasTestSuiteByName('parser-input-01');
}

function runGasTestSuiteParserInput02() {
  return runGasTestSuiteByName('parser-input-02');
}

function runGasTestSuiteDatabase01() {
  return runGasTestSuiteByName('database-01');
}

function runGasTestSuiteDatabase02() {
  return runGasTestSuiteByName('database-02');
}

function runGasTestSuiteDatabase03() {
  return runGasTestSuiteByName('database-03');
}

function runGasTestSuiteStagingImport() {
  return runGasTestSuiteByName('staging-import');
}

function runGasTestSuiteTradeCalculation01() {
  return runGasTestSuiteByName('trade-calculation-01');
}

function runGasTestSuiteTradeCalculation02() {
  return runGasTestSuiteByName('trade-calculation-02');
}

function runGasTestSuiteOutput01() {
  return runGasTestSuiteByName('output-01');
}

function runGasTestSuiteOutput02() {
  return runGasTestSuiteByName('output-02');
}

function runGasTestSuiteBrokerImport01() {
  return runGasTestSuiteByName('broker-import-01');
}

function runGasTestSuiteBrokerImport02() {
  return runGasTestSuiteByName('broker-import-02');
}

function runGasTestSuiteE2eSupport() {
  return runGasTestSuiteByName('e2e-support');
}

function runGasTestBatch01() {
  return runGasTestBatch_(0);
}

function runGasTestBatch02() {
  return runGasTestBatch_(1);
}

function runGasTestBatch03() {
  return runGasTestBatch_(2);
}

function runGasTestBatch04() {
  return runGasTestBatch_(3);
}

function runGasTestBatch05() {
  return runGasTestBatch_(4);
}

function runGasTestBatch06() {
  return runGasTestBatch_(5);
}

function runGasTestBatch07() {
  return runGasTestBatch_(6);
}

function runGasTestBatch08() {
  return runGasTestBatch_(7);
}

function runGasTestBatch09() {
  return runGasTestBatch_(8);
}

function runGasTestBatch_(batchIndex) {
  validateGasTestBatchDefinitions_();

  const batch = GAS_TEST_BATCHES_[batchIndex];
  if (!batch) {
    throw new Error('GASテストバッチが見つかりません: ' + (batchIndex + 1));
  }

  return runSelectedTests_(batch.tests, 'GASテストバッチ ' + batch.label);
}

function runGasTestSuitesByName_(suiteNames) {
  validateGasTestSelectedSuiteDefinitions_();
  if (!Array.isArray(suiteNames) || suiteNames.length === 0) {
    throw new Error('GASテストスイートが選択されていません。');
  }

  const selectedTests = [];
  const selectedLabels = [];
  suiteNames.forEach(function(suiteName) {
    const definition = GAS_TEST_SELECTED_SUITE_DEFINITIONS_.find(function(candidate) {
      return candidate.name === suiteName;
    });
    if (!definition) {
      throw new Error('許可されていないGASテストスイートです: ' + String(suiteName));
    }
    selectedTests.push.apply(selectedTests, definition.tests);
    selectedLabels.push(definition.name);
  });

  const duplicateNames = findDuplicateNames_(getTestFunctionNames_(selectedTests));
  if (duplicateNames.length > 0) {
    throw new Error('選択したGASテストスイート間に重複があります: ' + duplicateNames.join(', '));
  }
  return runSelectedTests_(selectedTests, '選択GASテスト: ' + selectedLabels.join(', '));
}

function gasTestSuiteDefinition_(name, entryPoint, tests) {
  return {
    name: name,
    entryPoint: entryPoint,
    tests: tests,
  };
}

function buildGasTestBatches_(tests, batchSize) {
  const batches = [];
  for (let i = 0; i < tests.length; i += batchSize) {
    batches.push({
      batchNumber: batches.length + 1,
      tests: tests.slice(i, i + batchSize),
    });
  }

  const total = batches.length;
  return batches.map(function(batch) {
    return {
      label: zeroPadGasTestBatchNumber_(batch.batchNumber) + '/' + zeroPadGasTestBatchNumber_(total),
      tests: batch.tests,
    };
  });
}

function validateGasTestBatchDefinitions_() {
  const errors = [];

  if (GAS_TEST_BATCH_SIZE_ <= 0) {
    errors.push('GAS_TEST_BATCH_SIZE_ must be greater than 0.');
  }

  if (GAS_TEST_BATCHES_.length !== GAS_TEST_BATCH_ENTRY_POINTS_.length) {
    errors.push('公開バッチ関数数と生成バッチ数が一致しません: entryPoints=' + GAS_TEST_BATCH_ENTRY_POINTS_.length + ', batches=' + GAS_TEST_BATCHES_.length);
  }

  const expectedNames = getTestFunctionNames_(ALL_GAS_TESTS_);
  const actualTests = [];
  GAS_TEST_BATCHES_.forEach(function(batch, batchIndex) {
    if (!batch.tests || batch.tests.length === 0) {
      errors.push('空のGASテストバッチがあります: ' + zeroPadGasTestBatchNumber_(batchIndex + 1));
      return;
    }
    actualTests.push.apply(actualTests, batch.tests);
  });

  const actualNames = getTestFunctionNames_(actualTests);
  const duplicateExpectedNames = findDuplicateNames_(expectedNames);
  const duplicateActualNames = findDuplicateNames_(actualNames);
  if (duplicateExpectedNames.length > 0) {
    errors.push('テスト一覧に重複があります: ' + duplicateExpectedNames.join(', '));
  }
  if (duplicateActualNames.length > 0) {
    errors.push('バッチ内に重複があります: ' + duplicateActualNames.join(', '));
  }

  const expectedCounts = countNames_(expectedNames);
  const actualCounts = countNames_(actualNames);
  const missingNames = [];
  Object.keys(expectedCounts).forEach(function(name) {
    if (!actualCounts[name]) {
      missingNames.push(name);
    }
  });
  if (missingNames.length > 0) {
    errors.push('バッチから欠落したテストがあります: ' + missingNames.join(', '));
  }

  const unexpectedNames = [];
  Object.keys(actualCounts).forEach(function(name) {
    if (!expectedCounts[name]) {
      unexpectedNames.push(name);
    }
  });
  if (unexpectedNames.length > 0) {
    errors.push('テスト一覧にない関数がバッチへ含まれています: ' + unexpectedNames.join(', '));
  }

  if (actualNames.length !== expectedNames.length) {
    errors.push('テスト総数が一致しません: expected=' + expectedNames.length + ', actual=' + actualNames.length);
  }

  if (errors.length > 0) {
    throw new Error('GASテストバッチ定義が不正です:\n' + errors.join('\n'));
  }
}

function validateGasTestSelectedSuiteDefinitions_() {
  const errors = [];
  const suiteNames = GAS_TEST_SELECTED_SUITE_DEFINITIONS_.map(function(definition) {
    return definition.name;
  });
  const entryPoints = GAS_TEST_SELECTED_SUITE_DEFINITIONS_.map(function(definition) {
    return definition.entryPoint;
  });
  const selectedTests = [];

  GAS_TEST_SELECTED_SUITE_DEFINITIONS_.forEach(function(definition) {
    if (!definition.tests || definition.tests.length === 0) {
      errors.push('空の選択GASテストスイートがあります: ' + definition.name);
      return;
    }
    if (definition.tests.length > GAS_TEST_BATCH_SIZE_) {
      errors.push('選択GASテストスイートが最大件数を超えています: ' + definition.name);
    }
    selectedTests.push.apply(selectedTests, definition.tests);
  });

  const duplicateSuiteNames = findDuplicateNames_(suiteNames);
  const duplicateEntryPoints = findDuplicateNames_(entryPoints);
  const expectedNames = getTestFunctionNames_(ALL_GAS_TESTS_);
  const actualNames = getTestFunctionNames_(selectedTests);
  const duplicateTestNames = findDuplicateNames_(actualNames);
  if (duplicateSuiteNames.length > 0) {
    errors.push('選択GASテストスイート名に重複があります: ' + duplicateSuiteNames.join(', '));
  }
  if (duplicateEntryPoints.length > 0) {
    errors.push('選択GASテスト入口に重複があります: ' + duplicateEntryPoints.join(', '));
  }
  if (duplicateTestNames.length > 0) {
    errors.push('選択GASテストスイート内に重複があります: ' + duplicateTestNames.join(', '));
  }

  const expectedCounts = countNames_(expectedNames);
  const actualCounts = countNames_(actualNames);
  const missingNames = Object.keys(expectedCounts).filter(function(name) {
    return !actualCounts[name];
  });
  const unexpectedNames = Object.keys(actualCounts).filter(function(name) {
    return !expectedCounts[name];
  });
  if (missingNames.length > 0) {
    errors.push('選択GASテストスイートから欠落したテストがあります: ' + missingNames.join(', '));
  }
  if (unexpectedNames.length > 0) {
    errors.push('全テスト一覧にない関数が選択スイートへ含まれています: ' + unexpectedNames.join(', '));
  }
  if (actualNames.length !== expectedNames.length) {
    errors.push('選択GASテスト総数が一致しません: expected=' + expectedNames.length + ', actual=' + actualNames.length);
  }

  if (errors.length > 0) {
    throw new Error('選択GASテストスイート定義が不正です:\n' + errors.join('\n'));
  }
}

function getTestFunctionNames_(tests) {
  return tests.map(function(fn, index) {
    if (typeof fn !== 'function') {
      return '(non-function #' + (index + 1) + ')';
    }
    return fn.name || '(anonymous #' + (index + 1) + ')';
  });
}

function findDuplicateNames_(names) {
  const counts = countNames_(names);
  return Object.keys(counts).filter(function(name) {
    return counts[name] > 1;
  });
}

function countNames_(names) {
  return names.reduce(function(counts, name) {
    counts[name] = (counts[name] || 0) + 1;
    return counts;
  }, {});
}

function zeroPadGasTestBatchNumber_(value) {
  return String(value).padStart(2, '0');
}

function runSelectedTests_(tests, label) {
  const startedAt = Date.now();
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

  const durationMs = Date.now() - startedAt;
  const message = '[' + label + ']\n' + results.join('\n')
    + '\nGAS_TEST_METRICS testCount=' + tests.length + ' durationMs=' + durationMs;
  Logger.log(message);
  if (failed > 0) throw new Error(message);
  return message;
}

function ensureManagedScriptPropertiesIfAvailable_() {
  if (typeof ensureManagedScriptProperties_ === 'function') {
    ensureManagedScriptProperties_();
  }
}
