import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getDashboardOverview, updateAgentStatus } from "../../../shared/api/dashboard";
import { Button, Skeleton } from "../../../shared/ui";
import { useDashboardContext } from "../context";

const recommendationPaths: Record<string, string> = {
  completeBusiness: "/app/wizard",
  addInformation: "/app/wizard",
  enableCapability: "/app/wizard",
  publishAgent: "/app/wizard",
};

export function OverviewPage() {
  const { agent, token } = useDashboardContext();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: ["dashboard-overview", agent.id],
    queryFn: () => getDashboardOverview(token, agent.id),
  });
  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) => updateAgentStatus(token, agent.id, isActive),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview", agent.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-agents", token] }),
      ]);
    },
  });

  if (overviewQuery.isPending) {
    return (
      <section className="dashboard-page">
        <div role="status">
          <span className="dashboard-sr-only">{t("dashboard.loading")}</span>
          <Skeleton className="dashboard-page__skeleton" />
          <Skeleton className="dashboard-page__skeleton" />
        </div>
      </section>
    );
  }

  if (overviewQuery.isError) {
    return (
      <section className="dashboard-page">
        <h1>{t("dashboard.overview.title")}</h1>
        <div className="dashboard-error" role="alert">
          <p>{t("dashboard.overview.loadError")}</p>
          <Button onClick={() => void overviewQuery.refetch()}>{t("dashboard.retry")}</Button>
        </div>
      </section>
    );
  }

  const data = overviewQuery.data;
  const formatDate = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(
      new Date(`${date}T00:00:00`),
    );
  const maxCount = Math.max(1, ...data.conversations_by_day.map((day) => day.count));
  const periods = [
    { key: "7Days", values: data.counts_7_days },
    { key: "30Days", values: data.counts_30_days },
  ] as const;
  const metrics = ["conversations", "messages", "leads", "meetings"] as const;

  return (
    <section className="dashboard-page">
      <header className="dashboard-page__header">
        <div>
          <h1>{t("dashboard.overview.title")}</h1>
          <p>{t("dashboard.overview.description")}</p>
        </div>
        <div className="dashboard-status">
          <span>{data.is_active ? t("dashboard.overview.active") : t("dashboard.overview.paused")}</span>
          <button
            aria-checked={data.is_active}
            aria-label={t("dashboard.overview.statusLabel")}
            className="dashboard-switch"
            disabled={statusMutation.isPending}
            onClick={() => statusMutation.mutate(!data.is_active)}
            role="switch"
            type="button"
          >
            <span />
          </button>
        </div>
      </header>
      {statusMutation.isError && (
        <p className="dashboard-error" role="alert">{t("dashboard.overview.statusError")}</p>
      )}
      <div className="dashboard-metrics">
        {metrics.map((metric) => (
          <article className="dashboard-metric" key={metric}>
            <h2>{t(`dashboard.overview.metrics.${metric}`)}</h2>
            <div className="dashboard-metric__periods">
              {periods.map(({ key, values }) => (
                <p key={key}>
                  <span>{t(`dashboard.overview.periods.${key}`)}</span>
                  <strong>{values[metric]}</strong>
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>
      <article className="dashboard-panel">
        <h2>{t("dashboard.overview.chartTitle")}</h2>
        <p>{t("dashboard.overview.chartDescription")}</p>
        <div
          aria-label={t("dashboard.overview.chartAccessibleLabel")}
          className="dashboard-chart"
          role="img"
        >
          {data.conversations_by_day.map((day) => (
            <span
              aria-hidden="true"
              className="dashboard-chart__bar"
              key={day.date}
              style={{ blockSize: `${Math.max(3, (day.count / maxCount) * 100)}%` }}
              title={`${formatDate(day.date)}: ${day.count}`}
            />
          ))}
        </div>
        <ul className="dashboard-sr-only">
          {data.conversations_by_day.map((day) => (
            <li key={day.date}>{t("dashboard.overview.chartDay", { date: formatDate(day.date), count: day.count })}</li>
          ))}
        </ul>
        <div className="dashboard-chart__axis" aria-hidden="true">
          <span>{formatDate(data.conversations_by_day[0].date)}</span>
          <span>{formatDate(data.conversations_by_day.at(-1)!.date)}</span>
        </div>
      </article>
      <article className="dashboard-panel">
        <h2>{t("dashboard.overview.recommendationsTitle")}</h2>
        {data.recommendations.length === 0 ? (
          <p>{t("dashboard.overview.recommendationsComplete")}</p>
        ) : (
          <ul className="dashboard-recommendations">
            {data.recommendations.map((recommendation) => (
              <li key={recommendation}>
                <span>{t(`dashboard.overview.recommendations.${recommendation}`)}</span>
                <Button
                  className="dashboard-button--secondary"
                  onClick={() => navigate(recommendationPaths[recommendation] ?? "/app/wizard")}
                >
                  {t("dashboard.overview.completeRecommendation")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
