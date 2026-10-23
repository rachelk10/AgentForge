import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../shared/i18n";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const updateDocumentLanguage = (language: string) => {
      const normalizedLanguage = language.startsWith("he") ? "he" : "en";
      document.documentElement.lang = normalizedLanguage;
      document.documentElement.dir = normalizedLanguage === "he" ? "rtl" : "ltr";
      document.title = i18n.t("app.title");
    };

    updateDocumentLanguage(i18n.language);
    i18n.on("languageChanged", updateDocumentLanguage);
    return () => i18n.off("languageChanged", updateDocumentLanguage);
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
