import { useTranslation } from "react-i18next";

export function useLocalize() {
  const { i18n } = useTranslation();
  return (text: Record<string, string> | null | undefined): string => {
    if (!text) return "";
    const language = i18n.language.startsWith("he") ? "he" : "en";
    return text[language] ?? text.en ?? Object.values(text)[0] ?? "";
  };
}
