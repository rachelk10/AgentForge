export const industryOptions = [
  "retail",
  "professional",
  "health",
  "hospitality",
  "education",
  "realEstate",
  "technology",
  "other",
] as const;
export type Industry = (typeof industryOptions)[number];

export const toneOptions = ["formal", "friendly", "professional"] as const;
export type Tone = (typeof toneOptions)[number];

export const conversationLanguages = ["he", "en"] as const;
export type ConversationLanguage = (typeof conversationLanguages)[number];

export type BusinessData = {
  businessName: string;
  industry: Industry | "";
  industryOther: string;
  businessDescription: string;
  agentName: string;
  openingMessage: string;
  language: ConversationLanguage;
  tone: Tone;
  guidelines: string;
};

export const wizardStepCount = 5;

export type WizardDraft = {
  templateId: string | null;
  currentStep: number;
  business: BusinessData;
};

export const wizardDraftPath = "/account/wizard-draft";

export function createEmptyBusiness(language: ConversationLanguage): BusinessData {
  return {
    businessName: "",
    industry: "",
    industryOther: "",
    businessDescription: "",
    agentName: "",
    openingMessage: "",
    language,
    tone: "friendly",
    guidelines: "",
  };
}
