#!/usr/bin/env node
'use strict';

const {
  createNodeStatusSyncAdapters,
  runProductionStatusSync,
} = require('./production-status-sync');

runProductionStatusSync({
  env: process.env,
  adapters: createNodeStatusSyncAdapters(process.env),
}).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
