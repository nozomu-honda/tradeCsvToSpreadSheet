const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const appDir = path.join(repoRoot, 'src', 'app');

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

const dbSource = read('src/app/db.gs');
const importSource = read('src/app/import.gs');
const e2eSource = read('src/app/e2e_helpers.gs');
const productionIgnore = read('.clasp.productionignore');
const ciIgnore = read('.claspignore');

const productionAppSources = fs.readdirSync(appDir)
  .filter((fileName) => fileName.endsWith('.gs'))
  .filter((fileName) => fileName !== 'e2e_helpers.gs')
  .map((fileName) => fs.readFileSync(path.join(appDir, fileName), 'utf8'))
  .join('\n');

assert(
  countFunctionDefinitions(dbSource, 'shouldUseCiE2eRootDbFolder_') === 1,
  'shouldUseCiE2eRootDbFolder_ must be defined once in src/app/db.gs.'
);
assert(
  countFunctionDefinitions(e2eSource, 'shouldUseCiE2eRootDbFolder_') === 0,
  'shouldUseCiE2eRootDbFolder_ must not be defined in src/app/e2e_helpers.gs.'
);
assert(
  countFunctionDefinitions(productionAppSources, 'shouldUseCiE2eRootDbFolder_') === 1,
  'Production app sources must define shouldUseCiE2eRootDbFolder_ exactly once.'
);
assert(
  countFunctionDefinitions(productionAppSources, 'isTestDbTarget_') === 1,
  'Production app sources must define isTestDbTarget_ exactly once.'
);

[
  'prepareE2EWebAppRun',
  'cleanupE2EImportFromWebApp',
  'inspectE2EOutputSpreadsheetFromWebApp',
].forEach((functionName) => {
  assert(
    countFunctionDefinitions(productionAppSources, functionName) === 0,
    functionName + ' must remain outside production app sources.'
  );
  assert(
    countFunctionDefinitions(e2eSource, functionName) === 1,
    functionName + ' must remain in src/app/e2e_helpers.gs.'
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
  propertyValue: '',
  text_(value) {
    return value === null || value === undefined ? '' : String(value);
  },
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty() {
          return behaviorSandbox.propertyValue;
        },
      };
    },
  },
};
vm.createContext(behaviorSandbox);
vm.runInContext(extractFunction(importSource, 'isTestDbTarget_'), behaviorSandbox);
vm.runInContext(extractFunction(dbSource, 'shouldUseCiE2eRootDbFolder_'), behaviorSandbox);

function shouldUse(targetDbKey, propertyValue) {
  behaviorSandbox.propertyValue = propertyValue;
  return vm.runInContext(
    'shouldUseCiE2eRootDbFolder_({ key: ' + JSON.stringify(targetDbKey) + ' });',
    behaviorSandbox
  );
}

assert(shouldUse('nomura_test', '') === false, 'Default operation must not use E2E root DB folder.');
assert(shouldUse('nomura_test', '1') === true, 'nomura_test must use root DB folder when CI_E2E_DISABLE_DB_FOLDER=1.');
assert(shouldUse('rakuten_test', '1') === true, 'rakuten_test must use root DB folder when CI_E2E_DISABLE_DB_FOLDER=1.');
assert(shouldUse('nomura_corp_a', '1') === false, 'Non-test Nomura DB must not use E2E root DB folder.');
assert(shouldUse('rakuten_corp_a', '1') === false, 'Non-test Rakuten DB must not use E2E root DB folder.');
assert(shouldUse('nomura_test', '0') === false, 'Only CI_E2E_DISABLE_DB_FOLDER=1 may enable E2E root DB folder.');

console.log('production E2E helper boundary ok');
