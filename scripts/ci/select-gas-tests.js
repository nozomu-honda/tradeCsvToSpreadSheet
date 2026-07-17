#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  createFullGasTestSelection,
  selectGasTestsByChangedFiles,
  validateAndResolveGasTestSelection,
} = require('./gas-test-selection');

function parseArguments(argv) {
  const options = { forceFull: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--force-full') {
      options.forceFull = true;
      continue;
    }
    if (['--base-sha', '--head-sha', '--output'].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function assertCommitSha(value, label) {
  if (!/^[0-9a-f]{40}$/i.test(value || '')) {
    throw new Error(`${label} must be a full commit SHA`);
  }
}

function readChangedFiles(baseSha, headSha) {
  const result = spawnSync('git', ['diff', '--name-only', '-z', '--diff-filter=ACDMRTUXB', `${baseSha}...${headSha}`], {
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error('git diff failed while selecting GAS Tests');
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  assertCommitSha(options.baseSha, 'base SHA');
  assertCommitSha(options.headSha, 'head SHA');
  if (!options.output) throw new Error('--output is required');

  let changedFiles = [];
  let selection;
  try {
    changedFiles = readChangedFiles(options.baseSha, options.headSha);
    selection = selectGasTestsByChangedFiles(changedFiles, { forceFull: options.forceFull });
  } catch (error) {
    selection = createFullGasTestSelection([], 'changed file collection failed; full GAS Tests selected');
    console.warn('GAS Tests changed file collection failed; using full mode.');
  }
  selection = validateAndResolveGasTestSelection(selection);
  const outputPath = path.resolve(options.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(selection, null, 2)}\n`, { mode: 0o600 });

  console.log(`GAS Tests selection: mode=${selection.mode}, suites=${selection.suites.length}, tests=${selection.testCount}`);
  if (selection.fullFallbackReason) {
    console.log(`GAS Tests full fallback: ${selection.fullFallbackReason}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`::error title=GAS Tests selection failed::${error.message}`);
    process.exit(1);
  }
}

module.exports = { parseArguments, readChangedFiles };
