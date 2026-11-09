import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  discoverUserscriptArtifact,
  parseBuildInstallOptions,
  resolveNpmInvocation,
  startUserscriptInstallServer,
  validateUserscriptArtifact,
} from './build-and-install-userscript.mjs';

const SOURCE = `// ==UserScript==
// @name         Test Script
// @version      1.2.3
// @match        https://example.com/*
// ==/UserScript==
console.log('test');
`;

test('parses explicit build-install options', () => {
  assert.deepEqual(parseBuildInstallOptions([
    '--skip-build',
    '--no-open',
    '--build-script=build:all',
    '--artifact',
    'dist/test.user.js',
    '--timeout-ms',
    '5000',
  ]), {
    artifact: 'dist/test.user.js',
    buildScript: 'build:all',
    noOpen: true,
    skipBuild: true,
    timeoutMs: 5000,
  });
  assert.throws(() => parseBuildInstallOptions(['--unknown']), /Unknown build-install argument/u);
  assert.throws(() => parseBuildInstallOptions(['--build-script=build & calc']), /npm script name/u);
});

test('runs the build through the npm that started the installer', () => {
  assert.deepEqual(resolveNpmInvocation('build', {
    env: { npm_execpath: '/usr/lib/node_modules/npm/bin/npm-cli.js' },
    execPath: '/usr/bin/node',
    platform: 'linux',
  }), { executable: '/usr/bin/node', args: ['/usr/lib/node_modules/npm/bin/npm-cli.js', 'run', 'build'] });
  assert.deepEqual(resolveNpmInvocation('build:all', {
    env: { npm_execpath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js' },
    execPath: 'C:\\Program Files\\nodejs\\node.exe',
    platform: 'win32',
  }), {
    executable: 'C:\\Program Files\\nodejs\\node.exe',
    args: ['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js', 'run', 'build:all'],
  });
});

test('never spawns the npm .cmd shim directly on Windows', () => {
  assert.deepEqual(resolveNpmInvocation('build', { env: {}, platform: 'win32' }), {
    executable: 'cmd.exe',
    args: ['/d', '/s', '/c', 'npm', 'run', 'build'],
  });
  assert.deepEqual(resolveNpmInvocation('build', { env: {}, platform: 'linux' }), {
    executable: 'npm',
    args: ['run', 'build'],
  });
});

test('discovers and validates exactly one project-local userscript artifact', async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'userscript-install-discovery-'));
  try {
    await fs.mkdir(path.join(projectPath, 'dist'));
    const artifactPath = path.join(projectPath, 'dist/test.user.js');
    await fs.writeFile(artifactPath, SOURCE);
    assert.equal(await discoverUserscriptArtifact(projectPath), artifactPath);
    assert.deepEqual(await validateUserscriptArtifact(artifactPath), {
      name: 'Test Script',
      source: SOURCE,
      version: '1.2.3',
    });
    await fs.writeFile(path.join(projectPath, 'dist/second.user.js'), SOURCE);
    await assert.rejects(discoverUserscriptArtifact(projectPath), /Expected exactly one/u);
  } finally {
    await fs.rm(projectPath, { force: true, recursive: true });
  }
});

test('serves only the tokenized userscript route and observes the installer fetch', async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'userscript-install-server-'));
  const artifactPath = path.join(projectPath, 'test.user.js');
  await fs.writeFile(artifactPath, SOURCE);
  const installer = await startUserscriptInstallServer(artifactPath, SOURCE);
  try {
    const missing = await fetch(new URL('/wrong', installer.localUrl));
    assert.equal(missing.status, 404);
    const response = await fetch(installer.localUrl);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(await response.text(), SOURCE);
    await installer.fetched;
    assert.match(installer.installerUrl, /^https:\/\/www\.tampermonkey\.net\/script_installation\.php#url=http:\/\/127\.0\.0\.1:/u);
  } finally {
    await installer.close();
    await fs.rm(projectPath, { force: true, recursive: true });
  }
});
