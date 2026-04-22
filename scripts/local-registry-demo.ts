import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { openSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';

type PackageJson = {
  name?: string;
  version?: string;
};

type LocalRegistryState = {
  appDir: string;
  logPath: string;
  npmrcPath: string;
  pid: number;
  registryUrl: string;
  version: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const registryHost = '127.0.0.1';
const registryPort = Number(process.env.ROOST_LOCAL_REGISTRY_PORT ?? '4873');
const registryUrl = `http://${registryHost}:${registryPort}/`;
const tempRoot = join(tmpdir(), 'roost-local-registry');
const verdaccioConfigPath = join(tempRoot, 'verdaccio.yaml');
const storageDir = join(tempRoot, 'storage');
const htpasswdPath = join(tempRoot, 'htpasswd');
const logPath = join(tempRoot, 'verdaccio.log');
const npmrcPath = join(tempRoot, 'npmrc');
const statePath = join(tempRoot, 'state.json');
const registryUser = 'roost-local';
const registryPassword = 'roost-password';
const registryEmail = 'roost-local@example.com';

async function main() {
  await mkdir(tempRoot, { recursive: true });

  const pendingChangesets = await listPendingChangesets();
  if (pendingChangesets.length > 0) {
    run('bun', ['run', 'version:packages'], repoRoot);
  }

  run('bun', ['install'], repoRoot);

  const version = await getWorkspaceVersion('@roostjs/cli');
  const appDir = await resolveUniqueAppDir(`roost-demo-${version.replace(/\./g, '-')}`);

  await stopExistingRegistry();
  await writeVerdaccioConfig();
  await rm(storageDir, { recursive: true, force: true });
  await rm(htpasswdPath, { force: true });
  await rm(logPath, { force: true });
  await rm(npmrcPath, { force: true });

  const pid = await startVerdaccio();
  const token = await createRegistryUser();
  await writePublishNpmrc(token);

  run('bun', ['run', 'prepare:publish'], repoRoot);
  run('bun', ['run', 'release:publish'], repoRoot, {
    ...process.env,
    NPM_CONFIG_REGISTRY: registryUrl,
    NPM_CONFIG_USERCONFIG: npmrcPath,
  });

  await mkdir(join(homedir(), 'Code'), { recursive: true });
  run(
    'bun',
    ['run', join(repoRoot, 'packages/cli/src/index.ts'), 'new', appDir.name],
    join(homedir(), 'Code'),
    {
      ...process.env,
      ROOST_VERSION: version,
    },
  );

  await writeFile(
    join(appDir.path, '.npmrc'),
    [
      'registry=https://registry.npmjs.org/',
      `@roostjs:registry=${registryUrl}`,
      '',
    ].join('\n'),
  );
  run('bun', ['install'], appDir.path);

  const state: LocalRegistryState = {
    appDir: appDir.path,
    logPath,
    npmrcPath,
    pid,
    registryUrl,
    version,
  };
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n');

  console.log(`Local registry ready at ${registryUrl}`);
  console.log(`Published Roost version ${version}`);
  console.log(`Demo app created at ${appDir.path}`);
  console.log(`Verdaccio PID ${pid}`);
  console.log(`State written to ${statePath}`);
}

async function listPendingChangesets(): Promise<string[]> {
  const entries = await readdir(join(repoRoot, '.changeset'), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map((entry) => entry.name);
}

async function getWorkspaceVersion(packageName: string): Promise<string> {
  const packageDirs = await readdir(join(repoRoot, 'packages'), { withFileTypes: true });

  for (const entry of packageDirs) {
    if (!entry.isDirectory()) continue;

    const packageJson = await readJson<PackageJson>(join(repoRoot, 'packages', entry.name, 'package.json'));
    if (packageJson.name === packageName && packageJson.version) {
      return packageJson.version;
    }
  }

  throw new Error(`Unable to find version for ${packageName}`);
}

async function resolveUniqueAppDir(baseName: string): Promise<{ name: string; path: string }> {
  const codeDir = join(homedir(), 'Code');
  await mkdir(codeDir, { recursive: true });

  let attempt = 0;
  while (attempt < 100) {
    const suffix = attempt === 0 ? '' : `-${String(attempt + 1).padStart(2, '0')}`;
    const name = `${baseName}${suffix}`;
    const path = join(codeDir, name);

    try {
      await access(path);
      attempt += 1;
    } catch {
      return { name, path };
    }
  }

  throw new Error(`Unable to find an available app directory for ${baseName}`);
}

async function stopExistingRegistry() {
  const existingPid = await readExistingRegistryPid();
  if (existingPid) {
    try {
      process.kill(existingPid, 'SIGTERM');
      await waitForExit(existingPid);
    } catch {}
  }

  stopProcessOnPort();
}

async function readExistingRegistryPid(): Promise<number | null> {
  try {
    const state = await readJson<LocalRegistryState>(statePath);
    return typeof state.pid === 'number' ? state.pid : null;
  } catch {
    return null;
  }
}

async function waitForExit(pid: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await sleep(100);
    } catch {
      return;
    }
  }
}

async function writeVerdaccioConfig() {
  await writeFile(
    verdaccioConfigPath,
    [
      `storage: ${storageDir}`,
      'auth:',
      '  htpasswd:',
      `    file: ${htpasswdPath}`,
      '    max_users: 1000',
      'uplinks:',
      '  npmjs:',
      '    url: https://registry.npmjs.org/',
      'packages:',
      "  '@roostjs/*':",
      '    access: $all',
      '    publish: $all',
      '    proxy: false',
      "  '**':",
      '    access: $all',
      '    proxy: npmjs',
      'log:',
      '  - { type: stdout, format: pretty, level: http }',
      '',
    ].join('\n'),
  );
}

async function startVerdaccio(): Promise<number> {
  const logFd = openSync(logPath, 'a');
  const child = spawn(
    'npx',
    ['verdaccio', '--config', verdaccioConfigPath, '--listen', `${registryHost}:${registryPort}`],
    {
      cwd: repoRoot,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env,
    },
  );

  child.unref();

  if (!child.pid) {
    throw new Error('Failed to start Verdaccio');
  }

  await waitForRegistry();
  return child.pid;
}

async function waitForRegistry() {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${registryUrl}-/ping`);
      if (response.ok) return;
    } catch {}

    await sleep(250);
  }

  throw new Error(`Verdaccio did not become ready. See ${logPath}`);
}

async function createRegistryUser(): Promise<string> {
  const response = await fetch(`${registryUrl}-/user/org.couchdb.user:${registryUser}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: registryUser,
      password: registryPassword,
      email: registryEmail,
      type: 'user',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Verdaccio user: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as { token?: string };
  if (!payload.token) {
    throw new Error('Verdaccio did not return an auth token');
  }

  return payload.token;
}

async function writePublishNpmrc(token: string) {
  await writeFile(
    npmrcPath,
    [
      'registry=https://registry.npmjs.org/',
      `@roostjs:registry=${registryUrl}`,
      `//${registryHost}:${registryPort}/:_authToken=${token}`,
      `//${registryHost}:${registryPort}/:always-auth=true`,
      'always-auth=true',
      '',
    ].join('\n'),
  );
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 1}`);
  }
}

function stopProcessOnPort() {
  const result = spawnSync('lsof', ['-ti', `tcp:${registryPort}`], {
    stdio: ['ignore', 'pipe', 'ignore'],
    env: process.env,
  });

  if (result.status !== 0 || !result.stdout.length) return;

  for (const pid of result.stdout.toString('utf8').trim().split('\n')) {
    if (!pid) continue;
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {}
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
