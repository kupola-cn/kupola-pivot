# HIS Basic Example

This example shows how a HIS-style project can connect PIVOT without letting AI call arbitrary APIs.

Covered scenarios:

- query roles
- create a branch organization under the group
- parse AI structured command output, return validation feedback, then preview and execute
- parse AI structured plan output, preview the plan, then confirm and execute
- block unauthorized delete operations through frontend policy
- map backend `403` responses into user-facing rejection results

Run:

```bash
npm run example:his-basic
```

The example uses an in-memory fake HIS API. In a real HIS project, each capability `execute` function should call project-owned backend APIs, and the backend must still enforce authentication, authorization, data scope, and sensitive field protection.
