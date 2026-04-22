import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type PackageJson = {
  name?: string;
  version?: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const publishPackagesDir = join(repoRoot, '.publish', 'packages');
const registry = process.env.NPM_CONFIG_REGISTRY ?? 'https://registry.npmjs.org/';
const useProvenance = shouldUseProvenance(registry);

async function main() {
  const entries = await readdir(publishPackagesDir, { withFileTypes: true });
  let publishedCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const packageDir = join(publishPackagesDir, entry.name);
    const packageJson = await readJson<PackageJson>(join(packageDir, 'package.json'));
    if (!packageJson.name || !packageJson.version) {
      throw new Error(`Missing name/version in ${packageDir}/package.json`);
    }

    if (isAlreadyPublished(packageJson.name, packageJson.version)) {
      console.log(`Skipping ${packageJson.name}@${packageJson.version}; already published.`);
      continue;
    }

    console.log(`Publishing ${packageJson.name}@${packageJson.version}...`);
    run(
      'npm',
      ['publish', '--access', 'public'],
      packageDir,
      {
        ...process.env,
        NPM_CONFIG_PROVENANCE: process.env.NPM_CONFIG_PROVENANCE ?? (useProvenance ? 'true' : 'false'),
      },
    );
    publishedCount += 1;
  }

  if (publishedCount === 0) {
    console.log('No unpublished package versions found.');
  }
}

function isAlreadyPublished(name: string, version: string): boolean {
  const result = spawnSync(
    'npm',
    ['view', `${name}@${version}`, 'version', '--registry', registry],
    {
      stdio: 'ignore',
      env: process.env,
    },
  );

  return result.status === 0;
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function shouldUseProvenance(registryUrl: string): boolean {
  const normalized = registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`;
  return normalized === 'https://registry.npmjs.org/';
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

await main();
