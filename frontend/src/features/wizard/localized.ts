import type { LocalizedText } from "../../api/contracts/templates";

export function pickText(text: LocalizedText, language: string): string {
  return language.startsWith("he") ? text.he : text.en;
}
