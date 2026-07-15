'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EXPECTED_WEB_APP_ACCESS = 'MYSELF';
const EXPECTED_WEB_APP_EXECUTE_AS = 'USER_DEPLOYING';
const MANIFEST_CONFIGURATION_ERROR = 'Production Web App manifest configuration is invalid.';
const WEB_APP_ENTRY_POINT_ERROR = 'Production deployment is not a Web App.';
const WEB_APP_VERIFICATION_ERROR = 'Production Web App entry point verification failed.';
const WEB_APP_CONFIGURATION_ERROR = 'Production Web App deployment configuration does not match.';
const WEB_APP_UPDATE_ERROR = 'Production Web App deployment update verification failed.';
const LIST_FIELDS = 'deployments(deploymentId),nextPageToken';
const GET_FIELDS = 'deploymentId,deploymentConfig(versionNumber,description),entryPoints(entryPointType,webApp(url,entryPointConfig(access,executeAs)))';

function safeError(message) {
  const error = new Error(message);
  error.code = 'PRODUCTION_WEB_APP_VERIFICATION';
  return error;
}

function rethrowSafe(error, fallbackMessage) {
  if (error && error.code === 'PRODUCTION_WEB_APP_VERIFICATION') {
    throw error;
  }
  throw safeError(fallbackMessage);
}

function validateProductionWebAppManifest(cwd = process.cwd()) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'appsscript.json'), 'utf8'));
    if (
      !manifest.webapp
      || manifest.webapp.access !== EXPECTED_WEB_APP_ACCESS
      || manifest.webapp.executeAs !== EXPECTED_WEB_APP_EXECUTE_AS
    ) {
      throw safeError(MANIFEST_CONFIGURATION_ERROR);
    }
    return true;
  } catch (error) {
    rethrowSafe(error, MANIFEST_CONFIGURATION_ERROR);
  }
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function validateWebAppUrl({ url, deploymentId, expectedWebAppUrl }) {
  if (typeof url !== 'string' || !url) {
    throw safeError(WEB_APP_ENTRY_POINT_ERROR);
  }
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:'
      || parsed.hostname !== 'script.google.com'
      || parsed.port
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || parsed.pathname !== `/macros/s/${deploymentId}/exec`
    ) {
      throw safeError(WEB_APP_CONFIGURATION_ERROR);
    }
  } catch (error) {
    rethrowSafe(error, WEB_APP_CONFIGURATION_ERROR);
  }
  if (url !== expectedWebAppUrl) {
    throw safeError(WEB_APP_CONFIGURATION_ERROR);
  }
  return url;
}

function createProductionWebAppDeploymentSnapshot({
  deployment,
  deploymentCount,
  expectedDeploymentId,
  expectedWebAppUrl,
}) {
  try {
    if (
      !deployment
      || typeof deployment !== 'object'
      || typeof expectedDeploymentId !== 'string'
      || !expectedDeploymentId
      || deployment.deploymentId !== expectedDeploymentId
      || !Number.isInteger(deploymentCount)
      || deploymentCount < 1
    ) {
      throw safeError(WEB_APP_VERIFICATION_ERROR);
    }

    const versionNumber = Number(deployment.deploymentConfig && deployment.deploymentConfig.versionNumber);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      throw safeError(WEB_APP_VERIFICATION_ERROR);
    }
    if (!Array.isArray(deployment.entryPoints)) {
      throw safeError(WEB_APP_VERIFICATION_ERROR);
    }
    if (deployment.entryPoints.some((entryPoint) => (
      !entryPoint
      || typeof entryPoint !== 'object'
      || typeof entryPoint.entryPointType !== 'string'
      || !entryPoint.entryPointType
      || entryPoint.entryPointType === 'ENTRY_POINT_TYPE_UNSPECIFIED'
    ))) {
      throw safeError(WEB_APP_VERIFICATION_ERROR);
    }

    const webAppEntryPoints = deployment.entryPoints.filter((entryPoint) => entryPoint.entryPointType === 'WEB_APP');
    if (webAppEntryPoints.length !== 1) {
      throw safeError(WEB_APP_ENTRY_POINT_ERROR);
    }

    const webApp = webAppEntryPoints[0].webApp;
    const config = webApp && webApp.entryPointConfig;
    if (!webApp || !config || typeof config !== 'object') {
      throw safeError(WEB_APP_ENTRY_POINT_ERROR);
    }
    const webAppUrl = validateWebAppUrl({
      url: webApp.url,
      deploymentId: expectedDeploymentId,
      expectedWebAppUrl,
    });
    if (
      config.access !== EXPECTED_WEB_APP_ACCESS
      || config.executeAs !== EXPECTED_WEB_APP_EXECUTE_AS
    ) {
      throw safeError(WEB_APP_CONFIGURATION_ERROR);
    }

    return {
      deploymentCount,
      deploymentId: expectedDeploymentId,
      versionNumber,
      deploymentDescriptionFingerprint: fingerprint(deployment.deploymentConfig.description || ''),
      webAppEntryPointCount: 1,
      entryPointTypes: deployment.entryPoints.map((entryPoint) => entryPoint.entryPointType).sort(),
      webAppUrlFingerprint: fingerprint(webAppUrl),
      webAppAccess: config.access,
      webAppExecuteAs: config.executeAs,
    };
  } catch (error) {
    rethrowSafe(error, WEB_APP_VERIFICATION_ERROR);
  }
}

async function fetchProductionWebAppDeploymentSnapshot({
  api,
  scriptId,
  deploymentId,
  expectedWebAppUrl,
}) {
  try {
    if (
      !api
      || !api.projects
      || !api.projects.deployments
      || typeof api.projects.deployments.get !== 'function'
      || typeof api.projects.deployments.list !== 'function'
      || typeof scriptId !== 'string'
      || !scriptId
    ) {
      throw safeError(WEB_APP_VERIFICATION_ERROR);
    }

    const deployments = [];
    const seenPageTokens = new Set();
    let pageToken;
    do {
      const response = await api.projects.deployments.list({ scriptId, pageToken, fields: LIST_FIELDS });
      const data = response && response.data;
      if (!data || !Array.isArray(data.deployments)) {
        throw safeError(WEB_APP_VERIFICATION_ERROR);
      }
      deployments.push(...data.deployments);
      pageToken = data.nextPageToken || '';
      if (pageToken && seenPageTokens.has(pageToken)) {
        throw safeError(WEB_APP_VERIFICATION_ERROR);
      }
      if (pageToken) {
        seenPageTokens.add(pageToken);
      }
    } while (pageToken);

    if (deployments.filter((deployment) => deployment && deployment.deploymentId === deploymentId).length !== 1) {
      throw safeError(WEB_APP_VERIFICATION_ERROR);
    }

    const response = await api.projects.deployments.get({ scriptId, deploymentId, fields: GET_FIELDS });
    return createProductionWebAppDeploymentSnapshot({
      deployment: response && response.data,
      deploymentCount: deployments.length,
      expectedDeploymentId: deploymentId,
      expectedWebAppUrl,
    });
  } catch (error) {
    rethrowSafe(error, WEB_APP_VERIFICATION_ERROR);
  }
}

function verifyProductionWebAppDeploymentUpdate({ before, after, update }) {
  try {
    if (
      !before
      || !after
      || !update
      || before.deploymentId !== after.deploymentId
      || before.deploymentCount !== after.deploymentCount
      || before.webAppEntryPointCount !== 1
      || after.webAppEntryPointCount !== 1
      || !Number.isInteger(update.versionNumber)
      || update.versionNumber === before.versionNumber
      || update.versionNumber !== after.versionNumber
      || before.webAppUrlFingerprint !== after.webAppUrlFingerprint
      || JSON.stringify(before.entryPointTypes) !== JSON.stringify(after.entryPointTypes)
      || before.webAppAccess !== after.webAppAccess
      || before.webAppExecuteAs !== after.webAppExecuteAs
      || after.webAppAccess !== EXPECTED_WEB_APP_ACCESS
      || after.webAppExecuteAs !== EXPECTED_WEB_APP_EXECUTE_AS
    ) {
      throw safeError(WEB_APP_UPDATE_ERROR);
    }
    return true;
  } catch (error) {
    rethrowSafe(error, WEB_APP_UPDATE_ERROR);
  }
}

module.exports = {
  EXPECTED_WEB_APP_ACCESS,
  EXPECTED_WEB_APP_EXECUTE_AS,
  MANIFEST_CONFIGURATION_ERROR,
  WEB_APP_CONFIGURATION_ERROR,
  WEB_APP_ENTRY_POINT_ERROR,
  WEB_APP_UPDATE_ERROR,
  WEB_APP_VERIFICATION_ERROR,
  createProductionWebAppDeploymentSnapshot,
  fetchProductionWebAppDeploymentSnapshot,
  validateProductionWebAppManifest,
  verifyProductionWebAppDeploymentUpdate,
};
