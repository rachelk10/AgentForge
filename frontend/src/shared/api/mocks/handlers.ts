import { http, HttpResponse, passthrough, type RequestHandler } from "msw";

import type { WizardDraft } from "../../../api/contracts/wizardDraft";
import { mockTemplates } from "./templates";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const DRAFT_STORAGE_KEY = "mock-wizard-draft";

function readStoredDraft(): WizardDraft | null {
  const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
  return stored ? (JSON.parse(stored) as WizardDraft) : null;
}

export const handlers: RequestHandler[] = [
  http.get(`${apiBaseUrl}/auth/me`, ({ request }) => {
    const authorization = request.headers.get("authorization");
    if (
      authorization !== "Bearer mock-google-access-token" &&
      authorization !== "Bearer stage1-test-token"
    ) {
      return passthrough();
    }
    return HttpResponse.json({
      id: authorization.includes("google") ? "mock-google-user" : "stage1-test-user",
      email: authorization.includes("google") ? "google-user@example.com" : "stage1@example.com",
      username: authorization.includes("google") ? "Google User" : "Stage One User",
      is_active: true,
      is_admin: false,
    });
  }),
  http.post(`${apiBaseUrl}/auth/google`, () =>
    HttpResponse.json({ access_token: "mock-google-access-token", token_type: "bearer" }),
  ),
  http.post(`${apiBaseUrl}/auth/password-recovery`, () =>
    HttpResponse.json({ accepted: true }, { status: 202 }),
  ),
  http.get(`${apiBaseUrl}/account/agent-state`, () =>
    HttpResponse.json(readStoredDraft() ? "draft" : "none"),
  ),
  http.get(`${apiBaseUrl}/templates`, () => HttpResponse.json(mockTemplates)),
  http.get(`${apiBaseUrl}/account/wizard-draft`, () => HttpResponse.json(readStoredDraft())),
  http.put(`${apiBaseUrl}/account/wizard-draft`, async ({ request }) => {
    const draft = (await request.json()) as WizardDraft;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return HttpResponse.json(draft);
  }),
];
