---
name: "Frontend Engineering Guidelines"
description: "Use when modifying the React + TypeScript business-owner client under frontend/: wizard, dashboard, widget, chat page, i18n, API contracts, MSW mocks, or frontend tests."
applyTo: "frontend/**"
---
# Frontend Engineering Guidelines

The full product scope is in `Client-side-specification.txt` (also `docs/client-spec.md`); the staged plan is in `Stage Guide.txt`. Follow them and do not invent features outside the specification. Section numbers below refer to the specification.

## Progress

- Stages 0-5 are complete: infrastructure, registration and login, starting point, wizard shell and Steps 1-5, including Information, Capabilities, Test, Appearance, and Publishing. Stages 0-3 have been manually verified; preserve their behavior and add focused verification for Stages 4-5 before extending the client.
- Remaining stages, in order: 6 widget and standalone chat page, 7 dashboard shell/overview/conversations, 8 leads/meetings/pending requests, 9 My agent and pausing, 10 polish and end-to-end testing. Do not start a later stage's work early.

## Workflow

- Before writing code for a task, outline a plan and wait for approval. Keep changes scoped to the task, and at the end list every deviation from the specification and every assumption made.
- Commands run from `frontend/`: `npm run dev`, `npm test` (Vitest), `npm run build` (type check + build), `npm run generate:api` (regenerates `src/api/generated/openapi.ts` from the running backend).
- Add or update focused Vitest + Testing Library tests for behavior changes (forms, validation, states, i18n/direction, catalog-driven capability forms, locked capabilities, test chat, contrast warnings, publishing success and failure), then run the relevant file and the full suite.

## Product and copy

- Audience: small business owners with no technical background. One decision per screen, with a short explanation and an example.
- Business language only. Never show prompt, schema, embeddings, tool JSON, identifiers, or generated agent instructions. Map concepts per section 7: tool -> capability, skill -> ready-made behavior, documents/RAG -> business information, handoff -> request pending handling.
- Copy is dignified and understated: no exclamation marks, no playful language; errors are clear and matter-of-fact.
- Do not hard-code capabilities, skills, or templates in the UI; render them from the catalog/contract data.
- For the capabilities step, adding a catalog item must be sufficient for it to appear in the UI. Build configuration forms from the catalog field definitions and prevent locked capabilities from being enabled.
- Test conversations must be sent with the test flag and must not trigger notifications or usage metrics. Publishing must expose embed code and the standalone chat link only after a successful publish response.

## Internationalization and RTL

- All user-facing text goes through `react-i18next`, with both `he` and `en` entries in `frontend/src/shared/locales/`. No hard-coded strings, including aria-labels, placeholders, and validation messages.
- Support RTL and LTR (`dir` is set on `<html>`). Use CSS logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`), never `left`/`right`. Format dates and numbers by active language.

## Accessibility

- WCAG 2.1 AA: semantic elements, visible labels, keyboard navigation, focus management in dialogs, screen-reader labels, and sufficient contrast. Build on the shared accessible components in `frontend/src/shared/ui`.

## Data, forms, and API

- Server state uses TanStack Query; forms use `react-hook-form` with `zod`. Types come from `frontend/src/api/generated/openapi.ts`; do not hand-write types for existing endpoints.
- Use the auth-aware fetch wrapper in `frontend/src/shared/api/client.ts`. Keep token storage behind `frontend/src/shared/auth/authStorage.ts`.
- For backend endpoints that do not exist yet, define the contract in `frontend/src/api/contracts/` and mock it with MSW (`frontend/src/shared/api/mocks/`). Never call an endpoint that is in neither the OpenAPI schema nor the contracts folder. Keep a record of mocked contracts so they can be replaced later.
- Every data view handles loading (skeletons, not full-screen spinners), empty (short explanation plus one clear action), and error (message with retry, no data loss) states. Destructive actions require explicit confirmation.
- Sanitize any rendered message content against XSS; restrict file type and size on uploads.

## Boundaries

- The developer panel `frontend/src/admin/App.jsx` must not be modified or exposed to business owners; it lives on the separate admin-only `/admin` route. JavaScript and TypeScript files may coexist, but write new code in TypeScript.
- The widget (Stage 6) is a separate lightweight package that injects an isolated iframe (target up to 50KB gzipped) and uses a public key, never the owner's auth.
- Leave room in the design for plan-locked capabilities and multiple agents per account, without building payment or multi-agent features.
