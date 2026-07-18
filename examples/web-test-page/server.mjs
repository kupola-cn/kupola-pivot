import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ActionType,
  RiskLevel,
  createPermissionPolicy,
  createPivotRuntime,
  createTrustedUIAdapter,
  renderAuditViewerToHTML,
  renderCapabilityBrowserToHTML,
  renderPlanGraphToHTML,
  renderPlanPreviewToHTML,
  renderResultToHTML,
  renderTimelineDetailToHTML
} from '@kupola/pivot';

const exampleDir = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(dirname(exampleDir));
const publicDir = join(exampleDir, 'public');

export function createWebTestServer() {
  const state = createMockState();
  const runtime = createRuntime(state);

  const server = createServer(async (request, response) => {
    try {
      await routeRequest({ request, response, runtime, state });
    } catch (error) {
      writeJson(response, 500, {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return { server, runtime, state };
}

async function routeRequest({ request, response, runtime, state }) {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/') {
    await serveFile(response, join(publicDir, 'index.html'));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/app.mjs') {
    await serveFile(response, join(publicDir, 'app.mjs'));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/styles.css') {
    await serveFile(response, join(publicDir, 'styles.css'));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/pivot.css') {
    await serveFile(response, join(rootDir, 'packages/ui/src/pivot.css'));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/state') {
    writeJson(response, 200, {
      ok: true,
      data: summarizeState(state)
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/capabilities') {
    const capabilities = runtime.listCapabilities();
    writeJson(response, 200, {
      ok: true,
      data: capabilities.map(toCapabilitySummary),
      html: renderCapabilityBrowserToHTML(capabilities, {
        title: 'Mock backend capabilities'
      })
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/audit') {
    const events = runtime.getAuditEvents();
    writeJson(response, 200, {
      ok: true,
      data: events,
      html: renderAuditViewerToHTML(events, {
        title: 'Mock backend audit'
      })
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/reset') {
    resetMockState(state);
    writeJson(response, 200, {
      ok: true,
      data: summarizeState(state),
      message: 'Mock data reset.'
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/command/preview') {
    const body = await readJsonBody(request);
    const result = await runtime.previewCommand(body.command, createExecutionContext(request, state));
    writeRuntimeResult(response, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/command/simulate') {
    const body = await readJsonBody(request);
    const result = await runtime.simulateCommand(body.command, createExecutionContext(request, state));
    writeRuntimeResult(response, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/command/execute') {
    const body = await readJsonBody(request);
    const actor = getActor(request);

    if (!actor.permissions.includes('appointment:create')) {
      writeJson(response, 403, {
        ok: false,
        message: 'Mock backend authorization rejected this command.'
      });
      return;
    }

    const result = await runtime.executeCommand(body.command, createExecutionContext(request, state));
    writeRuntimeResult(response, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/plan/preview') {
    const body = await readJsonBody(request);
    const result = await runtime.previewPlan(body.plan, createExecutionContext(request, state));
    writePlanResult(response, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/plan/execute') {
    const body = await readJsonBody(request);
    const actor = getActor(request);

    if (!actor.permissions.includes('appointment:create')) {
      writeJson(response, 403, {
        ok: false,
        message: 'Mock backend authorization rejected this plan.'
      });
      return;
    }

    const result = await runtime.executePlan(body.plan, createExecutionContext(request, state));
    writePlanResult(response, result);
    return;
  }

  writeJson(response, 404, {
    ok: false,
    message: `Route not found: ${url.pathname}`
  });
}

function createRuntime(state) {
  const runtime = createPivotRuntime({
    policies: [createPermissionPolicy()],
    ui: createTrustedUIAdapter({
      confirm: async () => true,
      approve: async () => true
    })
  });

  runtime.registerCapability({
    name: 'patient.lookup',
    resource: 'patient',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    permissions: ['patient:read'],
    paramsSchema: {
      patientId: { type: 'string', required: true }
    },
    execute: async ({ params }) => {
      const patient = state.patients.find((item) => item.id === params.patientId);

      if (!patient) {
        const error = new Error(`Patient was not found: ${params.patientId}`);
        error.status = 404;
        throw error;
      }

      return patient;
    }
  });

  runtime.registerCapability({
    name: 'appointment.schedule',
    resource: 'appointment',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['appointment:create'],
    requiresConfirmation: true,
    paramsSchema: {
      patientId: { type: 'string', required: true },
      department: { type: 'string', required: true },
      startsAt: { type: 'string', required: true }
    },
    dryRun: async ({ params }) => ({
      availability: 'available',
      expectedDurationMinutes: 30,
      impact: `Schedule ${params.department} visit for ${params.patientId}.`
    }),
    execute: async ({ params }) => {
      if (state.appointments.some((item) => item.startsAt === params.startsAt && item.status === 'scheduled')) {
        const error = new Error('The selected appointment slot is already booked.');
        error.status = 409;
        throw error;
      }

      const appointment = {
        id: `appt-${state.appointments.length + 1}`,
        patientId: params.patientId,
        department: params.department,
        startsAt: params.startsAt,
        status: 'scheduled'
      };

      state.appointments.push(appointment);
      return appointment;
    }
  });

  runtime.registerCapability({
    name: 'appointment.cancel',
    resource: 'appointment',
    action: ActionType.UPDATE,
    risk: RiskLevel.HIGH,
    permissions: ['appointment:cancel'],
    requiresConfirmation: true,
    paramsSchema: {
      appointmentId: { type: 'string', required: true },
      reason: { type: 'string', required: true }
    },
    execute: async ({ params }) => {
      const appointment = state.appointments.find((item) => item.id === params.appointmentId);

      if (!appointment) {
        const error = new Error(`Appointment was not found: ${params.appointmentId}`);
        error.status = 404;
        throw error;
      }

      appointment.status = 'cancelled';
      appointment.reason = params.reason;
      return appointment;
    }
  });

  runtime.registerCapability({
    name: 'notification.send',
    resource: 'notification',
    action: ActionType.EXECUTE,
    risk: RiskLevel.MEDIUM,
    permissions: ['notification:send'],
    paramsSchema: {
      patientId: { type: 'string', required: true },
      appointmentId: { type: 'string', required: true }
    },
    execute: async ({ params }) => {
      state.messages.push({
        patientId: params.patientId,
        appointmentId: params.appointmentId,
        status: 'failed'
      });

      const error = new Error('Mock notification service is unavailable.');
      error.status = 503;
      throw error;
    }
  });

  return runtime;
}

function createExecutionContext(request, state) {
  return {
    actor: getActor(request),
    auditMetadata: {
      requestId: request.headers['x-request-id'] ?? '',
      source: 'web-test-page'
    },
    state
  };
}

function getActor(request) {
  const actor = request.headers['x-mock-actor'];

  if (actor === 'viewer') {
    return {
      id: 'viewer',
      role: 'viewer',
      permissions: ['patient:read']
    };
  }

  return {
    id: 'admin',
    role: 'admin',
    permissions: ['patient:read', 'appointment:create', 'appointment:cancel', 'notification:send']
  };
}

function createMockState() {
  return {
    patients: [
      {
        id: 'pat-001',
        name: 'Ada Chen',
        age: 42,
        risk: 'medium'
      },
      {
        id: 'pat-002',
        name: 'Ben Smith',
        age: 57,
        risk: 'high'
      }
    ],
    appointments: [
      {
        id: 'appt-seed',
        patientId: 'pat-002',
        department: 'Cardiology',
        startsAt: '2026-07-20T09:00:00.000Z',
        status: 'scheduled'
      }
    ],
    messages: []
  };
}

function resetMockState(state) {
  const nextState = createMockState();
  state.patients = nextState.patients;
  state.appointments = nextState.appointments;
  state.messages = nextState.messages;
}

function summarizeState(state) {
  return {
    patients: state.patients,
    appointments: state.appointments,
    messages: state.messages
  };
}

function toCapabilitySummary(capability) {
  return {
    name: capability.name,
    resource: capability.resource,
    action: capability.action,
    risk: capability.risk,
    permissions: capability.permissions,
    requiresConfirmation: capability.requiresConfirmation,
    hasDryRun: typeof capability.dryRun === 'function'
  };
}

function writeRuntimeResult(response, result) {
  writeJson(response, 200, {
    ok: result.ok,
    result,
    html: renderTimelineDetailToHTML(result),
    resultHtml: renderResultToHTML(result)
  });
}

function writePlanResult(response, result) {
  writeJson(response, 200, {
    ok: result.ok,
    result,
    html: renderTimelineDetailToHTML(result),
    previewHtml: renderPlanPreviewToHTML(result),
    graphHtml: renderPlanGraphToHTML(result)
  });
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveFile(response, filePath) {
  const content = await readFile(filePath);
  response.writeHead(200, {
    'content-type': getContentType(filePath)
  });
  response.end(content);
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(body));
}

function getContentType(filePath) {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.mjs':
    case '.js':
      return 'text/javascript; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function parsePort(argv) {
  const index = argv.indexOf('--port');

  if (index >= 0) {
    const value = Number.parseInt(argv[index + 1], 10);
    return Number.isInteger(value) && value > 0 ? value : 4175;
  }

  return Number.parseInt(process.env.PORT ?? '4175', 10);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createWebTestServer();
  const port = parsePort(process.argv);

  server.listen(port, '127.0.0.1', () => {
    console.log(`PIVOT web test page: http://127.0.0.1:${port}`);
  });
}
