import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as core from '@kupola/pivot';
import * as orchestrator from '@kupola/pivot-orchestrator';
import * as policy from '@kupola/pivot-policy';
import * as protocol from '@kupola/pivot-protocol';
import * as ui from '@kupola/pivot-ui';

const rootDir = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

await assertPackageShape('packages/core/package.json', ['.', './css']);
await assertPackageShape('packages/orchestrator/package.json', ['.']);
await assertPackageShape('packages/policy/package.json', ['.']);
await assertPackageShape('packages/protocol/package.json', ['.']);
await assertPackageShape('packages/ui/package.json', ['.', './css']);

assertExportFunctions(protocol, [
  'createCommand',
  'createCapability',
  'createCapabilityManifest',
  'createResult',
  'createAuditEvent',
  'createValidationResult',
  'validateCommand',
  'validateParams',
  'redactParams',
  'validateCapability',
  'validateCapabilityManifest'
]);

assertExportFunctions(policy, [
  'allow',
  'deny',
  'confirm',
  'escalate',
  'createPolicyPipeline',
  'createPermissionPolicy',
  'createRiskPolicy',
  'createSensitiveResourcePolicy',
  'mapHttpStatusToPolicy'
]);

assertExportFunctions(orchestrator, [
  'createPlan',
  'addNode',
  'addEdge',
  'validatePlan',
  'getExecutionOrder',
  'getExecutionLayers',
  'evaluatePlanEdgeCondition'
]);

assertExportFunctions(ui, [
  'createTrustedUIAdapter',
  'renderTimelineToHTML',
  'renderResultToHTML',
  'renderTimelineDetailToHTML',
  'renderAuditViewerToHTML',
  'renderCapabilityBrowserToHTML',
  'renderPlanPreviewToHTML',
  'renderPlanGraphToHTML',
  'mountTimeline',
  'mountResult',
  'mountTimelineDetail',
  'mountAuditViewer',
  'mountCapabilityBrowser',
  'mountPlanPreview',
  'mountPlanGraph'
]);

assertExportFunctions(core, [
  'createPivotRuntime',
  'createCapabilityRegistry',
  'parseStructuredCommandOutput',
  'parseStructuredPlanOutput',
  'createCommand',
  'createCapability',
  'createPlan',
  'renderPlanPreviewToHTML'
]);

const runtime = core.createPivotRuntime();

if (typeof runtime.previewCommand !== 'function' || typeof runtime.simulateCommand !== 'function') {
  throw new Error('Expected runtime to expose previewCommand and simulateCommand.');
}

if (typeof runtime.executeCommand !== 'function' || typeof runtime.executePlan !== 'function') {
  throw new Error('Expected runtime to expose execution methods.');
}

if (typeof runtime.getAuditEvents !== 'function' || typeof runtime.registerCapability !== 'function') {
  throw new Error('Expected runtime to expose registry and audit helpers.');
}

console.log('PIVOT compatibility smoke test passed.');

async function assertPackageShape(relativePath, expectedExportKeys) {
  const text = await readFile(join(rootDir, relativePath), 'utf8');
  const pkg = JSON.parse(text);
  const exportKeys = Object.keys(pkg.exports ?? {}).sort();
  const expectedKeys = [...expectedExportKeys].sort();

  if (exportKeys.length !== expectedKeys.length || !expectedKeys.every((key, index) => key === exportKeys[index])) {
    throw new Error(`${relativePath} exports mismatch: expected ${expectedKeys.join(', ')}, got ${exportKeys.join(', ')}`);
  }

  if (!pkg.exports?.['.']?.import || !pkg.exports?.['.']?.types) {
    throw new Error(`${relativePath} is missing the main export entry.`);
  }

  if (expectedExportKeys.includes('./css') && !pkg.exports?.['./css']) {
    throw new Error(`${relativePath} is missing the CSS subpath export.`);
  }
}

function assertExportFunctions(namespace, names) {
  for (const name of names) {
    if (typeof namespace[name] !== 'function') {
      throw new Error(`Expected ${name} to be exported as a function.`);
    }
  }
}
