#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const deployWorkflow = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'deploy-production.yml'), 'utf8');
const statusWorkflow = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'update-production-status.yml'), 'utf8');

function concurrencyGroup(workflow) {
  const match = workflow.match(/concurrency:\s*\n\s+group:\s*([^\n]+)\n\s+cancel-in-progress:\s*([^\n]+)/);
  assert.ok(match, 'workflow must define concurrency group and cancel-in-progress');
  return {
    group: match[1].trim(),
    cancelInProgress: match[2].trim(),
  };
}

const deploy = concurrencyGroup(deployWorkflow);
const status = concurrencyGroup(statusWorkflow);

assert.strictEqual(deploy.group, 'production-state', 'deploy workflow must use the shared production-state group');
assert.strictEqual(status.group, 'production-state', 'status sync workflow must use the shared production-state group');
assert.strictEqual(deploy.group, status.group, 'deploy and status sync must not update the Status Issue concurrently');
assert.strictEqual(deploy.cancelInProgress, 'false', 'deploy workflow must not cancel an in-progress production state update');
assert.strictEqual(status.cancelInProgress, 'false', 'status sync workflow must not cancel an in-progress production deploy');
assert.ok(!statusWorkflow.includes('environment:'), 'metadata sync must not enter the production Environment');
assert.ok(!statusWorkflow.includes('CLASP_PRODUCTION_CREDENTIALS'), 'metadata sync must not use production clasp secrets');

console.log('production state concurrency checks passed');
