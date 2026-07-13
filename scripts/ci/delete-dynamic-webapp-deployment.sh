#!/usr/bin/env bash
set -Eeuo pipefail

readonly SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-}"
readonly CLASP_RC_PATH="${HOME}/.clasprc.json"
readonly CLASP_PROJECT_PATH="${RUNNER_TEMP:-/tmp}/gas-web-e2e-cleanup-clasp-project.json"
readonly DELETE_LOG="${RUNNER_TEMP:-/tmp}/clasp-delete-webapp-deployment.log"
export CLASP_PROJECT_PATH

clasp_command=(clasp --project "${CLASP_PROJECT_PATH}")
clasp_user_status="not configured"
if [[ -n "${CLASP_USER:-}" ]]; then
  clasp_command+=(--user "${CLASP_USER}")
  clasp_user_status="configured"
fi

append_summary() {
  if [[ -n "${SUMMARY_FILE}" ]]; then
    printf '%s\n' "$@" >> "${SUMMARY_FILE}"
  fi
}

require_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    echo "::error title=Missing GitHub secret::${name} is required to delete the dynamic GAS Web E2E deployment."
    append_summary "### Dynamic Web app deployment cleanup" "- Result: FAIL" "- \`${name}\` is not set."
    return 1
  fi
}

redact_sensitive_log() {
  local file="$1"
  local output
  output="$(sed -E 's#https://[^[:space:]]+#<redacted-url>#g' "${file}")"
  for value in \
    "${GAS_TEST_SCRIPT_ID:-}" \
    "${GAS_WEB_E2E_DYNAMIC_DEPLOYMENT_ID:-}"; do
    if [[ -n "${value}" ]]; then
      output="${output//${value}/<redacted>}"
    fi
  done
  printf '%s\n' "${output}"
}

cleanup() {
  rm -f "${CLASP_RC_PATH}"
  rm -f "${CLASP_PROJECT_PATH}"
  rm -f "${DELETE_LOG}"
}
trap cleanup EXIT

require_secret "CLASPRC_JSON"
require_secret "GAS_TEST_SCRIPT_ID"
require_secret "GAS_WEB_E2E_DYNAMIC_DEPLOYMENT_ID"

echo "::add-mask::${GAS_TEST_SCRIPT_ID}"
echo "::add-mask::${GAS_WEB_E2E_DYNAMIC_DEPLOYMENT_ID}"
if [[ -n "${CLASP_USER:-}" ]]; then
  echo "::add-mask::${CLASP_USER}"
fi

node <<'NODE'
const fs = require('fs');
const os = require('os');
const projectPath = process.env.CLASP_PROJECT_PATH;

if (!projectPath) {
  console.error('::error title=Missing CI project path::CLASP_PROJECT_PATH is not set.');
  process.exit(1);
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`::error title=Invalid ${label}::${error.message}`);
    process.exit(1);
  }
}

function writeJsonFile(path, raw, label) {
  const parsed = parseJson(raw, label);
  fs.writeFileSync(path, JSON.stringify(parsed, null, 2) + '\n', { mode: 0o600 });
}

writeJsonFile(`${os.homedir()}/.clasprc.json`, process.env.CLASPRC_JSON || '', 'CLASPRC_JSON');

if ((process.env.CLASP_PROJECT_JSON || '').trim()) {
  writeJsonFile(projectPath, process.env.CLASP_PROJECT_JSON, 'CLASP_PROJECT_JSON');
} else {
  writeJsonFile(projectPath, JSON.stringify({
    scriptId: process.env.GAS_TEST_SCRIPT_ID,
    rootDir: '.',
    scriptExtensions: ['.js', '.gs'],
    htmlExtensions: ['.html'],
    jsonExtensions: ['.json'],
    filePushOrder: [],
    skipSubdirectories: false
  }), 'generated CI clasp project JSON');
}
NODE

echo "::group::clasp --project delete dynamic Web app deployment"
set +e
"${clasp_command[@]}" delete-deployment "${GAS_WEB_E2E_DYNAMIC_DEPLOYMENT_ID}" > "${DELETE_LOG}" 2>&1
delete_exit=$?
set -e

if [[ "${delete_exit}" -eq 0 ]]; then
  echo "Dynamic Web app deployment was deleted."
  append_summary "### Dynamic Web app deployment cleanup" "- Result: PASS" "- Optional clasp user: ${clasp_user_status}" ""
  echo "::endgroup::"
  exit 0
fi

redact_sensitive_log "${DELETE_LOG}"
append_summary "### Dynamic Web app deployment cleanup" "- Result: FAIL" "- Optional clasp user: ${clasp_user_status}" ""
echo "::endgroup::"
exit "${delete_exit}"
