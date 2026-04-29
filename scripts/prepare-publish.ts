import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type DependencyMap = Record<string, string>;

type RootPackageJson = {
  workspaces?: {
    catalog?: DependencyMap;
  };
};

type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
  peerDependencies?: DependencyMap;
  optionalDependencies?: DependencyMap;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const packagesDir = join(repoRoot, 'packages');
const publishRoot = join(repoRoot, '.publish');
const publishPackagesDir = join(publishRoot, 'packages');
const versionOverride = process.env.ROOST_PUBLISH_VERSION?.trim();
const dependencySections = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

async function main() {
  const rootPackage = await readJson<RootPackageJson>(join(repoRoot, 'package.json'));
  const catalog = rootPackage.workspaces?.catalog ?? {};
  const workspaceVersions = await collectWorkspaceVersions(versionOverride);

  await rm(publishRoot, { recursive: true, force: true });
  await mkdir(publishPackagesDir, { recursive: true });

  const packageDirs = await readdir(packagesDir, { withFileTypes: true });
  for (const entry of packageDirs) {
    if (!entry.isDirectory()) continue;

    const sourceDir = join(packagesDir, entry.name);
    const targetDir = join(publishPackagesDir, entry.name);

    await cp(sourceDir, targetDir, { recursive: true });

    const packageJsonPath = join(sourceDir, 'package.json');
    const packageJson = await readJson<PackageJson>(packageJsonPath);
    const rewritten = rewritePackageJson(packageJson, workspaceVersions, catalog, versionOverride);

    validatePackageJson(rewritten, packageJsonPath);
    await writeFile(join(targetDir, 'package.json'), JSON.stringify(rewritten, null, 2) + '\n');
  }

  console.log(`Prepared publishable packages in ${publishPackagesDir}`);
}

async function collectWorkspaceVersions(versionOverride?: string): Promise<Map<string, string>> {
  const versions = new Map<string, string>();
  const packageDirs = await readdir(packagesDir, { withFileTypes: true });

  for (const entry of packageDirs) {
    if (!entry.isDirectory()) continue;

    const packageJson = await readJson<PackageJson>(join(packagesDir, entry.name, 'package.json'));
    if (!packageJson.name || !packageJson.version) {
      throw new Error(`Missing name/version in packages/${entry.name}/package.json`);
    }

    versions.set(packageJson.name, versionOverride ?? packageJson.version);
  }

  return versions;
}

function rewritePackageJson(
  packageJson: PackageJson,
  workspaceVersions: Map<string, string>,
  catalog: DependencyMap,
  versionOverride?: string,
): PackageJson {
  const rewritten: PackageJson = { ...packageJson };
  if (versionOverride) {
    rewritten.version = versionOverride;
  }

  for (const section of dependencySections) {
    const deps = packageJson[section];
    if (!deps) continue;

    rewritten[section] = Object.fromEntries(
      Object.entries(deps).map(([name, spec]) => [
        name,
        resolveDependencySpec(name, spec, workspaceVersions, catalog),
      ]),
    );
  }

  return rewritten;
}

function resolveDependencySpec(
  dependencyName: string,
  spec: string,
  workspaceVersions: Map<string, string>,
  catalog: DependencyMap,
): string {
  if (spec.startsWith('workspace:')) {
    const workspaceVersion = workspaceVersions.get(dependencyName);
    if (!workspaceVersion) {
      throw new Error(`Unknown workspace dependency "${dependencyName}"`);
    }

    const hint = spec.slice('workspace:'.length);
    if (hint === '' || hint === '*') return workspaceVersion;
    if (hint === '^') return `^${workspaceVersion}`;
    if (hint === '~') return `~${workspaceVersion}`;
    return hint;
  }

  if (spec.startsWith('catalog:')) {
    const resolved = catalog[dependencyName];
    if (!resolved) {
      throw new Error(`Missing catalog version for "${dependencyName}"`);
    }
    return resolved;
  }

  return spec;
}

function validatePackageJson(packageJson: PackageJson, sourcePath: string) {
  for (const section of dependencySections) {
    const deps = packageJson[section];
    if (!deps) continue;

    for (const [name, spec] of Object.entries(deps)) {
      if (spec.startsWith('workspace:') || spec.startsWith('catalog:')) {
        throw new Error(`Unresolved dependency spec in ${sourcePath}: ${section}.${name}=${spec}`);
      }
    }
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

await main();
