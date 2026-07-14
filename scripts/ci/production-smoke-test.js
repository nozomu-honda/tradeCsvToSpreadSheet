'use strict';

const DEFAULT_ALLOWED_HOSTS = [
  'script.google.com',
  'script.googleusercontent.com',
];

const LOGIN_OR_CONSENT_HOSTS = [
  'accounts.google.com',
  'myaccount.google.com',
];

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

async function runProductionSmokeTest({
  url,
  expectedMarker = 'CSV / スプレッドシートから6シート生成',
  timeoutMs = 15000,
  allowedHosts = DEFAULT_ALLOWED_HOSTS,
  fetchImpl = fetch,
} = {}) {
  const parsedUrl = assertAllowedHttpsUrl(url, allowedHosts);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(parsedUrl.toString(), {
      redirect: 'follow',
      signal: controller.signal,
    });
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
  DEFAULT_ALLOWED_HOSTS,
  assertAllowedHttpsUrl,
  assertExpectedBody,
  assertExpectedContentType,
  assertNotLoginOrConsentUrl,
  runProductionSmokeTest,
};
