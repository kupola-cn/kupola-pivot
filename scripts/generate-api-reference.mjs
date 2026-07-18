import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = resolve(rootDir, 'docs');
const outputPath = resolve(docsDir, 'api-reference.md');

const sources = [
  {
    title: '@kupola/pivot-protocol',
    path: 'packages/protocol/src/index.d.ts',
    note: 'Protocol contracts for commands, capabilities, results, and audit events.'
  },
  {
    title: '@kupola/pivot-policy',
    path: 'packages/policy/src/index.d.ts',
    note: 'Policy helpers for confirmation, escalation, and denial decisions.'
  },
  {
    title: '@kupola/pivot-orchestrator',
    path: 'packages/orchestrator/src/index.d.ts',
    note: 'Plan validation, DAG execution, and edge-condition helpers.'
  },
  {
    title: '@kupola/pivot-ui',
    path: 'packages/ui/src/index.d.ts',
    note: 'Trusted UI adapter types and HTML renderers.'
  },
  {
    title: '@kupola/pivot',
    path: 'packages/core/src/index.d.ts',
    note: 'Core runtime composition layer and top-level re-exports.'
  }
];

const lines = [];
lines.push('# API Reference');
lines.push('');
lines.push('Generated from the public TypeScript declaration files.');
lines.push('');

for (const source of sources) {
  const filePath = resolve(rootDir, source.path);
  const declaration = readFileSync(filePath, 'utf8');
  const blocks = extractExportBlocks(declaration);
  const reExports = extractReExports(declaration);

  lines.push(`## ${source.title}`);
  lines.push('');
  lines.push(source.note);
  lines.push('');

  if (reExports.length > 0) {
    lines.push('### Re-exports');
    lines.push('');
    lines.push('```ts');
    lines.push(...reExports);
    lines.push('```');
    lines.push('');
  }

  for (const block of blocks) {
    lines.push(`### ${getBlockTitle(block)}`);
    lines.push('');
    lines.push('```ts');
    lines.push(block);
    lines.push('```');
    lines.push('');
  }
}

mkdirSync(docsDir, { recursive: true });
writeFileSync(outputPath, `${lines.join('\n').trimEnd()}\n`);

function extractExportBlocks(source) {
  const blocks = [];
  const lines = source.split(/\r?\n/);
  let current = [];
  let capturing = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isExport = trimmed.startsWith('export ') && !trimmed.startsWith('export *');

    if (isExport) {
      if (current.length > 0) {
        blocks.push(trimBlock(current));
      }

      current = [line];
      capturing = true;
      continue;
    }

    if (capturing) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(trimBlock(current));
  }

  return blocks.filter((block) => block.length > 0);
}

function trimBlock(blockLines) {
  const start = blockLines.findIndex((line) => line.trim() !== '');
  const end = findLastNonEmptyIndex(blockLines);
  if (start === -1 || end === -1) {
    return '';
  }

  return blockLines.slice(start, end + 1).join('\n');
}

function findLastNonEmptyIndex(lines) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim() !== '') {
      return index;
    }
  }

  return -1;
}

function getBlockTitle(block) {
  const firstLine = block.split(/\r?\n/, 1)[0].trim();
  const interfaceMatch = firstLine.match(/^export\s+interface\s+([A-Za-z0-9_]+)/);
  if (interfaceMatch) {
    return interfaceMatch[1];
  }

  const typeMatch = firstLine.match(/^export\s+type\s+([A-Za-z0-9_]+)/);
  if (typeMatch) {
    return typeMatch[1];
  }

  const functionMatch = firstLine.match(/^export\s+function\s+([A-Za-z0-9_]+)/);
  if (functionMatch) {
    return functionMatch[1];
  }

  const constMatch = firstLine.match(/^export\s+const\s+([A-Za-z0-9_]+)/);
  if (constMatch) {
    return constMatch[1];
  }

  return firstLine.replace(/^export\s+/, '');
}

function extractReExports(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('export * from'));
}
