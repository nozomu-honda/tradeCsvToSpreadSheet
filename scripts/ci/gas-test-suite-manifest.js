#!/usr/bin/env node
'use strict';

const GAS_TEST_BATCH_SIZE = 13;
const ALL_IMPACT_AREAS = Object.freeze([
  'parser-input',
  'database',
  'staging-import',
  'trade-calculation',
  'output',
  'broker-import',
  'e2e-support',
]);

const GAS_TEST_MANIFEST = Object.freeze([
  test('test_averageUnitPrice_keepsDecimal_', 'trade-calculation'),
  test('test_bookValue_usesAcquisitionPrice_', 'trade-calculation'),
  test('test_sellWithoutAvg_addsAlert_', 'trade-calculation'),
  test('test_sortTradeRows_usesPriority_', 'trade-calculation'),
  test('test_buildTradeRows_avgUnitPrice_updatesOnStockConversionBuy_20260526_', 'trade-calculation'),
  test('test_forcedRedemptionSell_updatesHoldingAndBookValue_', 'trade-calculation'),
  test('test_redemption_tradeRowAndCashRow_withNoPreviousHolding_', 'trade-calculation'),
  test('test_redemption_tradeRowAndCashRow_withPreviousHolding_', 'trade-calculation'),
  test('test_manualDomesticTax_overridesFeeTax_', 'trade-calculation'),
  test('test_collectInputAlerts_supportedForeignBond_', 'parser-input'),
  test('test_collectInputAlerts_supportedProductAndCurrency_doNothing_', 'parser-input'),
  test('test_collectInputAlerts_unsupportedProduct_', 'parser-input'),
  test('test_collectInputAlerts_unsupportedSettlementCurrency_', 'parser-input'),
  test('test_readInputRecords_preambleBeforeHeader_ok_', 'parser-input'),
  test('test_readInputRecords_detailRowBeforeHeader_throws_', 'parser-input'),
  test('test_readInputRecords_headerRowAppearsInMiddle_', 'parser-input'),
  test('test_readInputRecords_optionalTaxColumns_', 'parser-input'),
  test('test_readInputRecords_optionalTaxHeaderNameMismatch_throws_', 'parser-input'),
  test('test_holdingZero_and_balanceZero_', 'trade-calculation'),
  test('test_lastTradeHighlightFlag_', 'trade-calculation'),
  test('test_buildCashRows_runningBalance_', 'trade-calculation'),
  test('test_normalizeZero_', 'trade-calculation'),
  test('test_buildRowHash_sameRecord_sameHash_', 'database'),
  test('test_buildRowHash_differentRecord_differentHash_', 'database'),
  test('test_normalizeRecordForDb_setsMetadata_', 'database'),
  test('test_normalizeRakutenRecordForDb_mapsDividendManualColumns_20260618_', 'database'),
  test('test_normalizeRakutenRecordForDb_preservesDividendSourceColumns_20260709_', 'database'),
  test('test_normalizeRakutenRecordForDb_preservesDividendPrincipalReturnViaDescription_20260710_', 'database'),
  test('test_normalizeRakutenRecordForDb_usesEditedStagingValues_20260828_', 'database'),
  test('test_normalizeRakutenDividendRecordForDb_usesEditedStagingValues_20260828_', 'database'),
  test('test_getDbSpreadsheetPropertyKey_skipsFixedSpreadsheetId_20260618_', 'database'),
  test('test_dbRecordToRow_mapsHeaders_', 'database'),
  test('test_dbTargets_defaultSelection_', 'database'),
  test('test_getResetDbTargetList_includesHiddenTargets_20260616_', 'database'),
  test('test_appendRecordsToDb_writesOnlySelectedDb_', 'database'),
  test('test_listRecentImports_returnsOnlySelectedDbLogs_', 'database'),
  test('test_rollbackImport_marksImportInactive_', 'database'),
  test('test_rollbackImport_setsRolledBackAt_', 'database'),
  test('test_rollbackImport_twice_throws_', 'database'),
  test('test_resetDbData_resetsOnlySelectedDb_', 'database'),
  test('test_resetDbData_recreatesSheetsAndClearsFormats_', 'database'),
  test('test_rakutenDb_usesRakutenHeadersAndReadsAsBaseRecord_20260617_', 'database'),
  test('test_rakutenDb_existingOldHeaderWithData_throwsBeforeHeaderRewrite_20260617_', 'database'),
  test('test_rakutenDb_rollback_marksOnlyTargetImportInactive_20260617_', 'database'),
  test('test_rollbackImport_sameImportIdOnlySelectedDb_20260709_', 'database'),
  test('test_readInputRecords_manualColumns_20260511_', 'parser-input'),
  test('test_readInputRecords_manualColumnHeaderMismatch_20260511_', 'parser-input'),
  test('test_buildTradeRows_foreignStockSellNet_usesRate_20260511_', 'trade-calculation'),
  test('test_buildTradeRows_bookValue_foreignBuy_minusFeeTaxOnly_20260529_', 'trade-calculation'),
  test('test_buildTradeRows_avgUnitPrice_updatesOnStockTransferIn_20260511_', 'trade-calculation'),
  test('test_buildTradeRows_avgUnitPrice_updatesOnFundOffering_20260526_', 'trade-calculation'),
  test('test_buildTradeRows_principalReturn_distributionDoesNotChangeBalance_20260511_', 'trade-calculation'),
  test('test_buildTradeRows_distributionDoesNotChangeBalance_20260515_', 'trade-calculation'),
  test('test_buildRowHash_changesWhenManualColumnsChange_20260511_', 'database'),
  test('test_findInputSheetByHeader_singleCandidate_', 'parser-input'),
  test('test_findInputSheetByHeader_noCandidate_throws_', 'parser-input'),
  test('test_findInputSheetByHeader_multipleCandidates_throws_', 'parser-input'),
  test('test_createSpreadsheetFromSourceSpreadsheetUsingDb_readsDetectedSheet_', 'database'),
  test('test_buildRowsWithAdditionalManualHeaders_appendsInSpecifiedOrder_', 'staging-import'),
  test('test_validateRequiredManualInputsOnSheet_requiresForeignStockManualInputs_', 'staging-import'),
  test('test_validateRequiredManualInputsOnSheet_allowsWhenForeignStockManualInputsFilled_', 'staging-import'),
  test('test_createStagingSpreadsheetFromSourceSpreadsheet_createsSingleSheet_', 'staging-import'),
  test('test_restoreStagingSourceFields_matchesRowsByStableId_20260828_', 'staging-import'),
  test('test_buildOutputSheetsFromDbRecords_splitsIntoSixSheets_', 'output'),
  test('test_buildOutputSheetsFromRecordsForTarget_dispatchesByDbKey_20260618_', 'output'),
  test('test_buildRakutenOutputSheetsFromBaseRecords_writesJapanStockFinalLook_20260708_', 'output'),
  test('test_buildRakutenOutputSheetsFromBaseRecords_writesUsStockFinalLook_20260708_', 'output'),
  test('test_buildRakutenOutputSheetsFromBaseRecords_writesFundFinalLook_20260708_', 'output'),
  test('test_buildRakutenOutputSheetsFromBaseRecords_writesCashFinalLook_20260708_', 'output'),
  test('test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsDividendSourceColumns_20260709_', 'output'),
  test('test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsFundDistributionSourceColumns_20260710_', 'output'),
  test('test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsUsStockTaxSourceColumn_20260709_', 'output'),
  test('test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsFundSourceColumns_20260709_', 'output'),
  test('test_rakutenOutputCellComparison_fromRealLikeInputsThroughDb_20260709_', 'output'),
  test('test_inspectE2EOutputSpreadsheet_rejectsInvalidPayload_20260710_', 'e2e-support'),
  test('test_inspectE2EOutputSpreadsheet_rejectsUnsafeTargetsAndSheets_20260710_', 'e2e-support'),
  test('test_inspectE2EOutputSpreadsheet_rowChecksRequireSameRow_20260710_', 'e2e-support'),
  test('test_inspectE2EOutputSpreadsheet_findsValuesBeyondDefaultRange_20260710_', 'e2e-support'),
  test('test_inspectE2EOutputSpreadsheet_returnsMinimalResults_20260710_', 'e2e-support'),
  test('test_resetE2EOutputSpreadsheet_removesKnownOutputSheets_20260713_', 'e2e-support'),
  test('test_resetE2EOutputSpreadsheet_keepsSpreadsheetNonEmpty_20260713_', 'e2e-support'),
  test('test_resetE2EOutputSpreadsheet_rejectsUnsafeTargets_20260713_', 'e2e-support'),
  test('test_getE2EOutputSheetNamesToReset_keepsInspectionAllowlist_20260713_', 'e2e-support'),
  test('test_groupRakutenOutputRecords_splitsWithoutSpreadsheet_20260618_', 'output'),
  test('test_shouldSkipRequiredManualValidationForTarget_testDb_true_', 'database'),
  test('test_shouldSkipRequiredManualValidationForTarget_normalDb_false_', 'database'),
  test('test_createSpreadsheetFromSourceSpreadsheetUsingDb_testDb_skipsManualValidation_', 'database'),
  test('test_applyStagingManualHighlights_fundBuyAndReinvest_20260529_', 'staging-import'),
  test('test_detectInputSourceTypeFromRows_rakutenJapanStock_20260615_', 'broker-import'),
  test('test_detectInputSourceTypeFromRows_rakutenUsStock_20260615_', 'broker-import'),
  test('test_normalizeRakutenJapanStockRowsToRecords_buy_20260615_', 'broker-import'),
  test('test_normalizeRakutenUsStockRowsToRecords_yenSettlement_20260615_', 'broker-import'),
  test('test_routeTargetDbKeyBySource_rakuten_20260615_', 'broker-import'),
  test('test_detectInputSourceTypeFromRows_rakutenFund_20260616_', 'broker-import'),
  test('test_normalizeRakutenFundRowsToRecords_buyAndSell_20260616_', 'broker-import'),
  test('test_detectInputSourceTypeFromRows_rakutenDividend_20260616_', 'broker-import'),
  test('test_normalizeRakutenDividendRowsToRecords_usStockDividend_20260616_', 'broker-import'),
  test('test_normalizeRowsForImport_rakutenDividend_preservesSourceColumns_20260709_', 'broker-import'),
  test('test_normalizeRowsForImport_rakutenDividend_principalReturnFromMemo_20260710_', 'broker-import'),
  test('test_normalizeRakutenDividendRowsToRecords_requiresManualHeaders_20260618_', 'broker-import'),
  test('test_normalizeRakutenDividendRowsToRecords_requiresRateForForeignCurrency_20260618_', 'broker-import'),
  test('test_normalizeRowsForImport_rakutenDividend_warnsBlankManualTaxes_20260618_', 'broker-import'),
  test('test_normalizeRowsForImport_rakutenDividend_stagingPreservesAlerts_20260828_', 'broker-import'),
  test('test_normalizeRowsForImport_rakutenDividend_allowsZeroManualTaxes_20260618_', 'broker-import'),
  test('test_detectInputSourceTypeFromRows_rakutenCash_20260616_', 'broker-import'),
  test('test_normalizeRakutenCashRowsToRecords_depositAndWithdrawal_20260616_', 'broker-import'),
  test('test_rakutenDbHeaders_includeDividendManualColumns_20260617_', 'broker-import'),
  test('test_applyStagingManualHighlights_fundSellBuyBuybackAndReinvest_20260529_', 'staging-import'),
  test('test_parseDate_stringYmd_keepsSameCalendarDate_20260603_', 'parser-input'),
  test('test_normalizeRecordForDb_dateString_keepsSameCalendarDate_20260603_', 'database'),
  test('test_buildTradeRows_bookValue_foreignBuy_minusFeeTaxOnly_20260511_', 'trade-calculation'),
  test('test_writeSheet_japanStockHiddenColumns_', 'output', true),
  test('test_writeSheet_usStockHiddenColumns_', 'output', true),
  test('test_writeSheet_foreignBondHiddenColumns_', 'output', true),
  test('test_writeSheet_fundHiddenColumns_', 'output', true),
  test('test_writeSheet_tradeConditionalFormatRules_', 'output', true),
  test('test_writeSheet_averageUnitPriceNumberFormat_', 'output', true),
]);

const SELECTED_SUITE_LAYOUT = Object.freeze([
  layout('parser-input-01', 'parser-input', 'runGasTestSuiteParserInput01'),
  layout('parser-input-02', 'parser-input', 'runGasTestSuiteParserInput02'),
  layout('database-01', 'database', 'runGasTestSuiteDatabase01'),
  layout('database-02', 'database', 'runGasTestSuiteDatabase02'),
  layout('database-03', 'database', 'runGasTestSuiteDatabase03'),
  layout('staging-import', 'staging-import', 'runGasTestSuiteStagingImport'),
  layout('trade-calculation-01', 'trade-calculation', 'runGasTestSuiteTradeCalculation01'),
  layout('trade-calculation-02', 'trade-calculation', 'runGasTestSuiteTradeCalculation02'),
  layout('output-01', 'output', 'runGasTestSuiteOutput01'),
  layout('output-02', 'output', 'runGasTestSuiteOutput02'),
  layout('broker-import-01', 'broker-import', 'runGasTestSuiteBrokerImport01'),
  layout('broker-import-02', 'broker-import', 'runGasTestSuiteBrokerImport02'),
  layout('e2e-support', 'e2e-support', 'runGasTestSuiteE2eSupport'),
]);

function test(name, area, fullOnly) {
  return Object.freeze({ name, area, fullOnly: fullOnly === true });
}

function layout(name, area, entryPoint) {
  return Object.freeze({ name, area, entryPoint });
}

function suite(name, area, entryPoint, tests) {
  const frozenTests = Object.freeze([...tests]);
  return Object.freeze({
    name,
    area,
    entryPoint,
    testCount: frozenTests.length,
    tests: frozenTests,
  });
}

function validateManifest() {
  const names = GAS_TEST_MANIFEST.map((definition) => definition.name);
  const duplicateTestNames = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))].sort();
  if (duplicateTestNames.length > 0) {
    throw new Error(`GAS test manifest contains duplicate test functions: ${duplicateTestNames.join(', ')}`);
  }
  if (GAS_TEST_MANIFEST.some((definition) => !ALL_IMPACT_AREAS.includes(definition.area))) {
    throw new Error('GAS test manifest contains an unknown impact area');
  }
  const layoutNames = SELECTED_SUITE_LAYOUT.map((definition) => definition.name);
  const entryPoints = SELECTED_SUITE_LAYOUT.map((definition) => definition.entryPoint);
  if (new Set(layoutNames).size !== layoutNames.length || new Set(entryPoints).size !== entryPoints.length) {
    throw new Error('GAS test suite layout contains duplicates');
  }
}

function buildSelectedSuiteDefinitions() {
  const testsByArea = new Map(ALL_IMPACT_AREAS.map((area) => [
    area,
    GAS_TEST_MANIFEST.filter((definition) => definition.area === area).map((definition) => definition.name),
  ]));
  const offsets = new Map(ALL_IMPACT_AREAS.map((area) => [area, 0]));
  const definitions = SELECTED_SUITE_LAYOUT.map((definition) => {
    const areaTests = testsByArea.get(definition.area) || [];
    const offset = offsets.get(definition.area) || 0;
    const tests = areaTests.slice(offset, offset + GAS_TEST_BATCH_SIZE);
    if (tests.length === 0) {
      throw new Error(`GAS test suite has no canonical tests: ${definition.name}`);
    }
    offsets.set(definition.area, offset + tests.length);
    return suite(definition.name, definition.area, definition.entryPoint, tests);
  });
  for (const area of ALL_IMPACT_AREAS) {
    if (offsets.get(area) !== testsByArea.get(area).length) {
      throw new Error(`GAS test suite layout does not cover area: ${area}`);
    }
  }
  return Object.freeze(definitions);
}

function buildFullSuiteDefinitions() {
  const testNames = GAS_TEST_MANIFEST.map((definition) => definition.name);
  const definitions = [];
  for (let offset = 0; offset < testNames.length; offset += GAS_TEST_BATCH_SIZE) {
    const number = String(definitions.length + 1).padStart(2, '0');
    definitions.push(suite(
      `full-batch-${number}`,
      'full',
      `runGasTestBatch${number}`,
      testNames.slice(offset, offset + GAS_TEST_BATCH_SIZE),
    ));
  }
  return Object.freeze(definitions);
}

validateManifest();

const ALL_GAS_TEST_FUNCTIONS = Object.freeze(GAS_TEST_MANIFEST.map((definition) => definition.name));
const CORE_GAS_TEST_FUNCTIONS = Object.freeze(
  GAS_TEST_MANIFEST.filter((definition) => !definition.fullOnly).map((definition) => definition.name),
);
const SELECTED_SUITE_DEFINITIONS = buildSelectedSuiteDefinitions();
const FULL_SUITE_DEFINITIONS = buildFullSuiteDefinitions();

module.exports = {
  ALL_GAS_TEST_FUNCTIONS,
  ALL_IMPACT_AREAS,
  CORE_GAS_TEST_FUNCTIONS,
  FULL_SUITE_DEFINITIONS,
  GAS_TEST_BATCH_SIZE,
  GAS_TEST_MANIFEST,
  SELECTED_SUITE_DEFINITIONS,
};
