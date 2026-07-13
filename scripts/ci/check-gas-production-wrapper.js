#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..', '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-production-wrapper-'));

try {
  const tempScriptsDir = path.join(tempRoot, 'scripts');
  const fakeBinDir = path.join(tempRoot, 'bin');
  const fakeLogPath = path.join(tempRoot, 'fake-clasp-args.jsonl');

  fs.mkdirSync(tempScriptsDir, { recursive: true });
  fs.mkdirSync(fakeBinDir, { recursive: true });
  fs.copyFileSync(
    path.join(rootDir, 'scripts', 'gas-production.js'),
    path.join(tempScriptsDir, 'gas-production.js')
  );
  fs.copyFileSync(
    path.join(rootDir, '.clasp.productionignore'),
    path.join(tempRoot, '.clasp.productionignore')
  );

  fs.writeFileSync(
    path.join(tempRoot, '.clasp.production.json'),
    JSON.stringify({
      scriptId: 'TEST_PRODUCTION_SCRIPT_ID_FOR_WRAPPER_CHECK',
      rootDir: '.',
      scriptExtensions: ['.js', '.gs'],
      htmlExtensions: ['.html'],
      jsonExtensions: ['.json'],
      filePushOrder: [],
      skipSubdirectories: false,
    }, null, 2) + '\n'
  );

  writeFakeClasp(fakeBinDir);
  const childEnv = withPrependedPath(process.env, fakeBinDir);

  const result = spawnSync(
    process.execPath,
    [path.join(tempScriptsDir, 'gas-production.js'), 'status'],
    {
      cwd: tempRoot,
      encoding: 'utf8',
      env: {
        ...childEnv,
        FAKE_CLASP_LOG: fakeLogPath,
      },
    }
  );

  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.stderr.write(`fake bin: ${fakeBinDir}\n`);
    process.stderr.write(`fake log exists: ${fs.existsSync(fakeLogPath)}\n`);
    if (fs.existsSync(fakeLogPath)) {
      process.stderr.write(fs.readFileSync(fakeLogPath, 'utf8'));
    }
    fail(`gas-production status wrapper exited with ${result.status}`);
  }

  const calls = fs.readFileSync(fakeLogPath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assertDeepEqual(calls[0], ['--user', 'production', 'show-authorized-user'], 'authorization check args');
  assertDeepEqual(
    calls[1],
    [
      '--user',
      'production',
      '--project',
      '.clasp.production.json',
      '--ignore',
      '.clasp.productionignore',
      'show-file-status',
    ],
    'production status args'
  );

  if (calls.length !== 2) {
    fail(`expected exactly 2 fake clasp calls, got ${calls.length}`);
  }

  console.log('gas-production wrapper args ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function writeFakeClasp(fakeBinDir) {
  const fakeClaspJs = path.join(fakeBinDir, 'clasp.js');
  fs.writeFileSync(
    fakeClaspJs,
    `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CLASP_LOG, JSON.stringify(args) + '\\n');
const command = args[args.length - 1];
if (command === 'show-authorized-user') {
  console.log('production@example.invalid');
  process.exit(0);
}
if (command === 'show-file-status') {
  console.log('fake file status');
  process.exit(0);
}
console.error('unexpected fake clasp command: ' + args.join(' '));
process.exit(2);
`
  );

  const fakeClaspSh = path.join(fakeBinDir, 'clasp');
  fs.writeFileSync(
    fakeClaspSh,
    `#!/usr/bin/env sh
exec node "$(dirname "$0")/clasp.js" "$@"
`
  );
  fs.chmodSync(fakeClaspSh, 0o755);

  const fakeClaspCmd = path.join(fakeBinDir, 'clasp.cmd');
  fs.writeFileSync(
    fakeClaspCmd,
    `@echo off
node "%~dp0clasp.js" %*
`,
    'ascii'
  );
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} mismatch\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`);
  }
}

function withPrependedPath(sourceEnv, firstPath) {
  const env = {};
  let originalPath = '';

  for (const [key, value] of Object.entries(sourceEnv)) {
    if (key.toLowerCase() === 'path') {
      originalPath = originalPath || value;
    } else {
      env[key] = value;
    }
  }

  env.PATH = `${firstPath}${path.delimiter}${originalPath}`;
  env.Path = env.PATH;
  return env;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
