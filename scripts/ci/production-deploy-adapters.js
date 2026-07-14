'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { runProductionSmokeTest } = require('./production-smoke-test');

const DEFAULT_VALIDATION_SCRIPTS = [
  'test:gas-production-wrapper',
  'test:production-e2e-boundary',
  'test:production-deploy-workflow',
  'test:production-status-renderer',
  'test:production-deploy-state',
  'test:production-deploy-orchestrator',
  'test:production-status-parser',
  'test:production-smoke-test',
];

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function claspCommand(cwd) {
  const name = process.platform === 'win32' ? 'clasp.cmd' : 'clasp';
  return path.join(cwd, 'node_modules', '.bin', name);
}

function redactText(text, values) {
  let result = String(text || '');
  for (const value of values.filter(Boolean)) {
    result = result.split(String(value)).join('***');
  }
  return result;
}

function collectJsonLeafValues(value, out = []) {
  if (typeof value === 'string' && value) {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLeafValues(item, out));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectJsonLeafValues(item, out));
  }
  return out;
}

function parseProductionCredentials(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('CLASP_PRODUCTION_CREDENTIALS must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('CLASP_PRODUCTION_CREDENTIALS must be a JSON object.');
  }
  if (!parsed.tokens || !parsed.tokens.production) {
    throw new Error('CLASP_PRODUCTION_CREDENTIALS must contain tokens.production for clasp --user production.');
  }
  return parsed;
}

function createNodeAdapters({
  env = process.env,
  cwd = process.cwd(),
  validationScripts = DEFAULT_VALIDATION_SCRIPTS,
} = {}) {
  const redactValues = [];

  function run(command, args, options = {}) {
    const values = [...redactValues, ...(options.redactValues || [])];
    const result = spawnSync(command, args, {
      cwd: options.cwd || cwd,
      env: options.env || env,
      input: options.input,
      encoding: 'utf8',
      stdio: options.capture ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
    });
    if (result.status !== 0) {
      const commandLine = redactText(`${command} ${args.join(' ')}`, values);
      const stderr = options.capture ? `\n${redactText(result.stderr || '', values)}` : '';
      throw new Error(`${commandLine} failed with exit code ${result.status}.${stderr}`);
    }
    return options.capture ? (result.stdout || '').trim() : '';
  }

  function git(args) {
    return run('git', args, { capture: true });
  }

  async function githubRequest(method, apiPath, body) {
    const apiBase = env.GITHUB_API_URL || 'https://api.github.com';
    const response = await fetch(`${apiBase}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'trade-csv-to-spreadsheet-production-deploy',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GitHub API ${method} ${apiPath} failed with ${response.status}: ${text}`);
    }
    return text ? JSON.parse(text) : {};
  }

  function addMasksFromEnv() {
    if (env.GITHUB_ACTIONS !== 'true') {
      return;
    }
    const values = [
      env.PRODUCTION_SCRIPT_ID,
      env.PRODUCTION_DEPLOYMENT_ID,
      env.PRODUCTION_WEB_APP_URL,
    ];
    if (env.CLASP_PRODUCTION_CREDENTIALS) {
      try {
        values.push(...collectJsonLeafValues(JSON.parse(env.CLASP_PRODUCTION_CREDENTIALS)));
      } catch (error) {
        // Validation reports malformed JSON later. Do not print the raw value here.
      }
    }
    values.filter(Boolean).forEach((value) => {
      redactValues.push(value);
      process.stdout.write(`::add-mask::${String(value).replace(/\r?\n/g, '')}\n`);
    });
  }

  function writeProductionClaspFiles() {
    const credentials = parseProductionCredentials(env.CLASP_PRODUCTION_CREDENTIALS);
    const examplePath = path.join(cwd, '.clasp.production.example.json');
    const project = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
    project.scriptId = env.PRODUCTION_SCRIPT_ID;

    const rcPath = path.join(os.homedir(), '.clasprc.json');
    const projectPath = path.join(cwd, '.clasp.production.json');
    fs.writeFileSync(rcPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
    fs.writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`, { mode: 0o600 });
    return { rcPath, projectPath };
  }

  function cleanupProductionClaspFiles(paths) {
    for (const filePath of [paths && paths.rcPath, paths && paths.projectPath].filter(Boolean)) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch (error) {
        process.stderr.write(`Warning: failed to remove temporary production clasp file: ${error.message}\n`);
      }
    }
  }

  return {
    env,
    validationScripts,
    addMasksFromEnv,
    log(message) {
      process.stdout.write(`${message}\n`);
    },
    warn(message) {
      process.stderr.write(`Warning: ${message}\n`);
    },
    writeStepSummary(markdown) {
      if (env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
      } else {
        process.stdout.write(`${markdown}\n`);
      }
    },
    fetchDevelop() {
      git(['fetch', '--no-tags', 'origin', 'develop']);
    },
    getHeadSha() {
      return git(['rev-parse', 'HEAD']);
    },
    getOriginDevelopSha() {
      return git(['rev-parse', 'origin/develop']);
    },
    getCurrentBranch() {
      return git(['branch', '--show-current']);
    },
    runNpmCi() {
      run(npmCommand(), ['ci']);
    },
    runValidationScript(script) {
      run(npmCommand(), ['run', script]);
    },
    writeProductionClaspFiles,
    cleanupProductionClaspFiles,
    runProductionStatusCheck() {
      return run(npmCommand(), ['run', 'gas:production:status', '--', '--json'], {
        capture: true,
        redactValues,
      });
    },
    runProductionSourcePush() {
      const output = run(npmCommand(), ['run', 'gas:production:push'], {
        input: 'PRODUCTION PUSH\n',
        capture: true,
        redactValues,
      });
      process.stdout.write(`${redactText(output, redactValues)}\n`);
    },
    updateAppsScriptDeployment(targetSha) {
      const output = run(claspCommand(cwd), [
        '--user',
        'production',
        '--project',
        '.clasp.production.json',
        '--ignore',
        '.clasp.productionignore',
        'deploy',
        '--deploymentId',
        env.PRODUCTION_DEPLOYMENT_ID,
        '--description',
        `production ${targetSha.slice(0, 12)} ${new Date().toISOString()}`,
      ], {
        capture: true,
        redactValues,
      });
      process.stdout.write(`${redactText(output, redactValues)}\n`);
    },
    runSmokeTest() {
      return runProductionSmokeTest({
        url: env.PRODUCTION_WEB_APP_URL,
        expectedMarker: env.PRODUCTION_SMOKE_EXPECTED_MARKER || 'CSV / スプレッドシートから6シート生成',
      });
    },
    githubRequest,
  };
}

module.exports = {
  DEFAULT_VALIDATION_SCRIPTS,
  collectJsonLeafValues,
  createNodeAdapters,
  parseProductionCredentials,
  redactText,
};
