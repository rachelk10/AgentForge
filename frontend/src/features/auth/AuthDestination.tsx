import { useTranslation } from "react-i18next";
import { Card } from "../../shared/ui";
import { LanguageSwitcher } from "../shell/LanguageSwitcher";

type Destination = "start" | "wizard" | "dashboard";

const copyKeys: Record<Destination, string> = {
  start: "app.startDestination",
  wizard: "app.wizardDestination",
  dashboard: "app.dashboardDestination",
};

export function AuthDestination({ destination }: { destination: Destination }) {
  const { t } = useTranslation();
  return (
    <main className="stage-shell">
      <Card className="stage-card">
        <header className="stage-shell__header">
          <LanguageSwitcher />
        </header>
        <h1 className="stage-shell__title">{t(`destination.${destination}`)}</h1>
        <p className="stage-shell__copy">{t(copyKeys[destination])}</p>
      </Card>
    </main>
  );
}
