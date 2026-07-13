#!/usr/bin/env node
'use strict';

const fs = require('fs');

function fail(message) {
  throw new Error(message);
}

function replaceExactlyOnce(source, pattern, replacement, label) {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    fail(`${label} must match exactly once; found ${matches.length}.`);
  }
  return source.replace(pattern, replacement);
}

function findMatchingDelimiter(source, startIndex, openChar, closeChar) {
  let depth = 0;
  let quote = '';
  let escaping = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  fail(`Could not find matching ${closeChar}.`);
}

function findPropertyBlock(source, propertyName, openChar, closeChar) {
  const propertyPattern = new RegExp(`\\b${propertyName}\\s*:`, 'g');
  const matches = [...source.matchAll(propertyPattern)];
  if (matches.length !== 1) {
    fail(`${propertyName} block must exist exactly once; found ${matches.length}.`);
  }

  const propertyEnd = matches[0].index + matches[0][0].length;
  const openIndex = source.indexOf(openChar, propertyEnd);
  if (openIndex < 0) {
    fail(`${propertyName} block is missing ${openChar}.`);
  }

  const closeIndex = findMatchingDelimiter(source, openIndex, openChar, closeChar);
  return { start: openIndex, end: closeIndex + 1 };
}

function findTopLevelObjectRanges(arraySource, absoluteOffset) {
  const ranges = [];
  let quote = '';
  let escaping = false;
  let lineComment = false;
  let blockComment = false;
  let depth = 0;
  let objectStart = -1;

  for (let index = 0; index < arraySource.length; index += 1) {
    const char = arraySource[index];
    const next = arraySource[index + 1];

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        objectStart = index;
      }
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        ranges.push({
          start: absoluteOffset + objectStart,
          end: absoluteOffset + index + 1,
        });
        objectStart = -1;
      }
      if (depth < 0) {
        fail('TARGET_DBS array has unbalanced object braces.');
      }
    }
  }

  if (depth !== 0) {
    fail('TARGET_DBS array has unbalanced object braces.');
  }

  return ranges;
}

function getTargetDbBlocks(source) {
  const arrayRange = findPropertyBlock(source, 'TARGET_DBS', '[', ']');
  const arrayInnerStart = arrayRange.start + 1;
  const arrayInner = source.slice(arrayInnerStart, arrayRange.end - 1);
  return findTopLevelObjectRanges(arrayInner, arrayInnerStart).map((range) => {
    const block = source.slice(range.start, range.end);
    const keyMatches = [...block.matchAll(/\bkey\s*:\s*'([^']+)'/g)];
    if (keyMatches.length !== 1) {
      fail('Each TARGET_DBS object must contain exactly one string key.');
    }
    return {
      ...range,
      key: keyMatches[0][1],
      block,
    };
  });
}

function replaceStringPropertyInRange(source, range, propertyName, value) {
  const block = source.slice(range.start, range.end);
  const pattern = new RegExp(`(\\b${propertyName}\\s*:\\s*)'[^']*'`, 'g');
  const matches = [...block.matchAll(pattern)];
  if (matches.length !== 1) {
    fail(`${range.key || 'target block'}.${propertyName} must match exactly once; found ${matches.length}.`);
  }

  const match = matches[0];
  const replacement = `${match[1]}'${value}'`;
  return source.slice(0, range.start + match.index) +
    replacement +
    source.slice(range.start + match.index + match[0].length);
}

function getStringPropertyFromBlock(block, propertyName) {
  const pattern = new RegExp(`\\b${propertyName}\\s*:\\s*'([^']*)'`, 'g');
  const matches = [...block.matchAll(pattern)];
  if (matches.length !== 1) {
    fail(`${propertyName} must match exactly once; found ${matches.length}.`);
  }
  return matches[0][1];
}

function inspectDbConfigSource(source) {
  const dbFolderMatches = [...source.matchAll(/\bDB_FOLDER_ID\s*:\s*'([^']*)'/g)];
  if (dbFolderMatches.length !== 1) {
    fail(`DB_FOLDER_ID must match exactly once; found ${dbFolderMatches.length}.`);
  }

  const targetBlocks = getTargetDbBlocks(source);
  const targetByKey = new Map();
  targetBlocks.forEach((target) => {
    if (targetByKey.has(target.key)) {
      fail(`TARGET_DBS contains duplicate key: ${target.key}.`);
    }
    targetByKey.set(target.key, {
      spreadsheetId: getStringPropertyFromBlock(target.block, 'spreadsheetId'),
    });
  });

  const testOutputRange = findPropertyBlock(source, 'TEST_OUTPUT_SPREADSHEET', '{', '}');
  const testOutputBlock = source.slice(testOutputRange.start, testOutputRange.end);

  return {
    dbFolderId: dbFolderMatches[0][1],
    targets: Object.fromEntries(targetByKey),
    testOutputSpreadsheetId: getStringPropertyFromBlock(testOutputBlock, 'spreadsheetId'),
  };
}

function assertPreparedDbConfig(source) {
  const inspected = inspectDbConfigSource(source);
  const requiredTargets = ['nomura_test', 'nomura_corp_a', 'nomura_corp_b'];

  requiredTargets.forEach((key) => {
    if (!inspected.targets[key]) {
      fail(`TARGET_DBS is missing ${key}.`);
    }
  });

  if (inspected.targets.nomura_test.spreadsheetId !== '') {
    fail('nomura_test.spreadsheetId must be empty in CI-local Web E2E source.');
  }
  if (inspected.targets.nomura_corp_a.spreadsheetId === '') {
    fail('nomura_corp_a.spreadsheetId must remain configured.');
  }
  if (inspected.targets.nomura_corp_b.spreadsheetId === '') {
    fail('nomura_corp_b.spreadsheetId must remain configured.');
  }
  if (inspected.testOutputSpreadsheetId !== '') {
    fail('TEST_OUTPUT_SPREADSHEET.spreadsheetId must be empty in CI-local Web E2E source.');
  }
  if (inspected.dbFolderId !== '') {
    fail('DB_CONFIG.DB_FOLDER_ID must be empty in CI-local Web E2E source.');
  }
}

function transformDbConfigSource(source) {
  let result = source;
  result = replaceExactlyOnce(
    result,
    /\bDB_FOLDER_ID\s*:\s*'[^']*'/g,
    "DB_FOLDER_ID: ''",
    'DB_CONFIG.DB_FOLDER_ID'
  );

  const targetBlocks = getTargetDbBlocks(result);
  const nomuraTestTargets = targetBlocks.filter((target) => target.key === 'nomura_test');
  if (nomuraTestTargets.length !== 1) {
    fail(`nomura_test target must exist exactly once; found ${nomuraTestTargets.length}.`);
  }
  result = replaceStringPropertyInRange(result, nomuraTestTargets[0], 'spreadsheetId', '');

  const testOutputRange = findPropertyBlock(result, 'TEST_OUTPUT_SPREADSHEET', '{', '}');
  result = replaceStringPropertyInRange(result, testOutputRange, 'spreadsheetId', '');
  assertPreparedDbConfig(result);
  return result;
}

function transformManifestSource(source) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch (error) {
    fail(`Invalid appsscript.json: ${error.message}`);
  }

  manifest.webapp = {
    access: 'ANYONE_ANONYMOUS',
    executeAs: 'USER_DEPLOYING',
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function prepareWebE2eSource({ manifestPath, dbConfigPath }) {
  fs.writeFileSync(
    manifestPath,
    transformManifestSource(fs.readFileSync(manifestPath, 'utf8'))
  );

  fs.writeFileSync(
    dbConfigPath,
    transformDbConfigSource(fs.readFileSync(dbConfigPath, 'utf8'))
  );
}

function main(argv) {
  const manifestPath = argv[2] || 'appsscript.json';
  const dbConfigPath = argv[3] || 'src/app/db_config.gs';
  prepareWebE2eSource({ manifestPath, dbConfigPath });
  console.log('CI Web E2E source overrides validated without printing IDs.');
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    console.error(`::error title=Invalid CI Web E2E source override::${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  assertPreparedDbConfig,
  inspectDbConfigSource,
  transformDbConfigSource,
  transformManifestSource,
};
