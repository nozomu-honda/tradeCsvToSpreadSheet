'use strict';

const VALID_PRODUCTION_STATES = [
  'unknown',
  'not-deployed',
  'preflight',
  'source-pushed',
  'deployment-updated',
  'verifying',
  'deployed',
  'failed',
];

const MUTATING_STATES = [
  'source-pushed',
  'deployment-updated',
  'verifying',
  'deployed',
];

function assertValidProductionState(status) {
  if (!VALID_PRODUCTION_STATES.includes(status)) {
    throw new Error(`Unknown production deploy state: ${status}`);
  }
}

function isFullSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function shortSha(value) {
  if (!value || value === 'unknown') {
    return 'unknown';
  }
  return String(value).slice(0, 12);
}

function resolveTargetSha({ targetSha, latestDevelopSha }) {
  if (!isFullSha(latestDevelopSha)) {
    throw new Error('latestDevelopSha must be a full git SHA.');
  }

  const resolved = targetSha && targetSha.trim() ? targetSha.trim() : latestDevelopSha;
  if (!isFullSha(resolved)) {
    throw new Error('target_sha must be empty or a full git SHA.');
  }
  if (resolved !== latestDevelopSha) {
    throw new Error('target_sha must match the latest origin/develop commit.');
  }
  return resolved;
}

function createInitialProductionDeployState({
  targetSha,
  latestDevelopSha,
  dryRun = true,
  force = false,
  workflowRunUrl = '',
  previousProductionSha = 'unknown',
  currentProductionSha = previousProductionSha,
  commitsBehindDevelop = 'unknown',
  status = 'preflight',
} = {}) {
  assertValidProductionState(status);
  return {
    status,
    targetSha: targetSha || 'unknown',
    latestDevelopSha: latestDevelopSha || 'unknown',
    previousProductionSha: previousProductionSha || 'unknown',
    currentProductionSha: currentProductionSha || 'unknown',
    commitsBehindDevelop,
    dryRun: Boolean(dryRun),
    force: Boolean(force),
    workflowRunUrl,
    sourcePush: 'not-started',
    deploymentUpdate: 'not-started',
    smokeTest: 'not-started',
    lastFailureStage: '',
    failureMessage: '',
    updatedAt: new Date().toISOString(),
  };
}

function markProductionDeployState(state, status, patch = {}) {
  assertValidProductionState(status);
  const next = {
    ...state,
    ...patch,
    status,
    updatedAt: patch.updatedAt || new Date().toISOString(),
  };

  if (status === 'source-pushed') {
    next.sourcePush = patch.sourcePush || 'success';
  }
  if (status === 'deployment-updated') {
    next.deploymentUpdate = patch.deploymentUpdate || 'success';
  }
  if (status === 'verifying') {
    next.smokeTest = patch.smokeTest || 'running';
  }
  if (status === 'deployed') {
    next.currentProductionSha = patch.currentProductionSha || state.targetSha || 'unknown';
    next.sourcePush = patch.sourcePush || 'success';
    next.deploymentUpdate = patch.deploymentUpdate || 'success';
    next.smokeTest = patch.smokeTest || 'success';
    next.lastFailureStage = '';
    next.failureMessage = '';
  }
  return next;
}

function failProductionDeployState(state, stage, error) {
  const failureMessage = error instanceof Error ? error.message : String(error || 'Unknown failure');
  return {
    ...state,
    status: 'failed',
    lastFailureStage: stage || 'unknown',
    failureMessage,
    updatedAt: new Date().toISOString(),
  };
}

function shouldBlockDuplicateDeployment({ currentProductionSha, productionStatus, targetSha, force = false }) {
  if (force) {
    return { blocked: false, reason: '' };
  }
  if (productionStatus === 'deployed' && currentProductionSha === targetSha) {
    return {
      blocked: true,
      reason: 'target_sha is already recorded as deployed. Re-run with force=true only when redeploy is intentional.',
    };
  }
  return { blocked: false, reason: '' };
}

function parseProductionStatusIssue(body) {
  const result = {
    productionStatus: 'unknown',
    currentProductionSha: 'unknown',
    latestDevelopSha: 'unknown',
    commitsBehindDevelop: 'unknown',
    lastFailureStage: '',
  };
  if (!body) {
    return result;
  }

  const normalized = String(body);
  const statusMatch = normalized.match(/^- 状態:\s*`?([a-z-]+)`?/m);
  const productionMatch = normalized.match(/^- 本番commit:\s*`?([0-9a-f]{40}|unknown)`?/im);
  const latestMatch = normalized.match(/^- 最新develop:\s*`?([0-9a-f]{40}|unknown)`?/im);
  const behindMatch = normalized.match(/^- developとの差分:\s*`?([^`\n]+)`?/m);
  const failureMatch = normalized.match(/^- 最終失敗ステージ:\s*`?([^`\n]*)`?/m);

  if (statusMatch && VALID_PRODUCTION_STATES.includes(statusMatch[1])) {
    result.productionStatus = statusMatch[1];
  }
  if (productionMatch) {
    result.currentProductionSha = productionMatch[1];
  }
  if (latestMatch) {
    result.latestDevelopSha = latestMatch[1];
  }
  if (behindMatch) {
    result.commitsBehindDevelop = behindMatch[1].trim();
  }
  if (failureMatch) {
    result.lastFailureStage = failureMatch[1].trim();
  }
  return result;
}

function calculateBehindDevelop({ currentProductionSha, latestDevelopSha, isAncestor, commitCount }) {
  if (!isFullSha(currentProductionSha) || !isFullSha(latestDevelopSha)) {
    return 'unknown';
  }
  if (currentProductionSha === latestDevelopSha) {
    return '0 commits';
  }
  if (!isAncestor) {
    return 'unknown-diverged';
  }
  return `${Number(commitCount)} commits`;
}

module.exports = {
  VALID_PRODUCTION_STATES,
  MUTATING_STATES,
  assertValidProductionState,
  calculateBehindDevelop,
  createInitialProductionDeployState,
  failProductionDeployState,
  isFullSha,
  markProductionDeployState,
  parseProductionStatusIssue,
  resolveTargetSha,
  shortSha,
  shouldBlockDuplicateDeployment,
};
