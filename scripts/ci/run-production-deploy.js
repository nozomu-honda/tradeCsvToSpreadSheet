#!/usr/bin/env node
'use strict';

const { createNodeAdapters } = require('./production-deploy-adapters');
const { runProductionDeploy } = require('./production-deploy-orchestrator');
const fs = require('fs');

function writeGitHubOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT || !outputs) {
    return;
  }
  const lines = Object.entries(outputs).map(([key, value]) => {
    const safeValue = String(value === undefined || value === null ? '' : value).replace(/\r?\n/g, '');
    return `${key}=${safeValue}`;
  });
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

runProductionDeploy({
  env: process.env,
  adapters: createNodeAdapters(),
}).then((result) => {
  if (result && result.phase === 'preflight') {
    writeGitHubOutputs(result.outputs);
  }
}).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
