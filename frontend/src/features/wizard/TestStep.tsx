import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { BusinessData } from "../../api/contracts/wizardDraft";
import { getAgentCapabilities, getCapabilities } from "../../shared/api/capabilities";
import { getInformationSources, updateAgent } from "../../shared/api/wizardContracts";
import { sendTestMessage } from "../../shared/api/wizardStage5";
import { Button, Skeleton } from "../../shared/ui";
import { buildAgentInstructions } from "./agentInstructions";

type TestMessage = { role: "user" | "assistant"; content: string };

export function TestStep({
  agentId,
  token,
  business,
  onEdit,
}: {
  agentId: string;
  token: string;
  business: BusinessData;
  onEdit: (step: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<TestMessage[]>(() =>
    business.openingMessage ? [{ role: "assistant", content: business.openingMessage }] : [],
  );
  const [conversationId, setConversationId] = useState<string>();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const sourcesQuery = useQuery({
    queryKey: ["information-sources", agentId],
    queryFn: () => getInformationSources(token, agentId),
  });
  const catalogQuery = useQuery({
    queryKey: ["capabilities"],
    queryFn: () => getCapabilities(token),
  });
  const enabledQuery = useQuery({
    queryKey: ["agent-capabilities", agentId],
    queryFn: () => getAgentCapabilities(token, agentId),
  });

  const summaryFailed = sourcesQuery.isError || catalogQuery.isError || enabledQuery.isError;
  const summaryLoading = sourcesQuery.isPending || catalogQuery.isPending || enabledQuery.isPending;
  const enabledCapabilities = catalogQuery.data?.filter((capability) =>
    enabledQuery.data?.some((selected) => selected.capability_id === capability.id && selected.enabled),
  ) ?? [];

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(false);
    setMessage("");
    setMessages((current) => [...current, { role: "user", content: text }]);
    try {
      await updateAgent(token, agentId, {
        name: business.agentName,
        description: business.businessDescription,
        system_prompt: buildAgentInstructions(business),
      });
      const reply = await sendTestMessage(token, agentId, text, conversationId);
      setConversationId(reply.conversation_id);
      setMessages((current) => [...current, { role: "assistant", content: reply.message.content }]);
    } catch {
      setSendError(true);
      setMessage(text);
      setMessages((current) => current.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="test-step">
      <section className="test-summary" aria-label={t("wizard.test.settingsLabel")}>
        <h2>{t("wizard.test.settingsTitle")}</h2>
        {summaryLoading ? <Skeleton className="test-summary__skeleton" /> : null}
        {summaryFailed ? (
          <div role="alert">
            <p>{t("wizard.test.summaryError")}</p>
            <Button
              type="button"
              onClick={() => {
                void sourcesQuery.refetch();
                void catalogQuery.refetch();
                void enabledQuery.refetch();
              }}
            >
              {t("app.retry")}
            </Button>
          </div>
        ) : null}
        {!summaryLoading && !summaryFailed ? (
          <>
            <section className="test-summary__group">
              <div>
                <h3>{t("wizard.test.businessGroup")}</h3>
                <p>{business.businessName} · {business.agentName}</p>
              </div>
              <Button type="button" onClick={() => onEdit(1)}>{t("wizard.test.edit")}</Button>
            </section>
            <section className="test-summary__group">
              <div>
                <h3>{t("wizard.test.informationGroup")}</h3>
                <p>{t("wizard.test.sourceCount", { count: sourcesQuery.data?.length ?? 0 })}</p>
              </div>
              <Button type="button" onClick={() => onEdit(2)}>{t("wizard.test.edit")}</Button>
            </section>
            <section className="test-summary__group">
              <div>
                <h3>{t("wizard.test.capabilitiesGroup")}</h3>
                {enabledCapabilities.length > 0 ? (
                  <ul>
                    {enabledCapabilities.map((capability) => (
                      <li key={capability.id}>{capability.name[i18n.resolvedLanguage?.startsWith("he") ? "he" : "en"]}</li>
                    ))}
                  </ul>
                ) : <p>{t("wizard.test.noCapabilities")}</p>}
              </div>
              <Button type="button" onClick={() => onEdit(3)}>{t("wizard.test.edit")}</Button>
            </section>
          </>
        ) : null}
      </section>

      <section className="test-chat" aria-label={t("wizard.test.chatLabel")}>
        <header className="test-chat__header">
          <h2>{t("wizard.test.chatTitle")}</h2>
          <Button
            type="button"
            onClick={() => {
              setMessages(
                business.openingMessage ? [{ role: "assistant", content: business.openingMessage }] : [],
              );
              setConversationId(undefined);
              setSendError(false);
            }}
          >
            {t("wizard.test.newConversation")}
          </Button>
        </header>
        <div className="test-chat__messages" aria-live="polite">
          {messages.length === 0 ? <p>{t("wizard.test.emptyChat")}</p> : null}
          {messages.map((item, index) => (
            <p className={`test-chat__message test-chat__message--${item.role}`} key={`${index}-${item.role}`}>
              {item.content}
            </p>
          ))}
          {sending ? <p role="status">{t("wizard.test.replying")}</p> : null}
          {sendError ? <p className="wizard-error" role="alert">{t("wizard.test.sendError")}</p> : null}
        </div>
        <form className="test-chat__form" onSubmit={(event) => void submitMessage(event)}>
          <label htmlFor="test-chat-message">{t("wizard.test.messageLabel")}</label>
          <input
            id="test-chat-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("wizard.test.messagePlaceholder")}
            maxLength={4000}
          />
          <Button type="submit" disabled={sending || !message.trim()}>{t("wizard.test.send")}</Button>
        </form>
        <p className="test-chat__note">{t("wizard.test.testNotice")}</p>
      </section>
    </div>
  );
}
