// Exercises the packaged executable with an isolated, initially empty profile.
// It never installs over, quits or edits a user's active launcher.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const net = require('node:net');
const { homedir } = require('node:os');
const { runObservedProcess } = require('../../launcher/scripts/package-smoke-process.cjs');

const repo = path.resolve(__dirname, '../..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bridgeSmoke(settings, integration, env, scratch) {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const configScript = path.join(scratch, 'create-config.ts');
  fs.writeFileSync(configScript, `import { defaultConfig } from ${JSON.stringify(pathToFileURL(path.join(repo, 'src/config.ts')).href)};\nimport { writeFileSync } from 'node:fs';\nconst c = defaultConfig(); c.port = ${port}; writeFileSync(${JSON.stringify(path.join(settings.coreHome, 'config.json'))}, JSON.stringify(c));`);
  const setup = spawnSync(settings.bun, [configScript], { env, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(setup.status, 0, setup.stderr);
  const config = read(path.join(settings.coreHome, 'config.json'));
  const entry = path.resolve(path.dirname(settings.bun), '../app/cli.js');
  const log = fs.openSync(path.join(scratch, 'bridge.log'), 'a');
  const child = spawn(settings.bun, ['--preload', path.join(integration, 'preload.ts'), entry, 'serve'], { env, windowsHide: true, stdio: ['ignore', log, log] });
  const exit = new Promise(resolve => child.once('exit', resolve));
  const endpoint = `http://127.0.0.1:${port}`;
  try {
    let healthy = false;
    for (let i = 0; i < 200; i++) {
      if (child.exitCode !== null) {
        const detail = fs.readFileSync(path.join(scratch, 'bridge.log'), 'utf8').slice(-4000)
          .replaceAll(config.controlToken, '[redacted]').replace(/Bearer\s+\S+/g, 'Bearer [redacted]');
        throw Error('Isolated integrated bridge exited before health: ' + detail);
      }
      try { const r = await fetch(endpoint + '/healthz', { signal: AbortSignal.timeout(500) }); if (r.ok && (await r.json()).pid === child.pid) { healthy = true; break; } } catch {}
      await pause(300);
    }
    if (!healthy) {
      const detail = [path.join(scratch, 'bridge.log'), path.join(integration, 'logs/backend.log')]
        .filter(file => fs.existsSync(file)).map(file => fs.readFileSync(file, 'utf8').slice(-5000)).join('\n')
        .replaceAll(config.controlToken, '[redacted]').replace(/Bearer\s+\S+/g, 'Bearer [redacted]');
      throw Error('Integrated bridge health timed out: ' + detail);
    }
    const backend = await fetch(`http://127.0.0.1:${settings.port}/healthz`);
    assert.equal((await backend.json()).version, settings.version);
    const dashboard = await fetch(`http://127.0.0.1:${settings.dashboardPort}/`);
    assert.equal(dashboard.ok, true);
    assert.match(await dashboard.text(), /<html/);
    const drain = await fetch(endpoint + '/admin/drain', { method: 'POST', headers: { authorization: 'Bearer ' + config.controlToken }, signal: AbortSignal.timeout(5000) });
    assert.equal(drain.ok, true, 'isolated bridge drain');
    const response = await fetch(endpoint + '/admin/shutdown', { method: 'POST', headers: { authorization: 'Bearer ' + config.controlToken }, signal: AbortSignal.timeout(5000) });
    assert.equal(response.ok, true, 'isolated bridge shutdown response');
    const code = await Promise.race([exit, pause(15000).then(() => 'timeout')]);
    assert.equal(code, 0, 'isolated bridge shutdown');
  } finally {
    if (child.exitCode === null) { child.kill(); await Promise.race([exit, pause(5000)]); }
    fs.closeSync(log);
    await pause(1800); // The owned backend watches this gateway PID.
  }
}
async function main() {
  const headless = process.argv.includes('--headless');
  const appRoot = path.resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || path.join(repo, 'dist/payool/artifacts/win-unpacked'));
  const executable = path.join(appRoot, 'Codex Web GPT.exe');
  if (!fs.existsSync(executable)) throw Error('Build the Codex Web GPT Windows distribution first');
  // A real installed runtime must not point into the OS temporary directory.
  // Match an installed user-profile path. A deeply nested checkout can put
  // npm's entry point beyond Windows' path limit and is not an install profile.
  const scratchParent = path.join(homedir(), '.codex-web-gpt-test-profiles');
  fs.mkdirSync(scratchParent, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(scratchParent, 'clean-'));
  const coreHome = path.join(scratch, 'core'), codexHome = path.join(scratch, 'codex');
  const marker = path.join(scratch, 'ready.json');
  const env = { ...process.env, CODEX_CHATGPT_WEB_HOME: coreHome, CODEX_HOME: codexHome,
    CODEX_WEB_GPT_LAUNCHER_DATA_DIR: path.join(scratch, 'launcher'), CODEX_WEB_GPT_SMOKE_FILE: marker };
  delete env.OPENCODEX_HOME;
  delete env.CODEX_OPENCODEX_ROOT;
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const launch = async () => {
      if (headless) {
        await require('./distribution.cjs').provision({ payload: path.join(appRoot, 'resources/opencodex'),
          coreHome, codexHome, bun: path.join(appRoot, 'resources/runtime/runtime/bun.exe'), launcher: executable });
      } else {
        await runObservedProcess(executable, ['--launcher-smoke-test'], { env, timeoutMs: 180000, stage: 'Codex Web GPT isolated-profile launch' });
        assert.equal(read(marker).ok, true);
        assert.equal(read(marker).runtimeVerified, true);
      }
    };
    await launch();
    const integration = path.join(coreHome, 'integrations/opencodex');
    const settings = read(path.join(integration, 'settings.json'));
    assert.equal(settings.distribution, 'PayOol');
    assert.equal(settings.version, '2.81.0');
    assert.equal(fs.existsSync(settings.node), true);
    assert.equal(fs.existsSync(settings.npmCli), true);
    assert.equal(fs.existsSync(path.join(codexHome, 'config.toml')), false);
    assert.deepEqual(read(path.join(settings.home, 'config.json')).providers, {});
    const validation = await runObservedProcess(settings.bun, [path.join(integration, 'manager.cjs'), 'validate'], { env, timeoutMs: 90000, stage: 'Bundled official OpenCodex cold validation' });
    const evidence = JSON.parse(validation.stdout);
    assert.equal(evidence.version, '2.81.0');
    assert.equal(evidence.dashboard, true);
    assert.equal(evidence.nativeConfigUnchanged, true);
    assert.ok(evidence.models > 0);
    await bridgeSmoke(settings, integration, env, scratch);
    const npm = spawnSync(settings.node, [settings.npmCli, '--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.equal(npm.status, 0, npm.error?.message || npm.stderr || 'bundled npm must start from the installed profile');
    // Reopening must retain the private gateway key and provider configuration.
    const key = fs.readFileSync(path.join(integration, 'gateway-key'), 'utf8');
    const configFile = path.join(settings.home, 'config.json');
    const before = read(configFile);
    before.providers = { smoke: { adapter: 'openai-responses', baseUrl: 'http://127.0.0.1:1', apiKey: 'public-test-fixture' } };
    fs.writeFileSync(configFile, JSON.stringify(before));
    await launch();
    assert.equal(fs.readFileSync(path.join(integration, 'gateway-key'), 'utf8'), key);
    assert.deepEqual(read(configFile), before);
    const report = { version: read(path.join(repo, 'package.json')).version, platform: process.platform,
      freshProfile: true, launcherVerified: !headless, bundledTools: true, openCodexVersion: evidence.version,
      dashboard: true, catalogModels: evidence.models, nativeConfigUnchanged: true, integratedBridge: true,
      relaunchPreservesProviders: true, checkedAt: new Date().toISOString() };
    const reportFile = path.join(repo, 'dist/payool', headless ? 'headless-smoke-report.json' : 'smoke-report.json');
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
    console.log('PAYOOL_CLEAN_PROFILE_OK ' + JSON.stringify(report));
  } finally {
    // mkdtemp gives this process sole ownership; the current installation and
    // its processes are never selected by name or traversed for cleanup.
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
