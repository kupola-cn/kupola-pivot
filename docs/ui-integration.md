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
