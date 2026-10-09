// First-run provisioning for the self-contained PayOol Windows distribution.
// This module never reads the builder's profile and never touches Codex settings.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');

const files = ['backend.ts', 'dashboard.ts', 'gateway.ts', 'GUIDE.fr.md',
  'launcher-hook.cjs', 'launcher-surface.cjs', 'launcher-ui-patch.cjs',
  'launcher-ui.css', 'manager.cjs', 'OpenCodexSurface.tsx', 'preload.ts'];
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function rename(source, destination) {
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(source, destination); return; }
    catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 20) throw error;
      // Windows may briefly retain a scanner/indexer handle after a large
      // package copy. Retry this owned atomic move, without stopping processes.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(50 * 2 ** attempt, 500));
    }
  }
}
function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = file + '.next-' + crypto.randomUUID();
  fs.writeFileSync(next, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  rename(next, file);
}
function safePath(root, name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(name)) throw Error('Unsafe distribution path');
  return path.join(root, ...name.split('/'));
}
function verifyPayload(payload) {
  const manifest = read(path.join(payload, 'manifest.json'));
  if (manifest.schema !== 1 || manifest.platform !== process.platform || manifest.arch !== process.arch
      || !/^\d+\.\d+\.\d+$/.test(manifest.openCodexVersion) || !Array.isArray(manifest.files) || !manifest.files.length) throw Error('Incompatible OpenCodex distribution');
  const names = new Set();
  for (const item of manifest.files) {
    const file = safePath(payload, item.path);
    if (names.has(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256) || !fs.lstatSync(file).isFile() || hash(file) !== item.sha256) throw Error('OpenCodex distribution integrity check failed');
    names.add(item.path);
  }
  for (const name of [...files.map(f => 'code/' + f), 'node/node.exe', 'node/node_modules/npm/bin/npm-cli.js', 'package/node_modules/@bitkyc08/opencodex/package.json', 'package/node_modules/@bitkyc08/opencodex/src/index.ts']) {
    if (!names.has(name)) throw Error('Incomplete OpenCodex distribution: ' + name);
  }
  return manifest;
}
function alive(file) {
  if (!fs.existsSync(file)) return false;
  const owner = read(file);
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw Error('Invalid integration lock owner');
  try { process.kill(owner.pid, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; }
}
async function freePort(preferred, excluded = []) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', error => {
      if (preferred && error.code === 'EADDRINUSE') freePort(0, excluded).then(resolve, reject);
      else reject(error);
    });
    server.listen(preferred, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => excluded.includes(port) ? freePort(0, excluded).then(resolve, reject) : resolve(port));
    });
  });
}
async function provision({ payload, coreHome, codexHome, bun, launcher }) {
  for (const value of [payload, coreHome, codexHome, bun, launcher]) if (!path.isAbsolute(value)) throw Error('Distribution paths must be absolute');
  const root = path.join(coreHome, 'integrations', 'opencodex');
  const settingsFile = path.join(root, 'settings.json');
  const previous = fs.existsSync(settingsFile) ? read(settingsFile) : null;
  const manifestHash = hash(path.join(payload, 'manifest.json'));
  const markerFile = path.join(root, 'distribution.json');
  const marker = fs.existsSync(markerFile) ? read(markerFile) : null;
  const sameCode = files.every(file => fs.existsSync(path.join(root, file)) && hash(path.join(root, file)) === hash(path.join(payload, 'code', file)));
  if (marker?.manifestHash === manifestHash && previous && sameCode
      && previous.bun === bun && previous.launcher === launcher
      && fs.existsSync(path.join(previous.packageRoot, 'src/index.ts')) && fs.existsSync(previous.node)) return { root, installed: false };
  if (alive(path.join(root, 'owner.lock')) || alive(path.join(root, 'update.lock'))) throw Error('OpenCodex is in use. Keep this installation open and finish active tasks before upgrading.');
  const manifest = verifyPayload(payload);
  const home = previous?.home || path.join(root, 'state');
  if (previous && (previous.coreHome !== coreHome || previous.codexHome !== codexHome)) throw Error('OpenCodex belongs to a different Codex profile');
  const configFile = path.join(home, 'config.json');
  if (fs.existsSync(configFile)) {
    const config = read(configFile);
    if (config.runtimeRole !== 'hub' || config.hostname !== '127.0.0.1' || config.clientIntegrations?.codex !== false || config.unauthenticatedLoopbackListener?.enabled === true) throw Error('Existing OpenCodex configuration is not owned by this integration');
  }
  fs.mkdirSync(root, { recursive: true });
  // Immutable per-distribution payload; a later launcher update cannot remove
  // the package currently used by an independently updated OpenCodex instance.
  const deployed = path.join(root, 'distributions', manifestHash);
  if (!fs.existsSync(deployed)) {
    const temporary = deployed + '.next-' + crypto.randomUUID();
    fs.mkdirSync(temporary, { recursive: true });
    for (const item of manifest.files) {
      const target = safePath(temporary, item.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(safePath(payload, item.path), target);
    }
    rename(temporary, deployed);
  }
  const port = previous?.port || await freePort(10110);
  const dashboardPort = previous?.dashboardPort || await freePort(10100, [port]);
  if (!fs.existsSync(configFile)) atomic(configFile, {
    hostname: '127.0.0.1', port, runtimeRole: 'hub',
    unauthenticatedLoopbackListener: { enabled: false },
    clientIntegrations: { codex: false }, codexAutoStart: false, codexShimAutoRestore: false,
    providers: {},
  });
  if (!fs.existsSync(path.join(root, 'gateway-key'))) fs.writeFileSync(path.join(root, 'gateway-key'), crypto.randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 });
  const settings = {
    enabled: true, ...previous, home, coreHome, codexHome, port, dashboardPort,
    bun, launcher, node: path.join(deployed, 'node', 'node.exe'),
    npmCli: path.join(deployed, 'node', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    clientVersion: previous?.clientVersion || '0.0.0',
    version: previous?.version || manifest.openCodexVersion,
    packageRoot: previous?.packageRoot || path.join(deployed, 'package', 'node_modules', '@bitkyc08', 'opencodex'),
    distribution: 'PayOol',
  };
  for (const file of files) {
    const destination = path.join(root, file);
    const next = destination + '.next-' + crypto.randomUUID();
    fs.copyFileSync(path.join(deployed, 'code', file), next);
    rename(next, destination);
  }
  atomic(settingsFile, settings);
  atomic(markerFile, { manifestHash, version: manifest.version, openCodexVersion: manifest.openCodexVersion });
  return { root, installed: true };
}
module.exports = { files, provision, verifyPayload, safePath };
