const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const appDir = path.join(repoRoot, 'src', 'app');

const INTERNAL_RUNTIME_FUNCTIONS = [
  'getConfiguredCiE2eToken_',
  'isCiE2eTokenConfigured_',
  'assertConfiguredCiE2eTokenForPayload_',
  'assertCiE2eTokenForWebAppIfConfigured_',
  'shouldUseCiE2eRootDbFolder_',
  'enableCiE2eRootDbFolderForPayload_',
];

const PUBLIC_E2E_HELPERS = [
  'prepareE2EWebAppRun',
  'cleanupE2EImportFromWebApp',
  'inspectE2EOutputSpreadsheetFromWebApp',
];

const WEB_APP_FUNCTIONS = [
  'runFromWebApp',
  'resetDbFromWebApp',
  'getDbSpreadsheetFromWebApp',
  'listRecentImportsFromWebApp',
  'rollbackImportFromWebApp',
  'runStagingSheetFromWebApp',
];

const PRODUCTION_REFERENCE_FILES = [
  'src/app/web.gs',
  'src/app/db.gs',
  'src/app/import.gs',
];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function countFunctionDefinitions(source, functionName) {
  const pattern = new RegExp('function\\s+' + functionName + '\\s*\\(', 'g');
  return (source.match(pattern) || []).length;
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

function findFunctionDefinitions(source) {
  const definitions = new Set();
  const pattern = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    definitions.add(match[1]);
  }
  return definitions;
}

function findPrivateFunctionCalls(source) {
  const calls = new Set();
  const pattern = /\b([A-Za-z_$][\w$]*_)\s*\(/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    calls.add(match[1]);
  }
  return calls;
}

function removeFunctionDefinitionNames(calls, source) {
  findFunctionDefinitions(source).forEach((functionName) => {
    calls.delete(functionName);
  });
}

function assertThrows(fn, expectedMessage) {
  try {
    fn();
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    assert(
      message.includes(expectedMessage),
      'Expected error containing "' + expectedMessage + '", got "' + message + '".'
    );
    return;
  }

  throw new Error('Expected function to throw "' + expectedMessage + '".');
}

const sourcesByPath = new Map(
  fs.readdirSync(appDir)
    .filter((fileName) => fileName.endsWith('.gs'))
    .map((fileName) => [
      'src/app/' + fileName,
      fs.readFileSync(path.join(appDir, fileName), 'utf8'),
    ])
);
const productionSourceEntries = Array.from(sourcesByPath.entries())
  .filter(([relativePath]) => relativePath !== 'src/app/e2e_helpers.gs');
const productionAppSources = productionSourceEntries
  .map(([, source]) => source)
  .join('\n');
const productionFunctionDefinitions = findFunctionDefinitions(productionAppSources);

const runtimeSupportSource = read('src/app/e2e_runtime_support.gs');
const importSource = read('src/app/import.gs');
const e2eSource = read('src/app/e2e_helpers.gs');
const webSource = read('src/app/web.gs');
const indexSource = read('Index.html');
const productionIgnore = read('.clasp.productionignore');
const ciIgnore = read('.claspignore');

INTERNAL_RUNTIME_FUNCTIONS.forEach((functionName) => {
  assert(
    countFunctionDefinitions(runtimeSupportSource, functionName) === 1,
    functionName + ' must be defined once in src/app/e2e_runtime_support.gs.'
  );
  assert(
    countFunctionDefinitions(productionAppSources, functionName) === 1,
    functionName + ' must be defined exactly once in production app sources.'
  );
  assert(
    countFunctionDefinitions(e2eSource, functionName) === 0,
    functionName + ' must not be defined in src/app/e2e_helpers.gs.'
  );
});

assert(
  countFunctionDefinitions(productionAppSources, 'isTestDbTarget_') === 1,
  'Production app sources must define isTestDbTarget_ exactly once.'
);

PUBLIC_E2E_HELPERS.forEach((functionName) => {
  assert(
    countFunctionDefinitions(productionAppSources, functionName) === 0,
    functionName + ' must remain outside production app sources.'
  );
  assert(
    countFunctionDefinitions(e2eSource, functionName) === 1,
    functionName + ' must remain in src/app/e2e_helpers.gs.'
  );
});

WEB_APP_FUNCTIONS.forEach((functionName) => {
  assert(
    countFunctionDefinitions(productionAppSources, functionName) === 1,
    functionName + ' must be defined exactly once in production app sources.'
  );
});

const productionSourcesWithoutRuntimeSupport = productionSourceEntries
  .filter(([relativePath]) => relativePath !== 'src/app/e2e_runtime_support.gs')
  .map(([, source]) => source)
  .join('\n');
const definitionsWithoutRuntimeSupport = findFunctionDefinitions(productionSourcesWithoutRuntimeSupport);
assert(
  !definitionsWithoutRuntimeSupport.has('assertCiE2eTokenForWebAppIfConfigured_'),
  'Removing e2e_runtime_support.gs must remove the runtime token assertion.'
);
assert(
  findPrivateFunctionCalls(webSource).has('assertCiE2eTokenForWebAppIfConfigured_'),
  'Normal Web functions must retain the runtime token assertion call.'
);

assert(
  /DOMContentLoaded[\s\S]*?loadRecentImports\s*\(\s*\)/.test(indexSource),
  'Page initialization must load recent imports without user interaction.'
);
assert(
  /\.listRecentImportsFromWebApp\s*\(/.test(extractFunction(indexSource, 'loadRecentImports')),
  'loadRecentImports must call listRecentImportsFromWebApp.'
);

PRODUCTION_REFERENCE_FILES.forEach((relativePath) => {
  const source = read(relativePath);
  const privateCalls = findPrivateFunctionCalls(source);
  removeFunctionDefinitionNames(privateCalls, source);

  const unresolved = Array.from(privateCalls).filter(
    (functionName) => !productionFunctionDefinitions.has(functionName)
  );
  assert(
    unresolved.length === 0,
    relativePath + ' has unresolved production private references: ' + unresolved.join(', ')
  );
});

assert(
  /^src\/test\/\*\*$/m.test(productionIgnore),
  '.clasp.productionignore must keep excluding src/test/**.'
);
assert(
  /^src\/app\/e2e_helpers\.gs$/m.test(productionIgnore),
  '.clasp.productionignore must keep excluding src/app/e2e_helpers.gs.'
);
assert(
  !/^src\/app\/e2e_helpers\.gs$/m.test(ciIgnore),
  '.claspignore must not exclude src/app/e2e_helpers.gs from CI source.'
);

const behaviorSandbox = {
  properties: {},
  DB_CONFIG: {
    MAX_RECENT_IMPORTS: 20,
  },
  resolveDbTarget_(targetDbKey) {
    return {
      key: targetDbKey,
      label: 'Test DB',
      dbKind: 'nomura',
      dbKindLabel: 'Nomura',
    };
  },
  listRecentImports_() {
    return [];
  },
  text_(value) {
    return value === null || value === undefined ? '' : String(value);
  },
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(key) {
          return behaviorSandbox.properties[key] || '';
        },
        setProperty(key, value) {
          behaviorSandbox.properties[key] = String(value);
        },
        deleteProperty(key) {
          delete behaviorSandbox.properties[key];
        },
      };
    },
  },
};
vm.createContext(behaviorSandbox);
vm.runInContext(extractFunction(importSource, 'isTestDbTarget_'), behaviorSandbox);
INTERNAL_RUNTIME_FUNCTIONS.forEach((functionName) => {
  vm.runInContext(extractFunction(runtimeSupportSource, functionName), behaviorSandbox);
});
vm.runInContext(extractFunction(webSource, 'normalizeWebAppTargetPayload_'), behaviorSandbox);
vm.runInContext(extractFunction(webSource, 'listRecentImportsFromWebApp'), behaviorSandbox);

function resetProperties(nextProperties) {
  behaviorSandbox.properties = Object.assign({}, nextProperties || {});
}

function evaluate(expression) {
  return vm.runInContext(expression, behaviorSandbox);
}

function shouldUse(targetDbKey, propertyValue) {
  resetProperties({ CI_E2E_DISABLE_DB_FOLDER: propertyValue });
  return evaluate(
    'shouldUseCiE2eRootDbFolder_({ key: ' + JSON.stringify(targetDbKey) + ' });'
  );
}

assert(shouldUse('nomura_test', '') === false, 'Default operation must not use E2E root DB folder.');
assert(shouldUse('nomura_test', '1') === true, 'nomura_test must use root DB folder when CI_E2E_DISABLE_DB_FOLDER=1.');
assert(shouldUse('rakuten_test', '1') === true, 'rakuten_test must use root DB folder when CI_E2E_DISABLE_DB_FOLDER=1.');
assert(shouldUse('nomura_corp_a', '1') === false, 'Non-test Nomura DB must not use E2E root DB folder.');
assert(shouldUse('rakuten_corp_a', '1') === false, 'Non-test Rakuten DB must not use E2E root DB folder.');
assert(shouldUse('nomura_test', '0') === false, 'Only CI_E2E_DISABLE_DB_FOLDER=1 may enable E2E root DB folder.');

resetProperties();
evaluate('assertCiE2eTokenForWebAppIfConfigured_({});');
evaluate('assertCiE2eTokenForWebAppIfConfigured_({ ciE2eToken: "unexpected" });');
assert(
  evaluate('enableCiE2eRootDbFolderForPayload_({ ciE2eToken: "unexpected" });') === false,
  'Web app payload token must not enable root DB folder when CI_E2E_TOKEN is unset.'
);
assert(
  behaviorSandbox.properties.CI_E2E_DISABLE_DB_FOLDER !== '1',
  'CI_E2E_DISABLE_DB_FOLDER must stay unset when CI_E2E_TOKEN is unset.'
);
const initialRecentImports = evaluate("listRecentImportsFromWebApp({ targetDbKey: 'nomura_test' });");
assert(
  initialRecentImports.dbTargetKey === 'nomura_test' && initialRecentImports.imports.length === 0,
  'listRecentImportsFromWebApp must run when CI_E2E_TOKEN is unset.'
);

resetProperties({ CI_E2E_TOKEN: 'expected' });
assertThrows(
  () => evaluate('assertCiE2eTokenForWebAppIfConfigured_({});'),
  'E2E token is required.'
);
assertThrows(
  () => evaluate('assertCiE2eTokenForWebAppIfConfigured_({ ciE2eToken: "wrong" });'),
  'E2E token is invalid.'
);
evaluate('assertCiE2eTokenForWebAppIfConfigured_({ ciE2eToken: "expected" });');
assert(
  evaluate('enableCiE2eRootDbFolderForPayload_({ ciE2eToken: "expected" });') === true,
  'Matching configured E2E token must enable root DB folder.'
);
assert(
  behaviorSandbox.properties.CI_E2E_DISABLE_DB_FOLDER === '1',
  'CI_E2E_DISABLE_DB_FOLDER must be set after matching configured E2E token.'
);

resetProperties();
evaluate('assertConfiguredCiE2eTokenForPayload_({ ciE2eToken: "bootstrap" });');
assert(
  behaviorSandbox.properties.CI_E2E_TOKEN === 'bootstrap',
  'E2E public helper authentication must bootstrap CI_E2E_TOKEN when it is unset.'
);
assert(
  evaluate('enableCiE2eRootDbFolderForPayload_({ ciE2eToken: "bootstrap" });') === true,
  'E2E public helper payload must enable root DB folder after token bootstrap.'
);

const pageInitCalls = [];
const browserSandbox = {
  getSelectedRollbackDbTarget_() {
    return { key: 'nomura_test' };
  },
  updateRollbackDbSummary_() {},
  withCiE2eToken_(payload) {
    return payload;
  },
  renderError_(error) {
    throw error;
  },
  document: {
    getElementById() {
      return {
        innerHTML: '',
        appendChild() {},
      };
    },
    createElement() {
      return {
        value: '',
        textContent: '',
      };
    },
  },
};
const scriptRun = {
  withSuccessHandler() {
    return this;
  },
  withFailureHandler() {
    return this;
  },
  listRecentImportsFromWebApp(payload) {
    pageInitCalls.push(payload);
  },
};
browserSandbox.google = { script: { run: scriptRun } };
vm.createContext(browserSandbox);
vm.runInContext(extractFunction(indexSource, 'loadRecentImports'), browserSandbox);
vm.runInContext('loadRecentImports();', browserSandbox);
assert(
  pageInitCalls.length === 1 && pageInitCalls[0].targetDbKey === 'nomura_test',
  'Page initialization path must invoke listRecentImportsFromWebApp without a ReferenceError.'
);

console.log('production E2E helper boundary ok');
