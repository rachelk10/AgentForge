import type { Template } from "../../api/contracts/templates";
import type { BusinessData, WizardDraft } from "../../api/contracts/wizardDraft";
import { createEmptyBusiness } from "../../api/contracts/wizardDraft";
import { pickText } from "./localized";

function templateValues(template: Template, language: BusinessData["language"]) {
  return {
    businessDescription: pickText(template.defaults.businessDescription, language),
    openingMessage: pickText(template.defaults.openingMessage, language),
    tone: template.defaults.tone,
  };
}

// A template fills a field only when it is empty or still holds the previous template's value,
// so anything the user typed is preserved.
export function applyTemplate(
  existing: WizardDraft | null,
  template: Template | null,
  templates: Template[],
  language: BusinessData["language"],
): WizardDraft {
  const business = existing?.business ?? createEmptyBusiness(language);
  if (!template) {
    return { templateId: null, currentStep: existing?.currentStep ?? 1, business };
  }

  const previous = templates.find((item) => item.id === existing?.templateId);
  const previousValues = previous ? templateValues(previous, business.language) : null;
  const next = templateValues(template, business.language);

  const merged: BusinessData = { ...business };
  if (!existing || !business.businessDescription || business.businessDescription === previousValues?.businessDescription) {
    merged.businessDescription = next.businessDescription;
  }
  if (!existing || !business.openingMessage || business.openingMessage === previousValues?.openingMessage) {
    merged.openingMessage = next.openingMessage;
  }
  const toneUntouched = previousValues
    ? business.tone === previousValues.tone
    : !business.businessDescription && !business.openingMessage;
  if (!existing || toneUntouched) {
    merged.tone = next.tone;
  }
  return { templateId: template.id, currentStep: 1, business: merged };
}
