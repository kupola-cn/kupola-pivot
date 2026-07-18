# Web Test Page

This example provides a browser-based PIVOT test surface backed by a mock Node service.

It demonstrates:

- capability catalog loading
- command preview, dry-run simulation, and execution
- backend authorization rejection with a viewer actor
- plan preview and graph rendering
- approval and compensation during plan execution
- audit viewer output
- mock backend state updates

Run:

```bash
npm run example:web-test-page
```

Then open:

```text
http://127.0.0.1:4175
```

The page calls HTTP endpoints served by `examples/web-test-page/server.mjs`. The mock backend uses in-memory patient, appointment, and notification data.
