Project: React + TypeScript client for a no-code AI agent platform. Users are small business owners with no technical background. The full specification is in docs/client-spec.md; follow it and do not invent features outside it.

Rules:
- All user-facing text goes through react-i18next (he + en). No hard-coded strings.
- Support RTL and LTR. Use CSS logical properties (margin-inline-start etc.), never left/right.
- Copy is dignified and understated: no exclamation marks, no playful language, and no technical terms (prompt, schema, embeddings, tool JSON) shown to users.
- Accessibility: WCAG 2.1 AA, keyboard navigation, labels, sufficient contrast.
- Forms: react-hook-form + zod. Server state: TanStack Query. Types generated from the backend OpenAPI schema.
- Every data view handles loading (skeletons), empty and error states.
- The existing developer panel (src/admin/App.jsx) must not be modified or exposed to business owners.
- JavaScript and TypeScript files may coexist in the client.
- For backend endpoints that do not exist yet, define the contract in src/api/contracts and mock it with MSW. Never call an endpoint that is not in the OpenAPI schema or the contracts folder.
- Before writing code for a task, outline a plan and wait for approval. Keep changes scoped to the task.
