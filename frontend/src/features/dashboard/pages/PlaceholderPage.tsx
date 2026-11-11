import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function PlaceholderPage({ page }: { page: string }) {
  const { t } = useTranslation();
  return (
    <section className="dashboard-page">
      <h1>{t(`dashboard.nav.${page}`)}</h1>
      <div className="dashboard-empty">
        <h2>{t("dashboard.comingSoon.title")}</h2>
        <p>{t("dashboard.comingSoon.description")}</p>
        <Link to="/dashboard">{t("dashboard.comingSoon.overviewLink")}</Link>
      </div>
    </section>
  );
}
