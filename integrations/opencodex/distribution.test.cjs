const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { files, provision, verifyPayload, safePath } = require('./distribution.cjs');
const { walk } = require('./build-distribution.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodex-distribution-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const payload = path.join(root, 'payload');
  const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  for (const name of files) write(path.join(payload, 'code', name), 'source ' + name);
  for (const name of ['node/node.exe', 'node/node_modules/npm/bin/npm-cli.js', 'package/node_modules/@bitkyc08/opencodex/src/index.ts']) write(path.join(payload, name), 'public fixture');
  write(path.join(payload, 'package/node_modules/@bitkyc08/opencodex/package.json'), { version: '2.81.0' });
  const manifest = { schema: 1, platform: process.platform, arch: process.arch, version: 'test', openCodexVersion: '2.81.0', files: walk(payload) };
  write(path.join(payload, 'manifest.json'), manifest);
  const options = { payload, coreHome: path.join(root, 'private-core'), codexHome: path.join(root, 'private-codex'), bun: path.join(root, 'bun.exe'), launcher: path.join(root, 'launcher.exe') };
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  return { root, payload, options, manifest, write, read, install: () => provision(options) };
}
test('fresh provisioning needs no tools, accounts or pre-existing Codex config', async t => {
  const f = fixture(t);
  const result = await f.install();
  assert.equal(result.installed, true);
  const settings = f.read(path.join(result.root, 'settings.json'));
  assert.equal(settings.distribution, 'PayOol');
  assert.equal(settings.version, '2.81.0');
  assert.equal(fs.existsSync(settings.node), true);
  assert.equal(fs.existsSync(settings.npmCli), true);
  assert.equal(fs.existsSync(f.options.codexHome), false);
  const config = f.read(path.join(settings.home, 'config.json'));
  assert.deepEqual(config.providers, {});
  assert.equal(config.clientIntegrations.codex, false);
  assert.equal(config.runtimeRole, 'hub');
  assert.equal(fs.readFileSync(path.join(result.root, 'gateway-key'), 'utf8').length, 43);
  assert.equal((await f.install()).installed, false);
});
test('launcher upgrade preserves independently updated OpenCodex, providers and user choices', async t => {
  const f = fixture(t), { root } = await f.install();
  const file = path.join(root, 'settings.json'), settings = f.read(file);
  const packageRoot = path.join(root, 'packages', '3.0.0');
  f.write(path.join(packageRoot, 'src/index.ts'), 'newer official package');
  f.write(file, { ...settings, version: '3.0.0', packageRoot, enabled: false });
  const configFile = path.join(settings.home, 'config.json');
  const config = { ...f.read(configFile), providers: { preserved: { key: 'fixture-not-a-secret' } } };
  f.write(configFile, config);
  f.write(path.join(f.payload, 'code', 'manager.cjs'), 'new manager');
  f.write(path.join(f.payload, 'manifest.json'), { ...f.manifest, version: 'new', files: walk(f.payload).filter(i => i.path !== 'manifest.json') });
  await f.install();
  const after = f.read(file);
  assert.equal(after.packageRoot, packageRoot);
  assert.equal(after.version, '3.0.0');
  assert.equal(after.enabled, false);
  assert.deepEqual(f.read(configFile), config);
});
test('a running owner blocks replacement without changing settings or code', async t => {
  const f = fixture(t), { root } = await f.install();
  const settings = fs.readFileSync(path.join(root, 'settings.json'), 'utf8');
  f.write(path.join(root, 'owner.lock'), { pid: process.pid });
  f.write(path.join(f.payload, 'code', 'manager.cjs'), 'changed');
  await assert.rejects(f.install(), /in use/);
  assert.equal(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'), settings);
  assert.equal(fs.readFileSync(path.join(root, 'manager.cjs'), 'utf8'), 'source manager.cjs');
});
test('corrupt payload, missing files, duplicate records and traversal are rejected', t => {
  const f = fixture(t);
  for (const unsafe of ['../x', '/x', 'C:\\x', 'a/../b', 'a//b']) assert.throws(() => safePath(f.payload, unsafe));
  f.write(path.join(f.payload, 'code/manager.cjs'), 'corrupt');
  assert.throws(() => verifyPayload(f.payload), /integrity/);
  f.write(path.join(f.payload, 'code/manager.cjs'), 'source manager.cjs');
  f.write(path.join(f.payload, 'manifest.json'), { ...f.manifest, files: [...f.manifest.files, f.manifest.files[0]] });
  assert.throws(() => verifyPayload(f.payload), /integrity/);
  f.write(path.join(f.payload, 'manifest.json'), { ...f.manifest, files: f.manifest.files.filter(i => i.path !== 'node/node.exe') });
  assert.throws(() => verifyPayload(f.payload), /Incomplete/);
});
