export function createTrustedUIAdapter(adapter = {}) {
  return {
    showMessage: adapter.showMessage ?? (() => {}),
    showResult: adapter.showResult ?? (() => {}),
    confirm: adapter.confirm ?? (async () => false),
    openAssistant: adapter.openAssistant ?? (() => {}),
    closeAssistant: adapter.closeAssistant ?? (() => {})
  };
}
