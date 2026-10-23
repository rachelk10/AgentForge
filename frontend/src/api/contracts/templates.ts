import type { Tone } from "./wizardDraft";

export type LocalizedText = { he: string; en: string };

export type TemplateCapability = {
  id: string;
  name: LocalizedText;
};

export type Template = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  capabilities: TemplateCapability[];
  defaults: {
    businessDescription: LocalizedText;
    openingMessage: LocalizedText;
    tone: Tone;
  };
};

export const templatesPath = "/templates";
