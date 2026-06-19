#!/usr/bin/env bash
set -Eeuo pipefail

readonly SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-}"
readonly CLASP_RC_PATH="${HOME}/.clasprc.json"
readonly CLASP_PROJECT_PATH=".clasp.json"
readonly DEPLOYMENT_DESCRIPTION="GAS CI ${GITHUB_SHA:-local} ${GITHUB_RUN_ID:-manual}"

test_functions=("runAllTests")
clasp_command=(clasp)
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
    echo "::error title=Missing GitHub secret::${name} is required for GAS CI."
    append_summary "### Missing configuration" "- \`${name}\` is not set."
    return 1
  fi
}

ensure_source_function() {
  local function_name="$1"

  if grep -R \
    --include='*.gs' \
    --include='*.js' \
    --exclude-dir='.git' \
    --exclude-dir='node_modules' \
    -E "function[[:space:]]+${function_name}[[:space:]]*\\(" . >/dev/null; then
    return 0
  fi

  echo "::error title=Missing GAS test entry point::${function_name} is not defined in source-controlled .gs/.js files."
  append_summary "### Missing test entry point" "- \`${function_name}\` is not defined in source-controlled .gs/.js files."
  return 1
}

fail_on_no_credentials() {
  local output="$1"
  local context="$2"

  if printf '%s\n' "${output}" | grep -qi 'No credentials found'; then
    echo "::error title=No clasp credentials::${context} could not find clasp credentials. If CLASPRC_JSON was created with clasp login --user, set CLASP_USER to the same user."
    append_summary "### ${context}" "- Result: FAIL (No clasp credentials found)" "- If \`CLASPRC_JSON\` was created with \`clasp login --user\`, set \`CLASP_USER\` to the same user." ""
    return 1
  fi

  return 0
}

run_clasp_step() {
  local group_name="$1"
  shift

  echo "::group::${group_name}"
  set +e
  local output
  output="$("${clasp_command[@]}" "$@" 2>&1)"
  local exit_code=$?
  set -e

  printf '%s\n' "${output}"

  if ! fail_on_no_credentials "${output}" "${group_name}"; then
    echo "::endgroup::"
    return 1
  fi

  echo "::endgroup::"
  return "${exit_code}"
}

cleanup() {
  rm -f "${CLASP_RC_PATH}"
  rm -f "${CLASP_PROJECT_PATH}"
}
trap cleanup EXIT

require_secret "CLASPRC_JSON"
require_secret "GAS_TEST_SCRIPT_ID"

echo "::add-mask::${GAS_TEST_SCRIPT_ID}"
if [[ -n "${GAS_TEST_DEPLOYMENT_ID:-}" ]]; then
  echo "::add-mask::${GAS_TEST_DEPLOYMENT_ID}"
fi
if [[ -n "${CLASP_USER:-}" ]]; then
  echo "::add-mask::${CLASP_USER}"
fi

if [[ ! -f "appsscript.json" ]]; then
  echo "::error title=Missing appsscript.json::Run from the Apps Script source root."
  exit 1
fi

for function_name in "${test_functions[@]}"; do
  ensure_source_function "${function_name}"
done

node <<'NODE'
const fs = require('fs');
const os = require('os');

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
  writeJsonFile('.clasp.json', process.env.CLASP_PROJECT_JSON, 'CLASP_PROJECT_JSON');
} else {
  writeJsonFile('.clasp.json', JSON.stringify({
    scriptId: process.env.GAS_TEST_SCRIPT_ID,
    rootDir: '.',
    scriptExtensions: ['.js', '.gs'],
    htmlExtensions: ['.html'],
    jsonExtensions: ['.json'],
    filePushOrder: [],
    skipSubdirectories: false
  }), 'generated .clasp.json');
}

const manifestPath = 'appsscript.json';
const manifest = parseJson(fs.readFileSync(manifestPath, 'utf8'), 'appsscript.json');
manifest.executionApi = { access: 'ANYONE' };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
NODE

append_summary "## GAS CI" "" "- Target: test-only Apps Script project from \`GAS_TEST_SCRIPT_ID\`" "- Source entry points: verified before push" "- Test manifest: injects \`executionApi\` in CI before push" "- Push: \`clasp push --force\`" "- Deployment: update only when \`GAS_TEST_DEPLOYMENT_ID\` is set; otherwise skip creating a new versioned deployment" "- Execution: \`clasp run\` in devMode, using the latest pushed code" "- Optional clasp user: ${clasp_user_status}" "- Tests: \`${test_functions[*]}\`" ""

run_clasp_step "clasp push" push --force

if [[ -n "${GAS_TEST_DEPLOYMENT_ID:-}" ]]; then
  run_clasp_step "clasp API executable deployment" create-deployment --deploymentId "${GAS_TEST_DEPLOYMENT_ID}" --description "${DEPLOYMENT_DESCRIPTION}"
else
  echo "::notice title=Skipping deployment creation::GAS_TEST_DEPLOYMENT_ID is not set, so CI will not create a new versioned deployment. The test Apps Script project must already have API executable access configured for clasp run."
  append_summary "### API executable deployment" "- Result: SKIP" "- \`GAS_TEST_DEPLOYMENT_ID\` is not set, so CI did not create a new versioned deployment." "- The test Apps Script project must already have API executable access configured for \`clasp run\`." ""
fi

failures=()

for function_name in "${test_functions[@]}"; do
  echo "::group::${function_name}"
  set +e
  output="$("${clasp_command[@]}" run "${function_name}" 2>&1)"
  exit_code=$?
  set -e

  printf '%s\n' "${output}"

  unavailable=0
  unavailable_reason=""
  if printf '%s\n' "${output}" | grep -qi 'Script function not found'; then
    unavailable=1
    unavailable_reason="function was not found after clasp push"
  elif printf '%s\n' "${output}" | grep -qi 'Unable to run script function'; then
    unavailable=1
    unavailable_reason="clasp was not authorized to execute the function"
  elif printf '%s\n' "${output}" | grep -qi 'No credentials found'; then
    unavailable=1
    unavailable_reason="clasp could not find credentials; set CLASP_USER when CLASPRC_JSON was created with clasp login --user"
  fi

  test_failed=0
  test_failure_reason=""
  if [[ ${unavailable} -eq 0 ]] && printf '%s\n' "${output}" | grep -Eq '(^|[[:space:]])NG[[:space:]]{2}|^Exception:|^Error:'; then
    test_failed=1
    test_failure_reason="GAS test output contained NG or Exception/Error"
  fi

  if [[ ${unavailable} -eq 1 ]]; then
    exit_code=1
    echo "::error title=GAS test function unavailable::${function_name} could not be executed after clasp push: ${unavailable_reason}."
  elif [[ ${test_failed} -eq 1 ]]; then
    exit_code=1
    echo "::error title=GAS test reported failures::${function_name} output contained NG or Exception/Error."
  fi

  append_summary "### ${function_name}"
  if [[ ${unavailable} -eq 1 ]]; then
    append_summary "- Result: FAIL (${unavailable_reason})" ""
    failures+=("${function_name}")
  elif [[ ${test_failed} -eq 1 ]]; then
    append_summary "- Result: FAIL (${test_failure_reason})" ""
    failures+=("${function_name}")
  elif [[ ${exit_code} -eq 0 ]]; then
    append_summary "- Result: PASS" ""
  else
    append_summary "- Result: FAIL (exit ${exit_code})" ""
    failures+=("${function_name}")
  fi

  if [[ -n "${SUMMARY_FILE}" ]]; then
    {
      printf '```text\n'
      printf '%s\n' "${output}" | sed 's/```/` ` `/g'
      printf '```\n\n'
    } >> "${SUMMARY_FILE}"
  fi

  echo "::endgroup::"
done

if [[ ${#failures[@]} -gt 0 ]]; then
  echo "::error title=GAS tests failed::Failed functions: ${failures[*]}"
  append_summary "### Failed functions" "- ${failures[*]}"
  exit 1
fi

append_summary "### Result" "All GAS test functions passed."
