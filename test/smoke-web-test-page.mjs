import { createWebTestServer } from '../examples/web-test-page/server.mjs';

const { server } = createWebTestServer();

await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const page = await fetchText('/');

  if (!page.includes('PIVOT Web Test Page') || !page.includes('/app.mjs')) {
    throw new Error('Expected web test page HTML to load.');
  }

  const state = await fetchJson('/api/state');

  if (!state.ok || state.data.patients.length !== 2) {
    throw new Error('Expected web test page mock state endpoint to load.');
  }

  const capabilities = await fetchJson('/api/capabilities');

  if (!capabilities.ok || capabilities.data.length !== 4 || !capabilities.html.includes('pivot-capability-browser')) {
    throw new Error('Expected web test page capabilities endpoint to render capability browser HTML.');
  }

  const command = createScheduleCommand();
  const commandPreview = await postJson('/api/command/preview', { command });

  if (!commandPreview.ok || !commandPreview.result.data.requiresConfirmation) {
    throw new Error('Expected web test page command preview to require confirmation.');
  }

  const commandSimulation = await postJson('/api/command/simulate', { command });

  if (!commandSimulation.ok || commandSimulation.result.data.simulation.expectedDurationMinutes !== 30) {
    throw new Error('Expected web test page command simulation to return dry-run data.');
  }

  const deniedCommand = await postJson('/api/command/execute', { command }, { 'x-mock-actor': 'viewer' }, 403);

  if (deniedCommand.ok !== false) {
    throw new Error('Expected web test page mock backend to reject viewer execution.');
  }

  const planPreview = await postJson('/api/plan/preview', { plan: createVisitPlan() });

  if (!planPreview.ok || !planPreview.previewHtml.includes('pivot-plan-preview') || !planPreview.graphHtml.includes('pivot-plan-graph')) {
    throw new Error('Expected web test page plan preview to return preview and graph HTML.');
  }

  const planExecution = await postJson('/api/plan/execute', { plan: createVisitPlan() });

  if (planExecution.ok || !planExecution.result.data.compensations.some((entry) => entry.steps?.length)) {
    throw new Error('Expected web test page plan execution to fail and compensate.');
  }

  const audit = await fetchJson('/api/audit');

  if (!audit.ok || !audit.html.includes('pivot-audit-viewer') || audit.data.length === 0) {
    throw new Error('Expected web test page audit endpoint to render audit viewer HTML.');
  }

  console.log('PIVOT web test page smoke test passed.');
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function fetchText(path) {
  const response = await fetch(`${baseUrl}${path}`);

  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return response.text();
}

async function fetchJson(path) {
  const response = await fetch(`${baseUrl}${path}`);

  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return response.json();
}

async function postJson(path, body, headers = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mock-actor': 'admin',
      'x-request-id': 'web-smoke',
      ...headers
    },
    body: JSON.stringify(body)
  });

  if (response.status !== expectedStatus) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }

  return response.json();
}

function createScheduleCommand() {
  return {
    protocolVersion: '0.1.0',
    id: 'cmd:web-smoke',
    intent: 'Schedule a cardiology follow-up for Ada Chen.',
    resource: 'appointment',
    action: 'create',
    capability: 'appointment.schedule',
    status: 'draft',
    risk: 'medium',
    params: {
      patientId: 'pat-001',
      department: 'Cardiology',
      startsAt: '2026-07-20T10:00:00.000Z'
    },
    metadata: {}
  };
}

function createVisitPlan() {
  return {
    id: `plan:web-smoke:${Date.now()}`,
    intent: 'Lookup patient, approve the visit, schedule it, then notify the patient.',
    nodes: [
      {
        id: 'lookup-patient',
        capability: 'patient.lookup',
        params: {
          patientId: 'pat-001'
        }
      },
      {
        id: 'approval',
        type: 'approval',
        approval: {
          title: 'Approve scheduled visit'
        }
      },
      {
        id: 'schedule-visit',
        capability: 'appointment.schedule',
        params: {
          patientId: { $from: 'lookup-patient', path: 'data.id' },
          department: 'Cardiology',
          startsAt: '2026-07-20T11:00:00.000Z'
        },
        compensate: {
          capability: 'appointment.cancel',
          params: {
            appointmentId: { $from: 'schedule-visit', path: 'data.id' },
            reason: 'Notification failed in the mock backend.'
          }
        }
      },
      {
        id: 'notify-patient',
        capability: 'notification.send',
        params: {
          patientId: { $from: 'lookup-patient', path: 'data.id' },
          appointmentId: { $from: 'schedule-visit', path: 'data.id' }
        }
      }
    ],
    edges: [
      { from: 'lookup-patient', to: 'approval' },
      { from: 'approval', to: 'schedule-visit' },
      { from: 'schedule-visit', to: 'notify-patient' }
    ],
    metadata: {}
  };
}
