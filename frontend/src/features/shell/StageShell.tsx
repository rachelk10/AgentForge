import { useTranslation } from "react-i18next";
import { Card } from "../../shared/ui";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function StageShell() {
  const { t } = useTranslation();

  return (
    <main className="stage-shell">
      <Card className="stage-card">
        <header className="stage-shell__header">
          <LanguageSwitcher />
        </header>
        <h1 className="stage-shell__title">{t("app.stageTitle")}</h1>
        <p className="stage-shell__copy">{t("app.stageDescription")}</p>
      </Card>
    </main>
  );
}
