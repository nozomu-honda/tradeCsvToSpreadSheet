'use strict';

const REQUIRED_TRACKED_FILES = [
  'src/app/e2e_runtime_support.gs',
];

const FORBIDDEN_TRACKED_FILES = [
  'src/app/e2e_helpers.gs',
];

const FORBIDDEN_TRACKED_PREFIXES = [
  'src/test/',
];

const SENSITIVE_OUTPUT_PATTERNS = [
  /ya29\.[A-Za-z0-9_-]+/i,
  /"refresh_token"\s*:/i,
  /"access_token"\s*:/i,
  /"client_secret"\s*:/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
];

const ERROR_OUTPUT_PATTERNS = [
  /No credentials found/i,
  /Not logged in/i,
  /Authorization is required/i,
  /placeholder/i,
  /YOUR_PRODUCTION_SCRIPT_ID/i,
  /error:/i,
];

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function extractStatusJson(rawOutput) {
  const raw = String(rawOutput || '');
  if (!raw.trim()) {
    throw new Error('production status output was empty.');
  }
  for (const pattern of SENSITIVE_OUTPUT_PATTERNS) {
    if (pattern.test(raw)) {
      throw new Error('production status output appears to contain sensitive data.');
    }
  }
  for (const pattern of ERROR_OUTPUT_PATTERNS) {
    if (pattern.test(raw)) {
      throw new Error('production status output contains an error or placeholder marker.');
    }
  }

  const candidates = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.endsWith('}'));

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(candidates[i]);
      if (parsed && Array.isArray(parsed.filesToPush) && Array.isArray(parsed.untrackedFiles)) {
        return parsed;
      }
    } catch (error) {
      // Try the previous candidate.
    }
  }

  throw new Error('production status output did not contain clasp JSON file status.');
}

function parseProductionStatusOutput(rawOutput) {
  const parsed = extractStatusJson(rawOutput);
  return {
    trackedFiles: parsed.filesToPush.map(normalizePath),
    untrackedFiles: parsed.untrackedFiles.map(normalizePath),
  };
}

function validateProductionStatusFiles(status) {
  const trackedFiles = status.trackedFiles || [];
  if (trackedFiles.length === 0) {
    throw new Error('production status tracked file list was empty.');
  }

  for (const requiredFile of REQUIRED_TRACKED_FILES) {
    if (!trackedFiles.includes(requiredFile)) {
      throw new Error(`production status is missing required tracked file: ${requiredFile}`);
    }
  }

  for (const forbiddenFile of FORBIDDEN_TRACKED_FILES) {
    if (trackedFiles.includes(forbiddenFile)) {
      throw new Error(`production status includes forbidden tracked file: ${forbiddenFile}`);
    }
  }

  for (const file of trackedFiles) {
    for (const forbiddenPrefix of FORBIDDEN_TRACKED_PREFIXES) {
      if (file.startsWith(forbiddenPrefix)) {
        throw new Error(`production status includes forbidden tracked test file: ${file}`);
      }
    }
  }

  return {
    trackedCount: trackedFiles.length,
    untrackedCount: (status.untrackedFiles || []).length,
  };
}

function parseAndValidateProductionStatusOutput(rawOutput) {
  const status = parseProductionStatusOutput(rawOutput);
  const summary = validateProductionStatusFiles(status);
  return {
    ...status,
    ...summary,
  };
}

module.exports = {
  FORBIDDEN_TRACKED_FILES,
  FORBIDDEN_TRACKED_PREFIXES,
  REQUIRED_TRACKED_FILES,
  extractStatusJson,
  parseAndValidateProductionStatusOutput,
  parseProductionStatusOutput,
  validateProductionStatusFiles,
};
