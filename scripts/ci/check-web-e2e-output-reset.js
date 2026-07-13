const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const helperSource = fs.readFileSync(path.join(repoRoot, 'src', 'app', 'e2e_helpers.gs'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractFunction(source, functionName) {
  const marker = 'function ' + functionName;
  const start = source.indexOf(marker);
  assert(start !== -1, functionName + ' was not found.');

  const bodyStart = source.indexOf('{', start);
  assert(bodyStart !== -1, functionName + ' has no function body.');

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(functionName + ' function body was not closed.');
}

class FakeSheet {
  constructor(name) {
    this.name = name;
  }

  getName() {
    return this.name;
  }
}

class FakeSpreadsheet {
  constructor(name, sheetNames) {
    this.name = name;
    this.sheets = sheetNames.map((sheetName) => new FakeSheet(sheetName));
  }

  getName() {
    return this.name;
  }

  getSheets() {
    return this.sheets.slice();
  }

  getSheetByName(name) {
    return this.sheets.find((sheet) => sheet.getName() === name) || null;
  }

  insertSheet(name) {
    assert(!this.getSheetByName(name), 'Fake spreadsheet already has sheet: ' + name);
    const sheet = new FakeSheet(name);
    this.sheets.push(sheet);
    return sheet;
  }

  deleteSheet(sheet) {
    assert(this.sheets.length > 1, 'Fake spreadsheet cannot delete the last sheet.');
    const index = this.sheets.indexOf(sheet);
    assert(index >= 0, 'Fake spreadsheet cannot delete an unknown sheet.');
    this.sheets.splice(index, 1);
  }
}

const sandbox = {
  CONFIG: {
    SOURCE_SHEET_NAME: '元データ',
    OUTPUT_JAPAN_STOCK: '日本株',
    OUTPUT_US_STOCK: '米国株',
    OUTPUT_FOREIGN_BOND: '外債',
    OUTPUT_FUND: '投信',
    OUTPUT_CASH_JPY: '金銭残高（円）',
    OUTPUT_CASH_USD: '金銭残高（ドル）',
    RAKUTEN_OUTPUT_JAPAN_STOCK: '楽天日本株',
    RAKUTEN_OUTPUT_US_STOCK: '楽天米国株',
    RAKUTEN_OUTPUT_FUND: '楽天投資信託',
  },
  SpreadsheetApp: {
    flush() {},
  },
  unique_(items) {
    return Array.from(new Set(items));
  },
};
vm.createContext(sandbox);

[
  'resetE2EOutputSpreadsheet_',
  'getE2EOutputSpreadsheetName_',
  'getE2EOutputSheetNamesToReset_',
].forEach((functionName) => {
  vm.runInContext(extractFunction(helperSource, functionName), sandbox);
});

const prepareSource = extractFunction(helperSource, 'prepareE2EWebAppRun');
assert(
  prepareSource.includes('resetE2EOutputSpreadsheetForTarget_(targetDbKey)'),
  'prepareE2EWebAppRun must reset the E2E output spreadsheet for each case.'
);
assert(
  !prepareSource.includes('spreadsheetId'),
  'prepareE2EWebAppRun must not accept an arbitrary spreadsheet ID.'
);

const resetSheetNames = sandbox.getE2EOutputSheetNamesToReset_();
[
  '元データ',
  '日本株',
  '米国株',
  '外債',
  '投信',
  '金銭残高（円）',
  '金銭残高（ドル）',
  '楽天日本株',
  '楽天米国株',
  '楽天投資信託',
].forEach((sheetName) => {
  assert(resetSheetNames.includes(sheetName), sheetName + ' must be reset before each E2E case.');
});
assert(resetSheetNames.length === new Set(resetSheetNames).size, 'Reset sheet names must not be duplicated.');

const mixed = new FakeSpreadsheet('株管理ツール_E2E_TEST_OUTPUT', [
  '楽天日本株',
  '日本株',
  '米国株',
  '外債',
  '金銭残高（円）',
  '__E2E_CONTROL__',
]);
const mixedResult = sandbox.resetE2EOutputSpreadsheet_(mixed);
assert(mixedResult.deletedSheetNames.length === 5, 'Known output sheets must be deleted together.');
assert(!mixed.getSheetByName('楽天日本株'), '楽天日本株 must not remain after reset.');
assert(!mixed.getSheetByName('日本株'), '日本株 must not remain after reset.');
assert(!mixed.getSheetByName('外債'), '外債 must not remain after reset.');
assert(!!mixed.getSheetByName('__E2E_CONTROL__'), 'Control sheet must be preserved.');
assert(mixed.getSheets().length >= 1, 'Spreadsheet must not be left with zero sheets.');
assert(mixedResult.placeholderCreated === false, 'Placeholder is unnecessary when a control sheet remains.');

const onlyKnown = new FakeSpreadsheet('株管理ツール_E2E_TEST_OUTPUT', [
  '楽天日本株',
  '日本株',
]);
const onlyKnownResult = sandbox.resetE2EOutputSpreadsheet_(onlyKnown);
assert(onlyKnownResult.deletedSheetNames.length === 2, 'All known output sheets must be deleted.');
assert(onlyKnownResult.placeholderCreated === true, 'Placeholder must be created before deleting all sheets.');
assert(!!onlyKnown.getSheetByName('__E2E_EMPTY__'), 'Placeholder sheet must remain.');
assert(onlyKnown.getSheets().length === 1, 'Only placeholder should remain when every sheet was reset.');

const wrongName = new FakeSpreadsheet('not_e2e_output', ['楽天日本株']);
try {
  sandbox.resetE2EOutputSpreadsheet_(wrongName);
  throw new Error('Wrong spreadsheet name should have been rejected.');
} catch (error) {
  assert(
    String(error && error.message ? error.message : error).includes('limited to the E2E test output spreadsheet'),
    'Wrong spreadsheet name must be rejected without touching arbitrary spreadsheets.'
  );
}

console.log('web e2e output reset checks ok');
