import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const packageVersionPaths = [
  { name: 'kupola-pivot-workspace', path: 'package.json' },
  { name: '@kupola/pivot', path: 'packages/core/package.json' },
  { name: '@kupola/pivot-orchestrator', path: 'packages/orchestrator/package.json' },
  { name: '@kupola/pivot-policy', path: 'packages/policy/package.json' },
  { name: '@kupola/pivot-protocol', path: 'packages/protocol/package.json' },
  { name: '@kupola/pivot-ui', path: 'packages/ui/package.json' }
];

const workspaceDependencyNames = [
  '@kupola/pivot-orchestrator',
  '@kupola/pivot-policy',
  '@kupola/pivot-protocol',
  '@kupola/pivot-ui'
];

async function readJson(relativePath) {
  const text = await readFile(join(rootDir, relativePath), 'utf8');
  return JSON.parse(text);
}

function fail(message) {
  throw new Error(message);
}

function assertVersion(label, actual, expected) {
  if (actual !== expected) {
    fail(`${label} version mismatch: expected ${expected}, got ${actual}`);
  }
}

function assertLockEntry(lock, relativePath, expectedVersion) {
  const entry = lock?.packages?.[relativePath];

  if (!entry) {
    fail(`package-lock entry missing for ${relativePath || 'workspace root'}`);
  }

  assertVersion(`package-lock:${relativePath || 'root'}`, entry.version, expectedVersion);
}

async function checkVersions() {
  const rootPackage = await readJson('package.json');
  const lockFile = await readJson('package-lock.json');
  const expectedVersion = rootPackage.version;

  assertVersion('workspace root', rootPackage.version, expectedVersion);
  assertVersion('package-lock root', lockFile.version, expectedVersion);
  assertLockEntry(lockFile, '', expectedVersion);

  for (const { name, path } of packageVersionPaths.slice(1)) {
    const pkg = await readJson(path);
    assertVersion(name, pkg.version, expectedVersion);
    assertLockEntry(lockFile, path.replace(/\\/g, '/').replace(/\/package\.json$/, ''), expectedVersion);
  }

  const corePackage = await readJson('packages/core/package.json');
  for (const dependencyName of workspaceDependencyNames) {
    assertVersion(`core dependency ${dependencyName}`, corePackage.dependencies?.[dependencyName], expectedVersion);
  }

  const coreLockEntry = lockFile?.packages?.['packages/core'];
  for (const dependencyName of workspaceDependencyNames) {
    assertVersion(
      `package-lock core dependency ${dependencyName}`,
      coreLockEntry?.dependencies?.[dependencyName],
      expectedVersion
    );
  }

  const changelog = await readFile(join(rootDir, 'CHANGELOG.md'), 'utf8');
  const changelogMatch = changelog.match(/^##\s+([0-9]+\.[0-9]+\.[0-9]+)\s+-/m);

  if (!changelogMatch) {
    fail('CHANGELOG.md is missing a top release heading.');
  }

  assertVersion('changelog', changelogMatch[1], expectedVersion);

  return expectedVersion;
}

async function main() {
  const mode = process.argv[2] ?? 'check';

  if (mode === 'check') {
    const version = await checkVersions();
    console.log(`Release checks passed for ${version}.`);
    return;
  }

  if (mode === 'publish') {
    const version = await checkVersions();

    const testResult = spawnSync('npm', ['test'], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false
    });

    if (testResult.status !== 0) {
      process.exit(testResult.status ?? 1);
    }

    const packResult = spawnSync('npm', ['pack', '--dry-run', '--workspaces'], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false
    });

    if (packResult.status !== 0) {
      process.exit(packResult.status ?? 1);
    }

    const publishResult = spawnSync('npm', ['publish', '--workspaces', '--access', 'public'], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false
    });

    if (publishResult.status !== 0) {
      process.exit(publishResult.status ?? 1);
    }

    console.log(`Published workspace version ${version}.`);
    return;
  }

  fail(`Unknown release mode: ${mode}`);
}

await main();
