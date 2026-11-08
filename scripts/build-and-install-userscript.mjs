#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_BUILD_SCRIPT = 'build';
const DEFAULT_TIMEOUT_MS = 120_000;
const LOOPBACK_HOST = '127.0.0.1';
const TAMPERMONKEY_INSTALL_PAGE = 'https://www.tampermonkey.net/script_installation.php';

function requirePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function parseBuildInstallOptions(argv) {
  const options = {
    artifact: null,
    buildScript: DEFAULT_BUILD_SCRIPT,
    noOpen: false,
    skipBuild: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--no-open') {
      options.noOpen = true;
      continue;
    }
    if (argument === '--skip-build') {
      options.skipBuild = true;
      continue;
    }
    for (const [flag, key] of [
      ['--artifact', 'artifact'],
      ['--build-script', 'buildScript'],
      ['--timeout-ms', 'timeoutMs'],
    ]) {
      if (argument === flag || argument?.startsWith(`${flag}=`)) {
        const value = argument === flag ? argv[index + 1] : argument.slice(flag.length + 1);
        if (value == null || value.length === 0) throw new Error(`${flag} requires a value.`);
        if (argument === flag) index += 1;
        options[key] = key === 'timeoutMs'
          ? requirePositiveInteger(value, '--timeout-ms')
          : value;
        break;
      }
    }
    if (
      argument !== '--artifact'
      && argument !== '--build-script'
      && argument !== '--timeout-ms'
      && !argument?.startsWith('--artifact=')
      && !argument?.startsWith('--build-script=')
      && !argument?.startsWith('--timeout-ms=')
    ) {
      throw new Error(`Unknown build-install argument: ${argument ?? ''}`);
    }
  }
  return options;
}

async function listFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function isWithinDirectory(directoryPath, candidatePath) {
  const relative = path.relative(directoryPath, candidatePath);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export async function discoverUserscriptArtifact(projectPath, explicitArtifact = null) {
  const canonicalProjectPath = await fs.realpath(projectPath);
  if (explicitArtifact != null) {
    const candidatePath = await fs.realpath(path.resolve(canonicalProjectPath, explicitArtifact));
    if (!isWithinDirectory(canonicalProjectPath, candidatePath)) {
      throw new Error('The userscript artifact must remain inside the project directory.');
    }
    if (!candidatePath.endsWith('.user.js')) {
      throw new Error('The userscript artifact must end with .user.js.');
    }
    return candidatePath;
  }
  const distPath = path.join(canonicalProjectPath, 'dist');
  const artifacts = (await listFiles(distPath)).filter((filePath) => filePath.endsWith('.user.js'));
  if (artifacts.length !== 1) {
    throw new Error(`Expected exactly one dist/*.user.js artifact, found ${String(artifacts.length)}.`);
  }
  return artifacts[0];
}

export async function validateUserscriptArtifact(artifactPath) {
  const source = await fs.readFile(artifactPath, 'utf8');
  const metadataEnd = source.indexOf('// ==/UserScript==');
  if (!source.startsWith('// ==UserScript==') || metadataEnd < 0) {
    throw new Error('The build artifact does not contain a userscript metadata block.');
  }
  const metadata = source.slice(0, metadataEnd);
  const name = /^\/\/\s+@name\s+(.+)$/mu.exec(metadata)?.[1]?.trim();
  const version = /^\/\/\s+@version\s+(.+)$/mu.exec(metadata)?.[1]?.trim();
  if (!name || !version) {
    throw new Error('The userscript metadata must contain non-empty @name and @version values.');
  }
  return { name, source, version };
}

export async function startUserscriptInstallServer(artifactPath, source) {
  const token = randomBytes(18).toString('hex');
  const route = `/install/${token}/${encodeURIComponent(path.basename(artifactPath))}`;
  let settleFetch;
  let rejectFetch;
  const fetched = new Promise((resolve, reject) => {
    settleFetch = resolve;
    rejectFetch = reject;
  });
  const server = http.createServer((request, response) => {
    if (request.url !== route || (request.method !== 'GET' && request.method !== 'HEAD')) {
      response.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found.');
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Disposition': `inline; filename="${path.basename(artifactPath).replaceAll('"', '')}"`,
      'Content-Length': Buffer.byteLength(source),
      'Content-Type': 'text/javascript; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : source, () => {
      if (request.method === 'GET') settleFetch();
    });
  });
  server.once('error', rejectFetch);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK_HOST, resolve);
  });
  const address = server.address();
  if (address == null || typeof address === 'string') {
    server.close();
    throw new Error('Unable to resolve the loopback userscript installer address.');
  }
  const localUrl = `http://${LOOPBACK_HOST}:${String(address.port)}${route}`;
  const installerUrl = new URL(TAMPERMONKEY_INSTALL_PAGE);
  installerUrl.hash = `url=${localUrl}`;
  return {
    close: async () => await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections?.();
    }),
    fetched,
    installerUrl: installerUrl.href,
    localUrl,
  };
}

function runBuild(projectPath, buildScript) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', buildScript], {
      cwd: projectPath,
      env: process.env,
      shell: false,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`npm run ${buildScript} failed (code=${String(code)}, signal=${String(signal)}).`));
    });
  });
}

function openUrl(url) {
  const command = process.platform === 'darwin'
    ? { executable: 'open', args: [url] }
    : process.platform === 'win32'
      ? { executable: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', url] }
      : { executable: 'xdg-open', args: [url] };
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      detached: true,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function waitForFetch(fetched, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Tampermonkey did not fetch the userscript within ${timeoutMs.toLocaleString()} ms.`));
    }, timeoutMs);
    fetched.then(() => {
      clearTimeout(timeout);
      resolve();
    }, (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export async function buildAndOpenUserscriptInstaller(projectPath, options) {
  const canonicalProjectPath = await fs.realpath(projectPath);
  if (!options.skipBuild) await runBuild(canonicalProjectPath, options.buildScript);
  const artifactPath = await discoverUserscriptArtifact(canonicalProjectPath, options.artifact);
  const artifact = await validateUserscriptArtifact(artifactPath);
  const installer = await startUserscriptInstallServer(artifactPath, artifact.source);
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    void installer.close().catch(() => undefined);
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    console.log(`Userscript artifact: ${artifact.name} ${artifact.version}`);
    console.log(`Artifact path: ${artifactPath}`);
    console.log(`Loopback URL: ${installer.localUrl}`);
    console.log(`Tampermonkey installer: ${installer.installerUrl}`);
    if (!options.noOpen) await openUrl(installer.installerUrl);
    else console.log('Browser opening disabled; open the Tampermonkey installer URL manually.');
    await waitForFetch(installer.fetched, options.timeoutMs);
    if (interrupted) throw new Error('Userscript installation was interrupted.');
    console.log('Tampermonkey fetched the built userscript. Confirm Install/Update in Tampermonkey if prompted.');
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    await installer.close().catch(() => undefined);
  }
}

async function main() {
  const options = parseBuildInstallOptions(process.argv.slice(2));
  await buildAndOpenUserscriptInstaller(process.cwd(), options);
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
