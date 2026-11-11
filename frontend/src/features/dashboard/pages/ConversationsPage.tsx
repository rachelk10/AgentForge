import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { getDashboardConversations } from "../../../shared/api/dashboard";
import { Button, Skeleton } from "../../../shared/ui";
import { useDashboardContext } from "../context";

const pageSize = 50;

export function ConversationsPage() {
  const { agent, token } = useDashboardContext();
  const { t, i18n } = useTranslation();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const conversationsQuery = useQuery({
    queryKey: ["dashboard-conversations", agent.id, search, tag, offset],
    queryFn: () =>
      getDashboardConversations(token, agent.id, {
        search,
        tag,
        limit: pageSize,
        offset,
      }),
  });
  const formatDate = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));

  return (
    <section className="dashboard-page">
      <header className="dashboard-page__header">
        <div>
          <h1>{t("dashboard.conversations.title")}</h1>
          <p>{t("dashboard.conversations.description")}</p>
        </div>
      </header>
      <div className="dashboard-filters">
        <label className="dashboard-field">
          <span>{t("dashboard.conversations.searchLabel")}</span>
          <input
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t("dashboard.conversations.searchPlaceholder")}
            type="search"
            value={searchInput}
          />
        </label>
        <label className="dashboard-field">
          <span>{t("dashboard.conversations.filterLabel")}</span>
          <select
            onChange={(event) => {
              setTag(event.target.value);
              setOffset(0);
            }}
            value={tag}
          >
            <option value="">{t("dashboard.conversations.allTags")}</option>
            <option value="lead">{t("dashboard.tags.lead")}</option>
            <option value="meeting">{t("dashboard.tags.meeting")}</option>
            <option value="handed_off">{t("dashboard.tags.handed_off")}</option>
          </select>
        </label>
      </div>
      {conversationsQuery.isPending ? (
        <div role="status">
          <span className="dashboard-sr-only">{t("dashboard.loading")}</span>
          <Skeleton className="dashboard-page__skeleton" />
        </div>
      ) : conversationsQuery.isError ? (
        <div className="dashboard-error" role="alert">
          <p>{t("dashboard.conversations.loadError")}</p>
          <Button onClick={() => void conversationsQuery.refetch()}>{t("dashboard.retry")}</Button>
        </div>
      ) : conversationsQuery.data.conversations.length === 0 ? (
        <div className="dashboard-empty">
          <h2>{t("dashboard.conversations.emptyTitle")}</h2>
          <p>{t(search || tag ? "dashboard.conversations.noMatches" : "dashboard.conversations.emptyDescription")}</p>
        </div>
      ) : (
        <>
          <ul className="conversation-list">
            {conversationsQuery.data.conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  className="conversation-card"
                  to={`/dashboard/conversations/${encodeURIComponent(conversation.id)}`}
                >
                  <span className="conversation-card__copy">
                    <strong>{conversation.first_message || conversation.title || t("dashboard.conversations.untitled")}</strong>
                    <span>{formatDate(conversation.created_at)}</span>
                    <span>{t("dashboard.conversations.messageCount", { count: conversation.message_count })}</span>
                  </span>
                  <span className="conversation-tags">
                    {conversation.tags.map((conversationTag) => (
                      <span className="conversation-tag" key={conversationTag}>
                        {t(`dashboard.tags.${conversationTag}`)}
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="dashboard-pagination">
            <span>{t("dashboard.conversations.resultCount", { count: conversationsQuery.data.total })}</span>
            <div>
              <Button
                className="dashboard-button--secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - pageSize))}
              >
                {t("dashboard.conversations.previous")}
              </Button>
              <Button
                className="dashboard-button--secondary"
                disabled={offset + pageSize >= conversationsQuery.data.total}
                onClick={() => setOffset(offset + pageSize)}
              >
                {t("dashboard.conversations.next")}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
