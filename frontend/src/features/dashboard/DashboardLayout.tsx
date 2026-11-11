import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getAgents } from "../../shared/api/dashboard";
import { getToken } from "../../shared/auth/authStorage";
import { Button, Skeleton } from "../../shared/ui";
import { LanguageSwitcher } from "../shell/LanguageSwitcher";
import { ConversationsPage } from "./pages/ConversationsPage";
import { ConversationDetailPage } from "./pages/ConversationDetailPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { DashboardContextProvider } from "./context";
import "./dashboard.css";

const navigation = [
  { path: "/dashboard", key: "overview", end: true },
  { path: "/dashboard/conversations", key: "conversations", end: false },
  { path: "/dashboard/leads", key: "leads", end: false },
  { path: "/dashboard/meetings", key: "meetings", end: false },
  { path: "/dashboard/requests", key: "pendingRequests", end: false },
  { path: "/dashboard/my-agent", key: "myAgent", end: false },
  { path: "/dashboard/account", key: "account", end: false },
] as const;

export function DashboardLayout() {
  const { t } = useTranslation();
  const token = getToken();
  const agentsQuery = useQuery({
    queryKey: ["dashboard-agents", token],
    queryFn: () => getAgents(token!),
    enabled: Boolean(token),
  });

  if (agentsQuery.isPending) {
    return (
      <main className="dashboard-loading">
        <div role="status">
          <span className="dashboard-sr-only">{t("dashboard.loading")}</span>
          <Skeleton className="dashboard-loading__skeleton" />
        </div>
      </main>
    );
  }

  if (agentsQuery.isError) {
    return (
      <DashboardNotice
        title={t("dashboard.loadErrorTitle")}
        description={t("dashboard.loadError")}
        action={
          <Button onClick={() => void agentsQuery.refetch()}>{t("dashboard.retry")}</Button>
        }
      />
    );
  }

  const agent = agentsQuery.data[0];
  if (!agent) {
    return (
      <DashboardNotice
        title={t("dashboard.noAgentTitle")}
        description={t("dashboard.noAgentDescription")}
        action={<Link className="dashboard-start-link" to="/app/start">{t("dashboard.startSetup")}</Link>}
      />
    );
  }

  return (
    <DashboardContextProvider agent={agent} token={token!}>
      <div className="dashboard-shell">
        <aside className="dashboard-sidebar">
          <NavLink className="dashboard-brand" to="/dashboard">
            {t("app.title")}
          </NavLink>
          <p className="dashboard-agent-name">{agent.business_name || agent.name}</p>
          <nav aria-label={t("dashboard.navigationLabel")} className="dashboard-nav">
            {navigation.map(({ path, key, end }) => (
              <NavLink
                end={end ?? false}
                key={key}
                className={({ isActive }) =>
                  `dashboard-nav__link${isActive ? " dashboard-nav__link--active" : ""}`
                }
                to={path}
              >
                {t(`dashboard.nav.${key}`)}
              </NavLink>
            ))}
          </nav>
          <div className="dashboard-sidebar__language">
            <LanguageSwitcher />
          </div>
        </aside>
        <main className="dashboard-main">
          <Routes>
            <Route index element={<OverviewPage />} />
            <Route path="conversations" element={<ConversationsPage />} />
            <Route path="conversations/:conversationId" element={<ConversationDetailPage />} />
            <Route path="leads" element={<PlaceholderPage page="leads" />} />
            <Route path="meetings" element={<PlaceholderPage page="meetings" />} />
            <Route path="requests" element={<PlaceholderPage page="pendingRequests" />} />
            <Route path="my-agent" element={<PlaceholderPage page="myAgent" />} />
            <Route path="account" element={<PlaceholderPage page="account" />} />
            <Route path="*" element={<PlaceholderPage page="overview" />} />
          </Routes>
        </main>
      </div>
    </DashboardContextProvider>
  );
}

function DashboardNotice({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <main className="dashboard-notice">
      <section className="dashboard-notice__card" aria-live="polite">
        <h1>{title}</h1>
        <p>{description}</p>
        {action}
      </section>
    </main>
  );
}
