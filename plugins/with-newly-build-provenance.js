const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod } = require('@expo/config-plugins');

const FILENAME = 'runcloud-build-provenance.json';
const PLUGIN_NAME = './plugins/with-newly-build-provenance';

function withoutBuildProvenancePlugin(config) {
  const plugins = Array.isArray(config.plugins)
    ? config.plugins.filter((entry) => (
        (Array.isArray(entry) ? entry[0] : entry) !== PLUGIN_NAME
      ))
    : config.plugins;
  return { ...config, ...(plugins ? { plugins } : {}) };
}

function git(projectRoot, args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10_000,
  }).trim();
}

function validatePrepared(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const required = ['sourceCommit', 'turnId', 'nativeFingerprint', 'buildIdentity', 'createdAt'];
  if (required.some((key) => typeof value[key] !== 'string' || !value[key].trim())) return null;
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.sourceCommit)) return null;
  if (!/^[a-f0-9]{64}$/.test(value.nativeFingerprint)) return null;
  if (Number.isNaN(Date.parse(value.createdAt))) return null;
  return { ...value, schemaVersion: 1 };
}

async function provenance(projectRoot) {
  const preparedPath = path.join(projectRoot, '.newly', 'build-provenance.json');
  if (fs.existsSync(preparedPath)) {
    const prepared = validatePrepared(JSON.parse(fs.readFileSync(preparedPath, 'utf8')));
    if (!prepared) throw new Error(`${preparedPath} is not a valid Newly build provenance manifest.`);
    return prepared;
  }

  const sourceCommit = git(projectRoot, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const checkpointTurn = git(projectRoot, [
    'log',
    '-1',
    '--format=%(trailers:key=Newly-Session,valueonly)',
  ]).trim();
  const fingerprint = await require('@expo/fingerprint').createFingerprintAsync(projectRoot, {
    ignorePaths: ['.gitignore'],
  });
  return {
    schemaVersion: 1,
    sourceCommit,
    turnId: process.env.NEWLY_BUILD_TURN_ID?.trim() || checkpointTurn || `interactive:${sourceCommit}`,
    nativeFingerprint: fingerprint.hash,
    buildIdentity: process.env.NEWLY_BUILD_IDENTITY?.trim() || `newly-prebuild-${randomUUID()}`,
    createdAt: new Date().toISOString(),
  };
}

module.exports = function withNewlyBuildProvenance(config) {
  if (process.env.NEWLY_SHARED_ANDROID_RUNTIME === '1') {
    return withoutBuildProvenancePlugin(config);
  }

  return withDangerousMod(config, ['android', async (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const manifest = await provenance(projectRoot);
    const assetsDirectory = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets');
    fs.mkdirSync(assetsDirectory, { recursive: true });
    fs.writeFileSync(path.join(assetsDirectory, FILENAME), `${JSON.stringify(manifest, null, 2)}\n`);
    return modConfig;
  }]);
};
