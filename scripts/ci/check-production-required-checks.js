#!/usr/bin/env node
'use strict';

const assert = require('assert');

const {
  DEFAULT_REQUIRED_CHECKS,
  requiredCheckNames,
} = require('./production-deploy-orchestrator');

const defaultGasCheck = 'Push test GAS project and run tests';

assert.deepStrictEqual(DEFAULT_REQUIRED_CHECKS, [defaultGasCheck], 'default GAS check must remain the baseline');
assert.deepStrictEqual(
  requiredCheckNames({}),
  [defaultGasCheck],
  'unset PRODUCTION_REQUIRED_CHECKS must still require the default GAS check',
);
assert.deepStrictEqual(
  requiredCheckNames({ PRODUCTION_REQUIRED_CHECKS: 'Deploy test Web app and run Playwright E2E' }),
  [defaultGasCheck, 'Deploy test Web app and run Playwright E2E'],
  'configured production checks must be added to the default check',
);
assert.deepStrictEqual(
  requiredCheckNames({ PRODUCTION_REQUIRED_CHECKS: `${defaultGasCheck}, Deploy test Web app and run Playwright E2E` }),
  [defaultGasCheck, 'Deploy test Web app and run Playwright E2E'],
  'configured duplicate default check must be de-duplicated',
);
assert.deepStrictEqual(
  requiredCheckNames({ PRODUCTION_REQUIRED_CHECKS: '\n Deploy test Web app and run Playwright E2E \n\n, Another required check ,' }),
  [defaultGasCheck, 'Deploy test Web app and run Playwright E2E', 'Another required check'],
  'comma and newline separated checks must be trimmed and filtered',
);
assert.deepStrictEqual(
  requiredCheckNames({ PRODUCTION_REQUIRED_CHECKS: '  ,  \n' }),
  [defaultGasCheck],
  'blank configured values must not remove the default check',
);

console.log('production required checks checks passed');
