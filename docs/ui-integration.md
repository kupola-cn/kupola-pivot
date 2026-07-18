# UI Integration

PIVOT keeps trusted UI logic in the host app. The runtime only asks for confirmation or approval through `createTrustedUIAdapter()`.

## Drawer / Modal Pattern

Use a Drawer for preview and a Modal for final confirmation or approval.

```js
import {
  createTrustedUIAdapter,
  renderTimelineDetailToHTML
} from '@kupola/pivot';

export function createDrawerModalUIAdapter({ drawer, modal }) {
  return createTrustedUIAdapter({
    openAssistant(options) {
      drawer.open({
        title: options?.title ?? 'PIVOT Assistant',
        content: options?.content ?? ''
      });
    },
    closeAssistant() {
      drawer.close();
    },
    async confirm(input) {
      return modal.confirm({
        title: input.command?.intent ?? 'Confirm command',
        content: renderTimelineDetailToHTML({
          ok: true,
          message: 'Command preview',
          data: { command: input.command },
          explain: { timeline: [] }
        })
      });
    },
    async approve(input) {
      return modal.confirm({
        title: input.approval?.title ?? 'Approve plan step',
        content: input.approval?.description ?? ''
      });
    }
  });
}
```

Recommended flow:

1. call `previewCommand()` or `previewPlan()`
2. render the preview into the Drawer
3. let the Modal handle confirm or approve
4. close the Drawer after the user responds

The host app owns the Drawer and Modal components. In a Kupola 2.x app, that usually means wiring this adapter to the project's Drawer and Modal primitives instead of importing UI logic into PIVOT itself.

## Kupola 2.x Component Bridge

Kupola 2.x UI primitives are a good shell for PIVOT previews and feedback.

```js
import {
  createTrustedUIAdapter,
  renderTimelineDetailToHTML
} from '@kupola/pivot';

export function createKupolaPivotBridge(kupola) {
  return createTrustedUIAdapter({
    openAssistant(options) {
      kupola.Drawer.open({
        title: options?.title ?? 'PIVOT Assistant',
        content: options?.content ?? ''
      });
    },
    closeAssistant() {
      kupola.Drawer.close();
    },
    async confirm(input) {
      return kupola.Modal.confirm({
        title: input.command?.intent ?? 'Confirm command',
        content: renderTimelineDetailToHTML({
          ok: true,
          message: input.policy?.reason ?? 'Confirm command',
          data: { command: input.command },
          explain: { timeline: [] }
        })
      });
    },
    async approve(input) {
      return kupola.Modal.confirm({
        title: input.approval?.title ?? 'Approve plan step',
        content: input.approval?.description ?? ''
      });
    }
  });
}
```

Use Kupola components for the shell:

- `Drawer` for browsing capabilities, previews, and plan graphs
- `Modal` for final confirmation and approval
- `Table` for compact capability or workflow summaries
- `Message` for status feedback after execution

The bridge keeps PIVOT responsible for validation, preview, orchestration, and audit data, while Kupola owns the surface and interaction chrome.

## Browser Mount Helpers

The framework-neutral mount helpers such as `mountResult()`, `mountTimeline()`, `mountPlanPreview()`, `mountTimelineDetail()`, `mountAuditViewer()`, `mountCapabilityBrowser()`, and `mountPlanGraph()` write the rendered HTML into an existing DOM element and mark the target with `data-pivot-mounted`.

They also set `aria-live="polite"` by default on the host element and let callers provide an `ariaLabel` for the mounted region. Empty states are rendered as status content so host apps can surface loading or empty-content feedback without adding their own wrapper logic.
