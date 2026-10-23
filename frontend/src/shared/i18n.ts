import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import he from "./locales/he.json";

const savedLanguage = localStorage.getItem("agent-platform-language");
const initialLanguage = savedLanguage === "he" || savedLanguage === "en"
  ? savedLanguage
  : navigator.language.toLowerCase().startsWith("he")
    ? "he"
    : "en";

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
  },
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on("languageChanged", (language) => {
  localStorage.setItem("agent-platform-language", language.startsWith("he") ? "he" : "en");
});

export { i18n };
