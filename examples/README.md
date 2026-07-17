# Examples

## HIS Basic

Path:

```text
examples/his-basic
```

Run:

```bash
npm run example:his-basic
```

This example demonstrates:

- role query
- organization creation
- command preview
- permission-policy blocking
- backend 403 mapping
- plan execution
- plan compensation
- explain timeline output

The example uses an in-memory fake HIS API. Real projects should call their own backend APIs from capability `execute` functions.
