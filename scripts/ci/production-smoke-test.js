'use strict';

const DEFAULT_ALLOWED_HOSTS = [
  'script.google.com',
  'script.googleusercontent.com',
];

const DEFAULT_PRODUCTION_SMOKE_MODE = 'public-marker';
const PRODUCTION_SMOKE_MODES = [
  'public-marker',
  'private-login-gated',
];

const LOGIN_OR_CONSENT_HOSTS = [
  'accounts.google.com',
  'myaccount.google.com',
];

const LOGIN_RETURN_PARAMETER_NAMES = new Set([
  'continue',
  'followup',
  'next',
  'redirect',
  'redirect_uri',
  'return_to',
  'return_url',
]);

const LOGIN_OR_ERROR_PATTERNS = [
  /ReferenceError/i,
  /TypeError/i,
  /Script function not found/i,
  /Exception:/i,
  /Authorization is required/i,
  /You need permission/i,
  /Sign in/i,
  /Google Accounts/i,
  /OAuth/i,
];

function normalizeProductionSmokeMode(rawMode) {
  const normalized = String(rawMode || DEFAULT_PRODUCTION_SMOKE_MODE).trim().toLowerCase();
  if (!PRODUCTION_SMOKE_MODES.includes(normalized)) {
    throw new Error('PRODUCTION_SMOKE_MODE must be public-marker or private-login-gated.');
  }
  return normalized;
}

function assertAllowedHttpsUrl(rawUrl, allowedHosts = DEFAULT_ALLOWED_HOSTS) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw new Error('production smoke URL is not a valid URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('production smoke URL must use HTTPS.');
  }
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(`production smoke URL host is not allowed: ${parsed.hostname}`);
  }
  return parsed;
}

function assertNotLoginOrConsentUrl(responseUrl) {
  if (!responseUrl) {
    return;
  }
  let parsed;
  try {
    parsed = new URL(responseUrl);
  } catch (error) {
    throw new Error('production smoke final URL was not a valid URL.');
  }
  if (LOGIN_OR_CONSENT_HOSTS.includes(parsed.hostname)) {
    throw new Error(`production smoke ended on a Google login/consent host: ${parsed.hostname}`);
  }
  if (/signin|oauth|consent|ServiceLogin/i.test(parsed.pathname + parsed.search)) {
    throw new Error('production smoke ended on a login or consent URL.');
  }
}

function assertExpectedContentType(contentType) {
  const normalized = String(contentType || '').toLowerCase();
  if (!normalized.includes('text/html') && !normalized.includes('application/json')) {
    throw new Error(`production smoke returned unexpected content-type: ${contentType || 'none'}`);
  }
}

function assertExpectedBody(body, expectedMarker) {
  if (!body || !String(body).trim()) {
    throw new Error('production smoke response was empty.');
  }
  for (const pattern of LOGIN_OR_ERROR_PATTERNS) {
    if (pattern.test(body)) {
      throw new Error('production smoke response contains a login or Apps Script error marker.');
    }
  }
  if (!expectedMarker || !String(body).includes(expectedMarker)) {
    throw new Error('production smoke response did not contain the expected application marker.');
  }
}

function decodeReturnUrl(value) {
  let decoded = String(value || '').trim();
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    } catch (error) {
      break;
    }
  }
  return decoded;
}

function matchesProductionReturnUrl(rawReturnUrl, productionUrl) {
  let candidate;
  try {
    candidate = new URL(decodeReturnUrl(rawReturnUrl));
  } catch (error) {
    return false;
  }

  if (
    candidate.protocol !== productionUrl.protocol
    || candidate.host !== productionUrl.host
    || candidate.pathname !== productionUrl.pathname
  ) {
    return false;
  }

  for (const [name, value] of productionUrl.searchParams.entries()) {
    if (!candidate.searchParams.getAll(name).includes(value)) {
      return false;
    }
  }
  return true;
}

function assertExpectedPrivateLoginRedirect(response, productionUrl) {
  if (!response || response.status < 300 || response.status >= 400) {
    throw new Error(`private production smoke expected an HTTP redirect but received ${response ? response.status : 'no response'}.`);
  }

  const location = response.headers && response.headers.get
    ? response.headers.get('location')
    : '';
  if (!location) {
    throw new Error('private production smoke redirect did not include a Location header.');
  }

  let loginUrl;
  try {
    loginUrl = new URL(location, productionUrl);
  } catch (error) {
    throw new Error('private production smoke Location header was not a valid URL.');
  }
  if (loginUrl.protocol !== 'https:' || !LOGIN_OR_CONSENT_HOSTS.includes(loginUrl.hostname)) {
    throw new Error('private production smoke redirect did not target an allowed Google login host.');
  }
  if (!/signin|login|ServiceLogin|AccountChooser|oauth|consent/i.test(loginUrl.pathname)) {
    throw new Error('private production smoke redirect did not target a recognized Google login path.');
  }

  const returnUrls = [];
  for (const [name, value] of loginUrl.searchParams.entries()) {
    if (LOGIN_RETURN_PARAMETER_NAMES.has(name.toLowerCase())) {
      returnUrls.push(value);
    }
  }
  if (!returnUrls.some((value) => matchesProductionReturnUrl(value, productionUrl))) {
    throw new Error('private production smoke login redirect did not return to the configured production Web App URL.');
  }

  return {
    status: response.status,
    mode: 'private-login-gated',
    loginHost: loginUrl.hostname,
  };
}

async function runProductionSmokeTest({
  url,
  mode = DEFAULT_PRODUCTION_SMOKE_MODE,
  expectedMarker = 'CSV / スプレッドシートから6シート生成',
  timeoutMs = 15000,
  allowedHosts = DEFAULT_ALLOWED_HOSTS,
  fetchImpl = fetch,
} = {}) {
  const parsedUrl = assertAllowedHttpsUrl(url, allowedHosts);
  const smokeMode = normalizeProductionSmokeMode(mode);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(parsedUrl.toString(), {
      redirect: smokeMode === 'private-login-gated' ? 'manual' : 'follow',
      signal: controller.signal,
    });
    if (smokeMode === 'private-login-gated') {
      return assertExpectedPrivateLoginRedirect(response, parsedUrl);
    }
    assertNotLoginOrConsentUrl(response.url || parsedUrl.toString());
    if (response.status < 200 || response.status >= 400) {
      throw new Error(`production smoke failed with HTTP ${response.status}.`);
    }
    assertExpectedContentType(response.headers && response.headers.get
      ? response.headers.get('content-type')
      : '');
    const body = await response.text();
    assertExpectedBody(body, expectedMarker);
    return {
      status: response.status,
      mode: smokeMode,
      finalUrl: response.url || parsedUrl.toString(),
    };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`production smoke timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  DEFAULT_PRODUCTION_SMOKE_MODE,
  DEFAULT_ALLOWED_HOSTS,
  PRODUCTION_SMOKE_MODES,
  assertAllowedHttpsUrl,
  assertExpectedBody,
  assertExpectedContentType,
  assertExpectedPrivateLoginRedirect,
  assertNotLoginOrConsentUrl,
  matchesProductionReturnUrl,
  normalizeProductionSmokeMode,
  runProductionSmokeTest,
};
