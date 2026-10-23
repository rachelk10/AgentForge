import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const language = i18n.language.startsWith("he") ? "he" : "en";
  const nextLanguage = language === "he" ? "en" : "he";

  return (
    <button
      type="button"
      className="language-switch"
      aria-label={t("app.language")}
      onClick={() => void i18n.changeLanguage(nextLanguage)}
    >
      {nextLanguage === "he" ? t("app.hebrew") : t("app.english")}
    </button>
  );
}
