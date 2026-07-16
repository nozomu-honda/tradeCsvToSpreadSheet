'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EXPECTED_WEB_APP_ACCESS = 'ANYONE';
const EXPECTED_WEB_APP_EXECUTE_AS = 'USER_ACCESSING';
const PRODUCTION_WEB_APP_ERROR_CODE = 'PRODUCTION_WEB_APP_VERIFICATION';
const PRODUCTION_WEB_APP_SNAPSHOT_MODES = Object.freeze({
  STRICT: 'strict',
  COMPARISON: 'comparison',
});
const LIST_FIELDS = 'deployments(deploymentId),nextPageToken';
const GET_FIELDS = 'deploymentId,deploymentConfig(versionNumber,description),entryPoints(entryPointType,webApp(url,entryPointConfig(access,executeAs)))';

const PRODUCTION_WEB_APP_REASONS = Object.freeze({
  MANIFEST_CONFIGURATION_INVALID: 'MANIFEST_CONFIGURATION_INVALID',
  API_CLIENT_UNAVAILABLE: 'API_CLIENT_UNAVAILABLE',
  APPS_SCRIPT_API_REQUEST_FAILED: 'APPS_SCRIPT_API_REQUEST_FAILED',
  SCRIPT_ID_UNAVAILABLE: 'SCRIPT_ID_UNAVAILABLE',
  DEPLOYMENT_ID_UNAVAILABLE: 'DEPLOYMENT_ID_UNAVAILABLE',
  DEPLOYMENTS_LIST_FAILED: 'DEPLOYMENTS_LIST_FAILED',
  DEPLOYMENTS_GET_FAILED: 'DEPLOYMENTS_GET_FAILED',
  DEPLOYMENTS_LIST_RESPONSE_INVALID: 'DEPLOYMENTS_LIST_RESPONSE_INVALID',
  DEPLOYMENTS_GET_RESPONSE_INVALID: 'DEPLOYMENTS_GET_RESPONSE_INVALID',
  DEPLOYMENT_PAGINATION_INVALID: 'DEPLOYMENT_PAGINATION_INVALID',
  DUPLICATE_PAGE_TOKEN_DETECTED: 'DUPLICATE_PAGE_TOKEN_DETECTED',
  CONFIGURED_DEPLOYMENT_NOT_FOUND: 'CONFIGURED_DEPLOYMENT_NOT_FOUND',
  CONFIGURED_DEPLOYMENT_APPEARED_MULTIPLE_TIMES: 'CONFIGURED_DEPLOYMENT_APPEARED_MULTIPLE_TIMES',
  DEPLOYMENT_ID_MISMATCH: 'DEPLOYMENT_ID_MISMATCH',
  INVALID_DEPLOYMENT_COUNT: 'INVALID_DEPLOYMENT_COUNT',
  VERSION_NUMBER_MISSING: 'VERSION_NUMBER_MISSING',
  VERSION_NUMBER_INVALID: 'VERSION_NUMBER_INVALID',
  VERSION_NUMBER_NOT_POSITIVE_INTEGER: 'VERSION_NUMBER_NOT_POSITIVE_INTEGER',
  ENTRY_POINTS_MISSING: 'ENTRY_POINTS_MISSING',
  ENTRY_POINTS_NOT_ARRAY: 'ENTRY_POINTS_NOT_ARRAY',
  ENTRY_POINT_RECORD_INVALID: 'ENTRY_POINT_RECORD_INVALID',
  ENTRY_POINT_TYPE_MISSING: 'ENTRY_POINT_TYPE_MISSING',
  ENTRY_POINT_TYPE_UNSPECIFIED: 'ENTRY_POINT_TYPE_UNSPECIFIED',
  WEB_APP_ENTRY_POINT_MISSING: 'WEB_APP_ENTRY_POINT_MISSING',
  MULTIPLE_WEB_APP_ENTRY_POINTS: 'MULTIPLE_WEB_APP_ENTRY_POINTS',
  WEB_APP_OBJECT_MISSING: 'WEB_APP_OBJECT_MISSING',
  ENTRY_POINT_CONFIG_MISSING: 'ENTRY_POINT_CONFIG_MISSING',
  WEB_APP_URL_MISSING: 'WEB_APP_URL_MISSING',
  WEB_APP_URL_INVALID: 'WEB_APP_URL_INVALID',
  WEB_APP_URL_PROTOCOL_MISMATCH: 'WEB_APP_URL_PROTOCOL_MISMATCH',
  WEB_APP_URL_HOST_MISMATCH: 'WEB_APP_URL_HOST_MISMATCH',
  WEB_APP_URL_PATH_MISMATCH: 'WEB_APP_URL_PATH_MISMATCH',
  WEB_APP_URL_UNEXPECTED_COMPONENTS: 'WEB_APP_URL_UNEXPECTED_COMPONENTS',
  WEB_APP_URL_DEPLOYMENT_ID_MISMATCH: 'WEB_APP_URL_DEPLOYMENT_ID_MISMATCH',
  CONFIGURED_WEB_APP_URL_MISMATCH: 'CONFIGURED_WEB_APP_URL_MISMATCH',
  ACCESS_VALUE_MISSING: 'ACCESS_VALUE_MISSING',
  EXECUTE_AS_VALUE_MISSING: 'EXECUTE_AS_VALUE_MISSING',
  ACCESS_MISMATCH: 'ACCESS_MISMATCH',
  EXECUTE_AS_MISMATCH: 'EXECUTE_AS_MISMATCH',
  SNAPSHOT_MODE_INVALID: 'SNAPSHOT_MODE_INVALID',
  UPDATE_SNAPSHOT_INVALID: 'UPDATE_SNAPSHOT_INVALID',
  UPDATE_RESULT_INVALID: 'UPDATE_RESULT_INVALID',
  DEPLOYMENT_ID_CHANGED: 'DEPLOYMENT_ID_CHANGED',
  DEPLOYMENT_COUNT_CHANGED: 'DEPLOYMENT_COUNT_CHANGED',
  VERSION_DID_NOT_CHANGE: 'VERSION_DID_NOT_CHANGE',
  UPDATED_VERSION_MISMATCH: 'UPDATED_VERSION_MISMATCH',
  WEB_APP_ENTRY_POINT_DISAPPEARED: 'WEB_APP_ENTRY_POINT_DISAPPEARED',
  WEB_APP_ENTRY_POINT_COUNT_CHANGED: 'WEB_APP_ENTRY_POINT_COUNT_CHANGED',
  ENTRY_POINT_TYPES_CHANGED: 'ENTRY_POINT_TYPES_CHANGED',
  WEB_APP_URL_CHANGED: 'WEB_APP_URL_CHANGED',
  ACCESS_CHANGED: 'ACCESS_CHANGED',
  EXECUTE_AS_CHANGED: 'EXECUTE_AS_CHANGED',
  UPDATE_VERIFICATION_FAILED: 'UPDATE_VERIFICATION_FAILED',
});

const REASON_MESSAGES = Object.freeze({
  [PRODUCTION_WEB_APP_REASONS.MANIFEST_CONFIGURATION_INVALID]: 'manifest configuration invalid',
  [PRODUCTION_WEB_APP_REASONS.API_CLIENT_UNAVAILABLE]: 'API client unavailable',
  [PRODUCTION_WEB_APP_REASONS.APPS_SCRIPT_API_REQUEST_FAILED]: 'Apps Script API request failed',
  [PRODUCTION_WEB_APP_REASONS.SCRIPT_ID_UNAVAILABLE]: 'configured Script ID unavailable',
  [PRODUCTION_WEB_APP_REASONS.DEPLOYMENT_ID_UNAVAILABLE]: 'configured deployment ID unavailable',
  [PRODUCTION_WEB_APP_REASONS.DEPLOYMENTS_LIST_FAILED]: 'deployments.list failed',
  [PRODUCTION_WEB_APP_REASONS.DEPLOYMENTS_GET_FAILED]: 'deployments.get failed',
  [PRODUCTION_WEB_APP_REASONS.DEPLOYMENTS_LIST_RESPONSE_INVALID]: 'deployments.list response invalid',
  [PRODUCTION_WEB_APP_REASONS.DEPLOYMENTS_GET_RESPONSE_INVALID]: 'deployments.get response invalid',
  [PRODUCTION_WEB_APP_REASONS.DEPLOYMENT_PAGINATION_INVALID]: 'deployment pagination invalid',
  [PRODUCTION_WEB_APP_REASONS.DUPLICATE_PAGE_TOKEN_DETECTED]: 'duplicate page token detected',
  [PRODUCTION_WEB_APP_REASONS.CONFIGURED_DEPLOYMENT_NOT_FOUND]: 'configured deployment not found',
  [PRODUCTION_WEB_APP_REASONS.CONFIGURED_DEPLOYMENT_APPEARED_MULTIPLE_TIMES]: 'configured deployment appeared multiple times',
  [PRODUCTION_WEB_APP_REASONS.DEPLOYMENT_ID_MISMATCH]: 'deployment ID mismatch',
  [PRODUCTION_WEB_APP_REASONS.INVALID_DEPLOYMENT_COUNT]: 'invalid deployment count',
  [PRODUCTION_WEB_APP_REASONS.VERSION_NUMBER_MISSING]: 'version number missing',
  [PRODUCTION_WEB_APP_REASONS.VERSION_NUMBER_INVALID]: 'version number invalid',
  [PRODUCTION_WEB_APP_REASONS.VERSION_NUMBER_NOT_POSITIVE_INTEGER]: 'version number is not a positive integer',
  [PRODUCTION_WEB_APP_REASONS.ENTRY_POINTS_MISSING]: 'entryPoints missing',
  [PRODUCTION_WEB_APP_REASONS.ENTRY_POINTS_NOT_ARRAY]: 'entryPoints is not an array',
  [PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_RECORD_INVALID]: 'entry point record invalid',
  [PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_TYPE_MISSING]: 'entry point type missing',
  [PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_TYPE_UNSPECIFIED]: 'entry point type unspecified',
  [PRODUCTION_WEB_APP_REASONS.WEB_APP_ENTRY_POINT_MISSING]: 'WEB_APP entry point missing',
  [PRODUCTION_WEB_APP_REASONS.MULTIPLE_WEB_APP_ENTRY_POINTS]: 'multiple WEB_APP entry points',
  [PRODUCTION_WEB_APP_REASONS.WEB_APP_OBJECT_MISSING]: 'webApp object missing',
  [PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_CONFIG_MISSING]: 'entryPointConfig missing',
  [PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_MISSING]: 'Web App URL missing',
  [PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_INVALID]: 'Web App URL invalid',
  [PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_PROTOCOL_MISMATCH]: 'Web App URL protocol mismatch',
  [PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_HOST_MISMATCH]: 'Web App URL host mismatch',
  [PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_PATH_MISMATCH]: 'Web App URL path mismatch',
  [PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_UNEXPECTED_COMPONENTS]: 'Web App URL contains unexpected query, hash, or credentials',
  [PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_DEPLOYMENT_ID_MISMATCH]: 'Web App URL deployment ID mismatch',
  [PRODUCTION_WEB_APP_REASONS.CONFIGURED_WEB_APP_URL_MISMATCH]: 'configured Web App URL mismatch',
  [PRODUCTION_WEB_APP_REASONS.ACCESS_VALUE_MISSING]: 'access value missing',
  [PRODUCTION_WEB_APP_REASONS.EXECUTE_AS_VALUE_MISSING]: 'executeAs value missing',
  [PRODUCTION_WEB_APP_REASONS.ACCESS_MISMATCH]: 'access mismatch',
  [PRODUCTION_WEB_APP_REASONS.EXECUTE_AS_MISMATCH]: 'executeAs mismatch',
  [PRODUCTION_WEB_APP_REASONS.SNAPSHOT_MODE_INVALID]: 'snapshot mode invalid',
  [PRODUCTION_WEB_APP_REASONS.UPDATE_SNAPSHOT_INVALID]: 'deployment snapshot invalid',
  [PRODUCTION_WEB_APP_REASONS.UPDATE_RESULT_INVALID]: 'deployment update result invalid',
  [PRODUCTION_WEB_APP_REASONS.DEPLOYMENT_ID_CHANGED]: 'deployment ID changed',
  [PRODUCTION_WEB_APP_REASONS.DEPLOYMENT_COUNT_CHANGED]: 'deployment count changed',
  [PRODUCTION_WEB_APP_REASONS.VERSION_DID_NOT_CHANGE]: 'version did not change',
  [PRODUCTION_WEB_APP_REASONS.UPDATED_VERSION_MISMATCH]: 'updated version mismatch',
  [PRODUCTION_WEB_APP_REASONS.WEB_APP_ENTRY_POINT_DISAPPEARED]: 'WEB_APP entry point disappeared',
  [PRODUCTION_WEB_APP_REASONS.WEB_APP_ENTRY_POINT_COUNT_CHANGED]: 'WEB_APP entry point count changed',
  [PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_TYPES_CHANGED]: 'entry point types changed',
  [PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_CHANGED]: 'Web App URL changed',
  [PRODUCTION_WEB_APP_REASONS.ACCESS_CHANGED]: 'access changed',
  [PRODUCTION_WEB_APP_REASONS.EXECUTE_AS_CHANGED]: 'executeAs changed',
  [PRODUCTION_WEB_APP_REASONS.UPDATE_VERIFICATION_FAILED]: 'deployment update verification failed',
});

const ERROR_PREFIXES = Object.freeze({
  manifest: 'Production Web App manifest verification failed',
  verification: 'Production Web App verification failed',
  update: 'Production Web App update verification failed',
});

function formatProductionWebAppErrorMessage(reason, kind = 'verification') {
  const detail = REASON_MESSAGES[reason];
  const prefix = ERROR_PREFIXES[kind];
  if (!detail || !prefix) {
    throw new Error('Unknown production Web App verification reason.');
  }
  return `${prefix}: ${detail}.`;
}

function safeError(message, reason, kind) {
  const error = new Error(message);
  error.code = PRODUCTION_WEB_APP_ERROR_CODE;
  error.reason = reason;
  error.verificationKind = kind;
  return error;
}

function createProductionWebAppVerificationError(reason, kind = 'verification') {
  return safeError(formatProductionWebAppErrorMessage(reason, kind), reason, kind);
}

function isKnownSafeError(error) {
  if (
    !error
    || error.code !== PRODUCTION_WEB_APP_ERROR_CODE
    || !REASON_MESSAGES[error.reason]
    || !ERROR_PREFIXES[error.verificationKind]
  ) {
    return false;
  }
  return error.message === formatProductionWebAppErrorMessage(error.reason, error.verificationKind);
}

function rethrowSafe(error, fallbackReason, kind = 'verification') {
  if (isKnownSafeError(error)) {
    throw error;
  }
  throw createProductionWebAppVerificationError(fallbackReason, kind);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function validateProductionWebAppManifest(cwd = process.cwd()) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'appsscript.json'), 'utf8'));
  } catch (error) {
    throw createProductionWebAppVerificationError(
      PRODUCTION_WEB_APP_REASONS.MANIFEST_CONFIGURATION_INVALID,
      'manifest',
    );
  }
  if (!manifest.webapp || typeof manifest.webapp !== 'object' || Array.isArray(manifest.webapp)) {
    throw createProductionWebAppVerificationError(
      PRODUCTION_WEB_APP_REASONS.MANIFEST_CONFIGURATION_INVALID,
      'manifest',
    );
  }
  if (!hasOwn(manifest.webapp, 'access') || !manifest.webapp.access) {
    throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ACCESS_VALUE_MISSING, 'manifest');
  }
  if (manifest.webapp.access !== EXPECTED_WEB_APP_ACCESS) {
    throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ACCESS_MISMATCH, 'manifest');
  }
  if (!hasOwn(manifest.webapp, 'executeAs') || !manifest.webapp.executeAs) {
    throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.EXECUTE_AS_VALUE_MISSING, 'manifest');
  }
  if (manifest.webapp.executeAs !== EXPECTED_WEB_APP_EXECUTE_AS) {
    throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.EXECUTE_AS_MISMATCH, 'manifest');
  }
  return true;
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function validateWebAppUrl({ url, deploymentId, expectedWebAppUrl }) {
  if (url === undefined || url === null || url === '') {
    throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_MISSING);
  }
  if (typeof url !== 'string') {
    throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_INVALID);
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_INVALID);
  }
  if (parsed.protocol !== 'https:') {
    throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_PROTOCOL_MISMATCH);
  }
  if (parsed.hostname !== 'script.google.com' || parsed.port) {
    throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_HOST_MISMATCH);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_UNEXPECTED_COMPONENTS);
  }

  const expectedPath = `/macros/s/${deploymentId}/exec`;
  if (parsed.pathname !== expectedPath) {
    const deploymentPathMatch = parsed.pathname.match(/^\/macros\/s\/([^/]+)\/exec$/);
    if (deploymentPathMatch && deploymentPathMatch[1] !== deploymentId) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_DEPLOYMENT_ID_MISMATCH);
    }
    throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_PATH_MISMATCH);
  }
  if (typeof expectedWebAppUrl !== 'string' || url !== expectedWebAppUrl) {
    throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.CONFIGURED_WEB_APP_URL_MISMATCH);
  }
  return url;
}

function createComparableProductionWebAppDeploymentSnapshot({
  deployment,
  deploymentCount,
  expectedDeploymentId,
}) {
  try {
    if (!deployment || typeof deployment !== 'object' || Array.isArray(deployment)) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENTS_GET_RESPONSE_INVALID);
    }
    if (typeof expectedDeploymentId !== 'string' || !expectedDeploymentId) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENT_ID_UNAVAILABLE);
    }
    if (!Number.isInteger(deploymentCount) || deploymentCount < 1) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.INVALID_DEPLOYMENT_COUNT);
    }

    const deploymentConfig = deployment.deploymentConfig;
    if (
      !deploymentConfig
      || typeof deploymentConfig !== 'object'
      || !hasOwn(deploymentConfig, 'versionNumber')
      || deploymentConfig.versionNumber === null
      || deploymentConfig.versionNumber === ''
    ) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.VERSION_NUMBER_MISSING);
    }
    const versionNumber = deploymentConfig.versionNumber;
    if (typeof versionNumber !== 'number' || !Number.isFinite(versionNumber)) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.VERSION_NUMBER_INVALID);
    }
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.VERSION_NUMBER_NOT_POSITIVE_INTEGER);
    }

    if (!hasOwn(deployment, 'entryPoints') || deployment.entryPoints === null) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ENTRY_POINTS_MISSING);
    }
    if (!Array.isArray(deployment.entryPoints)) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ENTRY_POINTS_NOT_ARRAY);
    }
    for (const entryPoint of deployment.entryPoints) {
      if (!entryPoint || typeof entryPoint !== 'object' || Array.isArray(entryPoint)) {
        throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_RECORD_INVALID);
      }
      if (typeof entryPoint.entryPointType !== 'string' || !entryPoint.entryPointType) {
        throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_TYPE_MISSING);
      }
      if (entryPoint.entryPointType === 'ENTRY_POINT_TYPE_UNSPECIFIED') {
        throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_TYPE_UNSPECIFIED);
      }
    }

    const webAppEntryPoints = deployment.entryPoints.filter((entryPoint) => entryPoint.entryPointType === 'WEB_APP');
    let webAppObjectPresent = false;
    let entryPointConfigPresent = false;
    let webAppUrlPresent = false;
    let webAppUrlFingerprint = null;
    let webAppAccess = null;
    let webAppExecuteAs = null;

    // Multiple WEB_APP records have no safe canonical record. Keep only the
    // count so update comparison can fail before inspecting one arbitrarily.
    if (webAppEntryPoints.length === 1) {
      const webApp = webAppEntryPoints[0].webApp;
      webAppObjectPresent = Boolean(webApp && typeof webApp === 'object' && !Array.isArray(webApp));
      if (webAppObjectPresent) {
        webAppUrlPresent = typeof webApp.url === 'string' && webApp.url.length > 0;
        webAppUrlFingerprint = webAppUrlPresent ? fingerprint(webApp.url) : null;
        const config = webApp.entryPointConfig;
        entryPointConfigPresent = Boolean(config && typeof config === 'object' && !Array.isArray(config));
        if (entryPointConfigPresent) {
          webAppAccess = typeof config.access === 'string' && config.access ? config.access : null;
          webAppExecuteAs = typeof config.executeAs === 'string' && config.executeAs ? config.executeAs : null;
        }
      }
    }

    const deploymentIdValue = typeof deployment.deploymentId === 'string' && deployment.deploymentId
      ? deployment.deploymentId
      : null;
    return {
      deploymentCount,
      deploymentIdFingerprint: deploymentIdValue ? fingerprint(deploymentIdValue) : null,
      versionNumber,
      deploymentDescriptionFingerprint: fingerprint(deploymentConfig.description || ''),
      webAppEntryPointCount: webAppEntryPoints.length,
      entryPointTypes: deployment.entryPoints.map((entryPoint) => entryPoint.entryPointType).sort(),
      webAppUrlFingerprint,
      webAppUrlPresent,
      webAppAccess,
      webAppExecuteAs,
      webAppObjectPresent,
      entryPointConfigPresent,
    };
  } catch (error) {
    rethrowSafe(error, PRODUCTION_WEB_APP_REASONS.APPS_SCRIPT_API_REQUEST_FAILED);
  }
}

function createProductionWebAppDeploymentSnapshot({
  deployment,
  deploymentCount,
  expectedDeploymentId,
  expectedWebAppUrl,
}) {
  try {
    if (!deployment || typeof deployment !== 'object' || Array.isArray(deployment)) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENTS_GET_RESPONSE_INVALID);
    }
    if (typeof expectedDeploymentId !== 'string' || !expectedDeploymentId) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENT_ID_UNAVAILABLE);
    }
    if (deployment.deploymentId !== expectedDeploymentId) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENT_ID_MISMATCH);
    }
    if (!Number.isInteger(deploymentCount) || deploymentCount < 1) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.INVALID_DEPLOYMENT_COUNT);
    }

    const deploymentConfig = deployment.deploymentConfig;
    if (
      !deploymentConfig
      || typeof deploymentConfig !== 'object'
      || !hasOwn(deploymentConfig, 'versionNumber')
      || deploymentConfig.versionNumber === null
      || deploymentConfig.versionNumber === ''
    ) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.VERSION_NUMBER_MISSING);
    }
    const versionNumber = deploymentConfig.versionNumber;
    if (typeof versionNumber !== 'number' || !Number.isFinite(versionNumber)) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.VERSION_NUMBER_INVALID);
    }
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.VERSION_NUMBER_NOT_POSITIVE_INTEGER);
    }

    if (!hasOwn(deployment, 'entryPoints') || deployment.entryPoints === null) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ENTRY_POINTS_MISSING);
    }
    if (!Array.isArray(deployment.entryPoints)) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ENTRY_POINTS_NOT_ARRAY);
    }
    for (const entryPoint of deployment.entryPoints) {
      if (!entryPoint || typeof entryPoint !== 'object' || Array.isArray(entryPoint)) {
        throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_RECORD_INVALID);
      }
      if (typeof entryPoint.entryPointType !== 'string' || !entryPoint.entryPointType) {
        throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_TYPE_MISSING);
      }
      if (entryPoint.entryPointType === 'ENTRY_POINT_TYPE_UNSPECIFIED') {
        throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_TYPE_UNSPECIFIED);
      }
    }

    const webAppEntryPoints = deployment.entryPoints.filter((entryPoint) => entryPoint.entryPointType === 'WEB_APP');
    if (webAppEntryPoints.length === 0) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_ENTRY_POINT_MISSING);
    }
    if (webAppEntryPoints.length > 1) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.MULTIPLE_WEB_APP_ENTRY_POINTS);
    }

    const webApp = webAppEntryPoints[0].webApp;
    if (!webApp || typeof webApp !== 'object' || Array.isArray(webApp)) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_OBJECT_MISSING);
    }
    const config = webApp.entryPointConfig;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_CONFIG_MISSING);
    }
    const webAppUrl = validateWebAppUrl({
      url: webApp.url,
      deploymentId: expectedDeploymentId,
      expectedWebAppUrl,
    });
    if (!hasOwn(config, 'access') || typeof config.access !== 'string' || !config.access) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ACCESS_VALUE_MISSING);
    }
    if (config.access !== EXPECTED_WEB_APP_ACCESS) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ACCESS_MISMATCH);
    }
    if (!hasOwn(config, 'executeAs') || typeof config.executeAs !== 'string' || !config.executeAs) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.EXECUTE_AS_VALUE_MISSING);
    }
    if (config.executeAs !== EXPECTED_WEB_APP_EXECUTE_AS) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.EXECUTE_AS_MISMATCH);
    }

    return {
      deploymentCount,
      deploymentIdFingerprint: fingerprint(expectedDeploymentId),
      versionNumber,
      deploymentDescriptionFingerprint: fingerprint(deploymentConfig.description || ''),
      webAppEntryPointCount: 1,
      entryPointTypes: deployment.entryPoints.map((entryPoint) => entryPoint.entryPointType).sort(),
      webAppUrlFingerprint: fingerprint(webAppUrl),
      webAppUrlPresent: true,
      webAppAccess: config.access,
      webAppExecuteAs: config.executeAs,
      webAppObjectPresent: true,
      entryPointConfigPresent: true,
    };
  } catch (error) {
    rethrowSafe(error, PRODUCTION_WEB_APP_REASONS.APPS_SCRIPT_API_REQUEST_FAILED);
  }
}

async function fetchProductionWebAppDeploymentSnapshot({
  api,
  scriptId,
  deploymentId,
  expectedWebAppUrl,
  mode = PRODUCTION_WEB_APP_SNAPSHOT_MODES.STRICT,
}) {
  try {
    if (!Object.values(PRODUCTION_WEB_APP_SNAPSHOT_MODES).includes(mode)) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.SNAPSHOT_MODE_INVALID);
    }
    if (
      !api
      || !api.projects
      || !api.projects.deployments
      || typeof api.projects.deployments.get !== 'function'
      || typeof api.projects.deployments.list !== 'function'
    ) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.API_CLIENT_UNAVAILABLE);
    }
    if (typeof scriptId !== 'string' || !scriptId) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.SCRIPT_ID_UNAVAILABLE);
    }
    if (typeof deploymentId !== 'string' || !deploymentId) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENT_ID_UNAVAILABLE);
    }

    const deployments = [];
    const seenPageTokens = new Set();
    let pageToken;
    do {
      let response;
      try {
        response = await api.projects.deployments.list({ scriptId, pageToken, fields: LIST_FIELDS });
      } catch (error) {
        throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENTS_LIST_FAILED);
      }
      const data = response && response.data;
      if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.deployments)) {
        throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENTS_LIST_RESPONSE_INVALID);
      }
      deployments.push(...data.deployments);

      if (data.nextPageToken === undefined || data.nextPageToken === null || data.nextPageToken === '') {
        pageToken = '';
      } else if (typeof data.nextPageToken !== 'string' || !data.nextPageToken.trim()) {
        throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENT_PAGINATION_INVALID);
      } else {
        pageToken = data.nextPageToken;
      }
      if (pageToken && seenPageTokens.has(pageToken)) {
        throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DUPLICATE_PAGE_TOKEN_DETECTED);
      }
      if (pageToken) {
        seenPageTokens.add(pageToken);
      }
    } while (pageToken);

    const configuredDeployments = deployments.filter((deployment) => (
      deployment && deployment.deploymentId === deploymentId
    ));
    if (configuredDeployments.length === 0) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.CONFIGURED_DEPLOYMENT_NOT_FOUND);
    }
    if (configuredDeployments.length > 1) {
      throw createProductionWebAppVerificationError(
        PRODUCTION_WEB_APP_REASONS.CONFIGURED_DEPLOYMENT_APPEARED_MULTIPLE_TIMES,
      );
    }

    let response;
    try {
      response = await api.projects.deployments.get({ scriptId, deploymentId, fields: GET_FIELDS });
    } catch (error) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENTS_GET_FAILED);
    }
    if (
      !response
      || !response.data
      || typeof response.data !== 'object'
      || Array.isArray(response.data)
    ) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENTS_GET_RESPONSE_INVALID);
    }
    const snapshotArgs = {
      deployment: response.data,
      deploymentCount: deployments.length,
      expectedDeploymentId: deploymentId,
      expectedWebAppUrl,
    };
    if (mode === PRODUCTION_WEB_APP_SNAPSHOT_MODES.COMPARISON) {
      return createComparableProductionWebAppDeploymentSnapshot(snapshotArgs);
    }
    return createProductionWebAppDeploymentSnapshot(snapshotArgs);
  } catch (error) {
    rethrowSafe(error, PRODUCTION_WEB_APP_REASONS.APPS_SCRIPT_API_REQUEST_FAILED);
  }
}

function verifyProductionWebAppDeploymentUpdate({ before, after, update }) {
  try {
    if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.UPDATE_SNAPSHOT_INVALID, 'update');
    }
    if (!update || typeof update !== 'object') {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.UPDATE_RESULT_INVALID, 'update');
    }
    if (before.deploymentIdFingerprint !== after.deploymentIdFingerprint) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENT_ID_CHANGED, 'update');
    }
    if (before.deploymentCount !== after.deploymentCount) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.DEPLOYMENT_COUNT_CHANGED, 'update');
    }
    if (!Number.isInteger(update.versionNumber)) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.UPDATED_VERSION_MISMATCH, 'update');
    }
    if (
      update.versionNumber === before.versionNumber
      || after.versionNumber === before.versionNumber
    ) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.VERSION_DID_NOT_CHANGE, 'update');
    }
    if (update.versionNumber !== after.versionNumber) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.UPDATED_VERSION_MISMATCH, 'update');
    }
    if (before.webAppEntryPointCount === 1 && after.webAppEntryPointCount === 0) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_ENTRY_POINT_DISAPPEARED, 'update');
    }
    if (before.webAppEntryPointCount !== after.webAppEntryPointCount) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_ENTRY_POINT_COUNT_CHANGED, 'update');
    }
    if (before.webAppEntryPointCount !== 1 || after.webAppEntryPointCount !== 1) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.UPDATE_SNAPSHOT_INVALID, 'update');
    }
    if (!Array.isArray(before.entryPointTypes) || !Array.isArray(after.entryPointTypes)) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.UPDATE_SNAPSHOT_INVALID, 'update');
    }
    if (JSON.stringify(before.entryPointTypes) !== JSON.stringify(after.entryPointTypes)) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ENTRY_POINT_TYPES_CHANGED, 'update');
    }
    if (!after.webAppUrlPresent || before.webAppUrlFingerprint !== after.webAppUrlFingerprint) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.WEB_APP_URL_CHANGED, 'update');
    }
    if (before.webAppAccess !== after.webAppAccess) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.ACCESS_CHANGED, 'update');
    }
    if (before.webAppExecuteAs !== after.webAppExecuteAs) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.EXECUTE_AS_CHANGED, 'update');
    }
    if (!after.webAppObjectPresent || !after.entryPointConfigPresent) {
      throw createProductionWebAppVerificationError(PRODUCTION_WEB_APP_REASONS.UPDATE_SNAPSHOT_INVALID, 'update');
    }
    return true;
  } catch (error) {
    rethrowSafe(error, PRODUCTION_WEB_APP_REASONS.UPDATE_VERIFICATION_FAILED, 'update');
  }
}

module.exports = {
  EXPECTED_WEB_APP_ACCESS,
  EXPECTED_WEB_APP_EXECUTE_AS,
  PRODUCTION_WEB_APP_ERROR_CODE,
  PRODUCTION_WEB_APP_REASONS,
  PRODUCTION_WEB_APP_SNAPSHOT_MODES,
  createComparableProductionWebAppDeploymentSnapshot,
  createProductionWebAppDeploymentSnapshot,
  createProductionWebAppVerificationError,
  fetchProductionWebAppDeploymentSnapshot,
  formatProductionWebAppErrorMessage,
  validateProductionWebAppManifest,
  verifyProductionWebAppDeploymentUpdate,
};
