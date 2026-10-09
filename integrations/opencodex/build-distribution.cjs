// Build the Windows fork installer from public sources and locked dependencies.
// Output contains no files from the user's Codex or OpenCodex profiles.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { files } = require('./distribution.cjs');
const ui = require('./launcher-ui-patch.cjs');

const repository = path.resolve(__dirname, '../..');
const output = path.join(repository, 'dist', 'payool');
const stage = path.join(output, 'build');
const launcher = path.join(stage, 'launcher');
const payload = path.join(stage, 'opencodex');
const nodeVersion = '22.19.0';
const nodeHash = 'ea3fad0e67a991d8477d8c01344b56e69c676ccb733f065b22436994b1253f86';
const openCodexVersion = '2.81.0';
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
async function run(executable, args, cwd = repository) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(Error('Build command failed: ' + code)));
  });
}
async function download(url, file) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw Error('Download failed: ' + response.status);
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}
function walk(root, prefix = '') {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) result.push(...walk(root, relative));
    else if (entry.isFile()) result.push({ path: relative, sha256: hash(path.join(root, relative)) });
    else throw Error('Distribution cannot contain a link: ' + relative);
  }
  return result.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
function patchPackagedLauncher(root) {
  ui.patchSources(root, __dirname);
  // Reuse the already tested native-view patch, then substitute only its
  // module reference with a path derived from this launcher's active profile.
  ui.patchElectron(root, __dirname);
  const mainFile = path.join(root, 'electron/main.cjs');
  let main = fs.readFileSync(mainFile, 'utf8');
  main = ui.replaceOnce(main, JSON.stringify(path.join(__dirname, 'launcher-surface.cjs')),
    'path.join(CORE_HOME, "integrations", "opencodex", "launcher-surface.cjs")', 'distribution surface');
  const eol = main.includes('\r\n') ? '\r\n' : '\n';
  main = ui.replaceOnce(main, `  await app.whenReady();${eol}${eol}  const stateStore`, `  await app.whenReady();
  let preparationWindow;
  if (!process.argv.includes('--launcher-smoke-test') && !fs.existsSync(path.join(CORE_HOME, 'integrations', 'opencodex', 'distribution.json'))) {
    preparationWindow = new BrowserWindow({ width: 460, height: 200, resizable: false, autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await preparationWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html><body style="background:#202020;color:#eee;font:16px system-ui;padding:32px"><h3>Codex Web GPT + OpenCodex</h3><p>Preparing your first launch… / Préparation du premier lancement…</p></body></html>'));
  }
  try {
    await require('./opencodex-distribution.cjs').provision({
      payload: path.join(process.resourcesPath, 'opencodex'),
      coreHome: CORE_HOME, codexHome: LAUNCHER_PROFILE.codexHome,
      bun: runtimeBundlePaths(installedRuntimeRoot).executable, launcher: process.execPath,
    });
  } finally { if (preparationWindow && !preparationWindow.isDestroyed()) preparationWindow.destroy(); }

  const stateStore`, 'distribution startup');
  fs.writeFileSync(mainFile, main);
  fs.copyFileSync(path.join(__dirname, 'distribution.cjs'), path.join(root, 'electron/opencodex-distribution.cjs'));
  const commandFile = path.join(root, 'electron/runtime-command.cjs');
  let command = fs.readFileSync(commandFile, 'utf8');
  command = ui.replaceOnce(command, '  runtimeInvocation,', `  runtimeInvocation: options => {
    const invocation = runtimeInvocation(options);
    if (options.args.length !== 1 || options.args[0] !== 'serve') return invocation;
    const root = path.join(process.env.CODEX_CHATGPT_WEB_HOME, 'integrations', 'opencodex');
    return require(path.join(root, 'launcher-hook.cjs'))(invocation, options.args);
  },`, 'distribution runtime');
  fs.writeFileSync(commandFile, command);
}
async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Build this distribution on Windows x64');
  const bun = process.env.CODEX_CHATGPT_WEB_BUN;
  if (!bun || !path.isAbsolute(bun)) throw Error('Set CODEX_CHATGPT_WEB_BUN to the pinned Bun executable');
  const version = read(path.join(repository, 'package.json')).version;
  fs.mkdirSync(payload, { recursive: true });
  const cache = path.join(output, 'downloads');
  fs.mkdirSync(cache, { recursive: true });
  const archive = path.join(cache, `node-v${nodeVersion}-win-x64.zip`);
  if (!fs.existsSync(archive)) await download(`https://nodejs.org/download/release/v${nodeVersion}/node-v${nodeVersion}-win-x64.zip`, archive);
  if (hash(archive) !== nodeHash) throw Error('Official Node archive SHA-256 mismatch');
  if (!fs.existsSync(path.join(payload, 'node', 'node.exe'))) {
    await run('tar.exe', ['-xf', archive, '-C', payload]);
    fs.renameSync(path.join(payload, `node-v${nodeVersion}-win-x64`), path.join(payload, 'node'));
  }
  const node = path.join(payload, 'node', 'node.exe');
  const npm = path.join(payload, 'node', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const prefix = path.join(payload, 'package');
  const metadataResponse = await fetch(`https://registry.npmjs.org/@bitkyc08%2fopencodex/${openCodexVersion}`);
  if (!metadataResponse.ok) throw Error('OpenCodex registry is unavailable');
  const metadata = await metadataResponse.json();
  if (metadata.name !== '@bitkyc08/opencodex' || metadata.version !== openCodexVersion || !/^sha512-/.test(metadata.dist?.integrity || '')) throw Error('Invalid OpenCodex package identity');
  if (!fs.existsSync(path.join(prefix, 'package-lock.json'))) {
    await run(node, [npm, 'install', '--prefix', prefix, '--registry=https://registry.npmjs.org', '--ignore-scripts', '--no-audit', '--no-fund', `@bitkyc08/opencodex@${openCodexVersion}`]);
  }
  if (read(path.join(prefix, 'package-lock.json')).packages['node_modules/@bitkyc08/opencodex'].integrity !== metadata.dist.integrity) throw Error('OpenCodex npm integrity mismatch');
  fs.mkdirSync(path.join(payload, 'code'), { recursive: true });
  for (const file of files) fs.copyFileSync(path.join(__dirname, file), path.join(payload, 'code', file));
  const records = walk(payload).filter(f => f.path !== 'manifest.json');
  write(path.join(payload, 'manifest.json'), { schema: 1, platform: 'win32', arch: 'x64', version, openCodexVersion, nodeVersion, nodeArchiveSha256: nodeHash, openCodexIntegrity: metadata.dist.integrity, files: records });
  // Prepare a fresh staging launcher without changing the source tree or the
  // installed application. Only known source directories enter the installer.
  if (fs.existsSync(launcher)) {
    const resolved = fs.realpathSync(launcher);
    if (resolved !== path.resolve(stage, 'launcher')) throw Error('Unexpected staging path');
    fs.rmSync(launcher, { recursive: true, force: true });
  }
  fs.mkdirSync(launcher, { recursive: true });
  for (const item of ['src', 'electron', 'assets', 'tsconfig.json', 'vite.config.ts', 'index.html', 'package.json']) fs.cpSync(path.join(repository, 'launcher', item), path.join(launcher, item), { recursive: true });
  fs.symlinkSync(path.join(repository, 'launcher', 'node_modules'), path.join(launcher, 'node_modules'), 'junction');
  patchPackagedLauncher(launcher);
  const manifest = read(path.join(launcher, 'package.json'));
  manifest.build.appId = manifest.payoolDistribution.appId;
  manifest.build.productName = manifest.payoolDistribution.productName;
  manifest.build.nsis.guid = manifest.payoolDistribution.nsisGuid;
  manifest.build.nsis.runAfterFinish = false;
  manifest.build.extraResources = [
    { from: path.join(stage, 'runtime'), to: 'runtime' },
    { from: payload, to: 'opencodex' },
  ];
  manifest.build.directories.output = path.join(output, 'artifacts');
  manifest.build.npmRebuild = false;
  const electronDist = path.join(repository, 'launcher', 'node_modules', 'electron', 'dist');
  if (fs.existsSync(path.join(electronDist, 'electron.exe'))) manifest.build.electronDist = electronDist;
  write(path.join(launcher, 'package.json'), manifest);
  await run(bun, ['run', 'build'], launcher);
  ui.patchRendererCacheKey(path.join(launcher, 'dist/index.html'));
  await run(bun, ['run', 'scripts/build-runtime-bundle.ts', path.join(stage, 'runtime')]);
  await run(bun, ['run', 'scripts/smoke-release.ts', path.join(stage, 'runtime')]);
  const builder = require.resolve('electron-builder/out/cli/cli.js', { paths: [path.join(repository, 'launcher')] });
  await run(node, [builder, '--projectDir', launcher, '--win', '--x64', '--publish', 'never']);
  console.log('PAYOOL_DISTRIBUTION_BUILT ' + version);
}
module.exports = { patchPackagedLauncher, walk };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
