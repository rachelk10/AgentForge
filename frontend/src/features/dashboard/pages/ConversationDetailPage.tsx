import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { getConversation } from "../../../shared/api/dashboard";
import { Button, Skeleton } from "../../../shared/ui";
import { useDashboardContext } from "../context";

export function ConversationDetailPage() {
  const { agent, token } = useDashboardContext();
  const { conversationId = "" } = useParams();
  const { t, i18n } = useTranslation();
  const conversationQuery = useQuery({
    queryKey: ["dashboard-conversation", agent.id, conversationId],
    queryFn: () => getConversation(token, agent.id, conversationId),
    enabled: Boolean(conversationId),
  });
  const formatDate = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(date),
    );

  return (
    <section className="dashboard-page">
      <Link className="dashboard-back-link" to="/dashboard/conversations">
        {t("dashboard.conversations.backToList")}
      </Link>
      {conversationQuery.isPending ? (
        <div role="status">
          <span className="dashboard-sr-only">{t("dashboard.loading")}</span>
          <Skeleton className="dashboard-page__skeleton" />
        </div>
      ) : conversationQuery.isError ? (
        <div className="dashboard-error" role="alert">
          <p>{t("dashboard.conversations.detailError")}</p>
          <Button onClick={() => void conversationQuery.refetch()}>{t("dashboard.retry")}</Button>
        </div>
      ) : (
        <>
          <header className="dashboard-page__header">
            <div>
              <h1>{t("dashboard.conversations.detailTitle")}</h1>
              <p>{t("dashboard.conversations.startedAt", { date: formatDate(conversationQuery.data.created_at) })}</p>
            </div>
          </header>
          {conversationQuery.data.messages.filter((message) => message.role !== "system").length === 0 ? (
            <div className="dashboard-empty">
              <p>{t("dashboard.conversations.detailEmpty")}</p>
            </div>
          ) : (
            <ol className="conversation-thread">
              {conversationQuery.data.messages
                .filter((message) => message.role !== "system")
                .map((message) => (
                  <li
                    className={`conversation-message conversation-message--${message.role}`}
                    key={message.id}
                  >
                    <span className="conversation-message__role">
                      {message.role === "user"
                        ? t("dashboard.conversations.customer")
                        : t("dashboard.conversations.assistant")}
                    </span>
                    <p>{message.content}</p>
                    <time dateTime={message.created_at}>{formatDate(message.created_at)}</time>
                  </li>
                ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
