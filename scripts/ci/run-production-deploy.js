#!/usr/bin/env node
'use strict';

const { createNodeAdapters } = require('./production-deploy-adapters');
const { runProductionDeploy } = require('./production-deploy-orchestrator');

runProductionDeploy({
  env: process.env,
  adapters: createNodeAdapters(),
}).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
