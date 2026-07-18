/* global document */

const elements = {
  actorSelect: document.querySelector('#actorSelect'),
  lastAction: document.querySelector('#lastAction'),
  lastStatus: document.querySelector('#lastStatus'),
  lastOk: document.querySelector('#lastOk'),
  stateView: document.querySelector('#stateView'),
  capabilityHtml: document.querySelector('#capabilityHtml'),
  runtimeHtml: document.querySelector('#runtimeHtml'),
  graphHtml: document.querySelector('#graphHtml'),
  jsonView: document.querySelector('#jsonView'),
  auditHtml: document.querySelector('#auditHtml')
};

const actions = {
  loadCapabilities,
  previewCommand,
  simulateCommand,
  executeCommand,
  previewPlan,
  executePlan,
  loadAudit,
  reset
};

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', async () => {
    const actionName = button.dataset.action;
    const action = actions[actionName];

    if (!action) {
      return;
    }

    await runAction(actionName, action);
  });
});

await runAction('initial load', async () => {
  await loadState();
  await loadCapabilities();
  await loadAudit();
});

async function runAction(label, action) {
  elements.lastAction.textContent = label;
  elements.lastStatus.textContent = 'running';
  elements.lastOk.textContent = '-';

  try {
    const response = await action();
    updateStatus(response);
    return response;
  } catch (error) {
    elements.lastStatus.textContent = 'error';
    elements.lastOk.textContent = 'false';
    elements.jsonView.textContent = JSON.stringify({
      message: error instanceof Error ? error.message : String(error)
    }, null, 2);
    return null;
  }
}

async function loadCapabilities() {
  const response = await request('/api/capabilities');
  elements.capabilityHtml.innerHTML = response.body.html ?? '';
  elements.jsonView.textContent = JSON.stringify(response.body.data, null, 2);
  return response;
}

async function previewCommand() {
  const response = await post('/api/command/preview', {
    command: createScheduleCommand()
  });

  showRuntimeResponse(response);
  return response;
}

async function simulateCommand() {
  const response = await post('/api/command/simulate', {
    command: createScheduleCommand()
  });

  showRuntimeResponse(response);
  return response;
}

async function executeCommand() {
  const response = await post('/api/command/execute', {
    command: createScheduleCommand()
  });

  showRuntimeResponse(response);
  await loadState();
  await loadAudit();
  return response;
}

async function previewPlan() {
  const response = await post('/api/plan/preview', {
    plan: createVisitPlan()
  });

  showPlanResponse(response);
  return response;
}

async function executePlan() {
  const response = await post('/api/plan/execute', {
    plan: createVisitPlan()
  });

  showPlanResponse(response);
  await loadState();
  await loadAudit();
  return response;
}

async function loadAudit() {
  const response = await request('/api/audit');
  elements.auditHtml.innerHTML = response.body.html ?? '';
  elements.jsonView.textContent = JSON.stringify(response.body.data, null, 2);
  return response;
}

async function reset() {
  const response = await post('/api/reset', {});
  elements.runtimeHtml.innerHTML = '<div class="empty-state">Mock data reset.</div>';
  elements.graphHtml.innerHTML = '';
  await loadState();
  return response;
}

async function loadState() {
  const response = await request('/api/state');
  const state = response.body.data;

  elements.stateView.innerHTML = [
    renderGroup('Patients', state.patients.map((patient) => `${patient.id} - ${patient.name} (${patient.risk})`)),
    renderGroup('Appointments', state.appointments.map((appointment) => `${appointment.id} - ${appointment.patientId} - ${appointment.department} - ${appointment.status}`)),
    renderGroup('Messages', state.messages.map((message) => `${message.patientId} - ${message.appointmentId} - ${message.status}`))
  ].join('');

  return response;
}

function showRuntimeResponse(response) {
  elements.runtimeHtml.innerHTML = response.body.html ?? response.body.resultHtml ?? '';
  elements.graphHtml.innerHTML = '';
  elements.jsonView.textContent = JSON.stringify(response.body.result ?? response.body, null, 2);
}

function showPlanResponse(response) {
  elements.runtimeHtml.innerHTML = response.body.previewHtml ?? response.body.html ?? '';
  elements.graphHtml.innerHTML = response.body.graphHtml ?? '';
  elements.jsonView.textContent = JSON.stringify(response.body.result ?? response.body, null, 2);
}

function updateStatus(response) {
  elements.lastStatus.textContent = String(response.status);
  elements.lastOk.textContent = String(response.body?.ok ?? response.ok);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-mock-actor': elements.actorSelect.value,
      'x-request-id': `web-${Date.now()}`,
      ...(options.headers ?? {})
    }
  });
  const body = await response.json();
  return {
    status: response.status,
    ok: response.ok,
    body
  };
}

function post(path, body) {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

function createScheduleCommand() {
  return {
    protocolVersion: '0.1.0',
    id: `cmd:web:${Date.now()}`,
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
    metadata: {
      source: 'web-test-page'
    }
  };
}

function createVisitPlan() {
  return {
    id: `plan:web:${Date.now()}`,
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
          title: 'Approve scheduled visit',
          description: 'The mock backend will approve this gate automatically.'
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
    metadata: {
      source: 'web-test-page'
    }
  };
}

function renderGroup(title, items) {
  const content = items.length === 0
    ? '<li class="muted">No records</li>'
    : items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  return `<section class="record-group"><h3>${escapeHtml(title)}</h3><ul>${content}</ul></section>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
