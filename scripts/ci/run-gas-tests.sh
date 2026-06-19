#!/usr/bin/env bash
set -Eeuo pipefail

readonly SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-}"
readonly CLASP_RC_PATH="${HOME}/.clasprc.json"
readonly CLASP_PROJECT_PATH=".clasp.json"
readonly DEPLOYMENT_DESCRIPTION="GAS CI ${GITHUB_SHA:-local} ${GITHUB_RUN_ID:-manual}"

test_functions=("runSmokeTests" "runAllTests")

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

append_summary "## GAS CI" "" "- Target: test-only Apps Script project from \`GAS_TEST_SCRIPT_ID\`" "- Source entry points: verified before push" "- Test manifest: injects \`executionApi\` in CI before push" "- Push: \`clasp push --force\`" "- Deployment: \`clasp create-deployment\`" "- Tests: \`${test_functions[*]}\`" ""

echo "::group::clasp push"
clasp push --force
echo "::endgroup::"

echo "::group::clasp API executable deployment"
if [[ -n "${GAS_TEST_DEPLOYMENT_ID:-}" ]]; then
  clasp create-deployment --deploymentId "${GAS_TEST_DEPLOYMENT_ID}" --description "${DEPLOYMENT_DESCRIPTION}"
else
  clasp create-deployment --description "${DEPLOYMENT_DESCRIPTION}"
fi
echo "::endgroup::"

failures=()

for function_name in "${test_functions[@]}"; do
  echo "::group::${function_name}"
  set +e
  output="$(clasp run --nondev "${function_name}" 2>&1)"
  exit_code=$?
  set -e

  printf '%s\n' "${output}"

  unavailable=0
  if printf '%s\n' "${output}" | grep -Eqi 'Script function not found|Unable to run script function'; then
    unavailable=1
    exit_code=1
    echo "::error title=GAS test function unavailable::${function_name} could not be executed after clasp push and deployment."
  fi

  append_summary "### ${function_name}"
  if [[ ${unavailable} -eq 1 ]]; then
    append_summary "- Result: FAIL (function unavailable after push/deployment)" ""
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
