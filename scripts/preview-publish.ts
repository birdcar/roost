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

async function main() {
  const entries = await readdir(publishPackagesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const packageDir = join(publishPackagesDir, entry.name);
    const packageJson = await readJson<PackageJson>(join(packageDir, 'package.json'));
    if (!packageJson.name || !packageJson.version) {
      throw new Error(`Missing name/version in ${packageDir}/package.json`);
    }

    console.log(`Packing ${packageJson.name}@${packageJson.version}...`);
    run('npm', ['pack', '--dry-run'], packageDir, process.env);
  }
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

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

await main();
