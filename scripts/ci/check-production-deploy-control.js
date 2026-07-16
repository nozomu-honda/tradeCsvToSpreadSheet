#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'production-deploy-control.yml');
const controlDocPath = path.join(repoRoot, 'docs', 'production-deploy-control.md');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const controlDoc = fs.readFileSync(controlDocPath, 'utf8');
const normalizedWorkflow = workflow.replace(/\r\n/g, '\n');

function includes(pattern, message) {
  assert.ok(workflow.includes(pattern), message || `Expected to find: ${pattern}`);
}

includes('pull_request_target:', 'control workflow must use pull_request_target so PR labels can trigger from the default branch');
includes('- labeled', 'control workflow must only react to PR label events');
includes('actions: write', 'control workflow needs only workflow dispatch permission for Actions');
includes('pull-requests: read', 'control workflow must read merged PR metadata');
includes('issues: write', 'control workflow must remove trigger labels');
assert.ok(!workflow.includes('actions/checkout'), 'control workflow must not checkout PR code');
assert.ok(!workflow.includes('github.event.pull_request.head.sha'), 'control workflow must not execute or trust PR head code');
assert.ok(!workflow.includes('secrets.CLASP_PRODUCTION_CREDENTIALS'), 'control workflow must not read production clasp secrets');
assert.ok(!workflow.includes('environment:'), 'control workflow must not enter the production Environment');

const workflowLines = normalizedWorkflow.split('\n');
const pathsIgnoreLineIndex = workflowLines.indexOf('    paths-ignore:');
assert.ok(pathsIgnoreLineIndex >= 0, 'control workflow must define docs-only paths-ignore filters');
assert.strictEqual(
  workflowLines.filter((line) => line === '    paths-ignore:').length,
  1,
  'control workflow must define exactly one pull_request_target paths-ignore block'
);
const actualDocsOnlyPaths = [];
for (const line of workflowLines.slice(pathsIgnoreLineIndex + 1)) {
  const match = line.match(/^      - '([^']+)'$/);
  if (!match) break;
  actualDocsOnlyPaths.push(match[1]);
}
assert.deepStrictEqual(
  actualDocsOnlyPaths,
  ['docs/**', 'README.md', 'AGENTS.md', 'CLAUDE.md', 'src/app/README.md', 'src/test/README.md'],
  'control workflow must ignore exactly the six approved docs-only path patterns'
);

[
  'deploy-production-dry-run',
  'deploy-production',
  'deploy-production-force',
].forEach((labelName) => includes(labelName, `${labelName} must be supported by the control workflow`));

includes("context.eventName !== 'pull_request_target' || context.payload.action !== 'labeled'", 'control workflow must validate the event shape');
includes('pull request is not merged', 'control workflow must reject unmerged PRs');
includes("pr.base.ref !== 'develop'", 'control workflow must require develop base');
includes('pr.head.repo.full_name !== pr.base.repo.full_name', 'control workflow must reject forks and external PRs');
includes('/^[0-9a-f]{40}$/i.test(pr.merge_commit_sha)', 'control workflow must require a full merge commit SHA');
includes('pr.merge_commit_sha !== develop.commit.sha', 'control workflow must require the merged PR commit to be latest develop');
includes('workflow_id: \'deploy-production.yml\'', 'control workflow must dispatch the deploy workflow');
includes("ref: 'develop'", 'control workflow must dispatch on develop, not on main or PR head');
includes('target_sha: pr.merge_commit_sha', 'control workflow must pass the actual target develop SHA');
includes('source_pr_number: String(pr.number)', 'control workflow must preserve source PR traceability');
includes('removeTriggerLabel', 'control workflow must remove labels so re-labeling can re-run');

assert.ok(!/[A-Za-z0-9_-]{35,}\.apps\.googleusercontent\.com/.test(workflow), 'workflow must not contain OAuth client IDs');
assert.ok(!/AKIA[0-9A-Z]{16}/.test(workflow), 'workflow must not contain access keys');

assert.ok(controlDoc.includes('default branchは `main`'), 'docs must state that the default branch is main');
assert.ok(controlDoc.includes('`main` へ同期する後続対応が必要'), 'docs must keep main workflow sync as an unfinished follow-up');
assert.ok(controlDoc.includes('PR #84をdevelopへマージした後'), 'docs must not treat develop merge alone as completion');

console.log('production deploy control checks passed');
