#!/usr/bin/env node
'use strict';

const assert = require('assert');
const http = require('http');

const { runProductionSmokeTest } = require('./production-smoke-test');

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/ok') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><title>株管理ツール</title><h2>CSV / スプレッドシートから6シート生成</h2>');
      return;
    }
    if (req.url === '/500') {
      res.writeHead(500, { 'content-type': 'text/html' });
      res.end('server error');
      return;
    }
    if (req.url === '/empty') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('');
      return;
    }
    if (req.url === '/reference-error') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('ReferenceError: missing');
      return;
    }
    if (req.url === '/login') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><title>Google Accounts</title><button>Sign in</button></html>');
      return;
    }
    if (req.url === '/json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ marker: 'CSV / スプレッドシートから6シート生成' }));
      return;
    }
    if (req.url === '/png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end('not really png');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function serverUrl(server, path) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}${path}`;
}

function assertRejectsWith(promise, pattern) {
  return assert.rejects(promise, pattern);
}

function response({ status, url, location = '', contentType = 'text/html', body = '' }) {
  return {
    status,
    url,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === 'location') {
          return location;
        }
        if (String(name).toLowerCase() === 'content-type') {
          return contentType;
        }
        return '';
      },
    },
    text: async () => body,
  };
}

(async () => {
  const server = await startServer();
  const allowedHosts = ['127.0.0.1'];
  try {
    await assertRejectsWith(runProductionSmokeTest({
      url: serverUrl(server, '/ok'),
      allowedHosts,
    }), /HTTPS/);

    const httpsUrl = (path) => `https://127.0.0.1:${server.address().port}${path}`;
    const fetchLocal = async (url) => {
      const localUrl = String(url).replace('https://', 'http://');
      return fetch(localUrl);
    };

    const ok = await runProductionSmokeTest({
      url: httpsUrl('/ok'),
      mode: 'public-marker',
      allowedHosts,
      fetchImpl: fetchLocal,
    });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.mode, 'public-marker');

    await runProductionSmokeTest({
      url: httpsUrl('/json'),
      allowedHosts,
      fetchImpl: fetchLocal,
    });

    await assertRejectsWith(runProductionSmokeTest({
      url: httpsUrl('/500'),
      allowedHosts,
      fetchImpl: fetchLocal,
    }), /HTTP 500/);

    await assertRejectsWith(runProductionSmokeTest({
      url: httpsUrl('/empty'),
      allowedHosts,
      fetchImpl: fetchLocal,
    }), /empty/);

    await assertRejectsWith(runProductionSmokeTest({
      url: httpsUrl('/reference-error'),
      allowedHosts,
      fetchImpl: fetchLocal,
    }), /error marker/);

    await assertRejectsWith(runProductionSmokeTest({
      url: httpsUrl('/login'),
      allowedHosts,
      fetchImpl: fetchLocal,
    }), /login or Apps Script error marker/);

    await assertRejectsWith(runProductionSmokeTest({
      url: httpsUrl('/png'),
      allowedHosts,
      fetchImpl: fetchLocal,
    }), /unexpected content-type/);

    await assertRejectsWith(runProductionSmokeTest({
      url: 'https://script.google.com/macros/s/test/exec',
      fetchImpl: async () => ({
        status: 200,
        url: 'https://accounts.google.com/ServiceLogin',
        headers: { get: () => 'text/html' },
        text: async () => '<html>CSV / スプレッドシートから6シート生成</html>',
      }),
    }), /Google login/);

    const productionUrl = 'https://script.google.com/macros/s/test/exec';
    const validLoginLocation = `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(productionUrl)}&followup=${encodeURIComponent(productionUrl)}`;
    let privateRedirectMode = '';
    const privateResult = await runProductionSmokeTest({
      url: productionUrl,
      mode: ' Private-Login-Gated ',
      fetchImpl: async (url, options) => {
        privateRedirectMode = options.redirect;
        return response({
          status: 302,
          url,
          location: validLoginLocation,
        });
      },
    });
    assert.strictEqual(privateRedirectMode, 'manual');
    assert.strictEqual(privateResult.status, 302);
    assert.strictEqual(privateResult.mode, 'private-login-gated');
    assert.strictEqual(privateResult.loginHost, 'accounts.google.com');

    await assertRejectsWith(runProductionSmokeTest({
      url: productionUrl,
      mode: 'private-login-gated',
      fetchImpl: async (url) => response({
        status: 302,
        url,
        location: `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent('https://example.com/unrelated')}`,
      }),
    }), /did not return to the configured/);

    await assertRejectsWith(runProductionSmokeTest({
      url: productionUrl,
      mode: 'private-login-gated',
      fetchImpl: async (url) => response({
        status: 302,
        url,
        location: `https://example.com/login?continue=${encodeURIComponent(productionUrl)}`,
      }),
    }), /allowed Google login host/);

    await assertRejectsWith(runProductionSmokeTest({
      url: 'https://example.com/not-apps-script',
      mode: 'private-login-gated',
      fetchImpl: async () => {
        throw new Error('fetch must not run for a forbidden production host');
      },
    }), /host is not allowed/);

    await assertRejectsWith(runProductionSmokeTest({
      url: productionUrl,
      mode: 'private',
      fetchImpl: async () => {
        throw new Error('fetch must not run for an invalid smoke mode');
      },
    }), /PRODUCTION_SMOKE_MODE/);

    for (const status of [404, 500]) {
      await assertRejectsWith(runProductionSmokeTest({
        url: productionUrl,
        mode: 'private-login-gated',
        fetchImpl: async (url) => response({ status, url, body: 'Apps Script error' }),
      }), /expected an HTTP redirect/);
    }

    await assertRejectsWith(runProductionSmokeTest({
      url: productionUrl,
      mode: 'private-login-gated',
      fetchImpl: async (url) => response({
        status: 200,
        url,
        body: 'You need permission',
      }),
    }), /expected an HTTP redirect/);

    await assertRejectsWith(runProductionSmokeTest({
      url: 'https://script.google.com/macros/s/test/exec',
      timeoutMs: 10,
      fetchImpl: (url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    }), /timed out/);

    console.log('production smoke test checks passed');
  } finally {
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
