import type { Template } from "../../api/contracts/templates";
import { templatesPath } from "../../api/contracts/templates";
import type { WizardDraft } from "../../api/contracts/wizardDraft";
import { wizardDraftPath } from "../../api/contracts/wizardDraft";
import { apiFetch } from "./client";

export function getTemplates(token: string): Promise<Template[]> {
  return apiFetch<Template[]>(templatesPath, { token });
}

export function getWizardDraft(token: string): Promise<WizardDraft | null> {
  return apiFetch<WizardDraft | null>(wizardDraftPath, { token });
}

export function saveWizardDraft(token: string, draft: WizardDraft): Promise<WizardDraft> {
  return apiFetch<WizardDraft>(wizardDraftPath, {
    token,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
}
