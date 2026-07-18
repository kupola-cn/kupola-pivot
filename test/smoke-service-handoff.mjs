import {
  auditEvents,
  capabilityCatalog,
  commandExecution,
  commandPreview,
  commandSimulation,
  deniedExecution,
  planExecution,
  planPreview
} from '../examples/service-handoff/index.mjs';

if (capabilityCatalog.status !== 200 || capabilityCatalog.body.capabilities.length !== 4) {
  throw new Error('Expected service handoff capability catalog to expose four capabilities.');
}

if (commandPreview.status !== 200 || !commandPreview.body.ok) {
  throw new Error('Expected service handoff preview to succeed.');
}

if (commandSimulation.status !== 200 || commandSimulation.body.data?.simulation?.estimate?.monthlyDelta !== 24) {
  throw new Error('Expected service handoff simulation to include the dry-run estimate.');
}

if (commandExecution.status !== 200 || !commandExecution.body.ok) {
  throw new Error('Expected service handoff execution to succeed.');
}

if (deniedExecution.status !== 403 || deniedExecution.body.ok !== false) {
  throw new Error('Expected service handoff authorization to reject the viewer token.');
}

if (planPreview.status !== 200 || !planPreview.body.data?.requiresConfirmation) {
  throw new Error('Expected service handoff plan preview to require confirmation.');
}

if (planExecution.status !== 200 || planExecution.body.ok !== false) {
  throw new Error('Expected service handoff plan execution to fail after notification failure.');
}

if (!planExecution.body.data?.compensations?.[0]?.steps?.length) {
  throw new Error('Expected service handoff plan execution to record compensation steps.');
}

if (!auditEvents.some((event) => event.capability === 'approval' && event.status === 'confirmed')) {
  throw new Error('Expected service handoff audit sink to record approval confirmation.');
}

console.log('PIVOT service handoff smoke test passed.');
