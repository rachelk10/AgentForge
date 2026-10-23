import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { Template } from "../../api/contracts/templates";
import type { ConversationLanguage } from "../../api/contracts/wizardDraft";
import { getTemplates, getWizardDraft, saveWizardDraft } from "../../shared/api/wizardContracts";
import { getToken } from "../../shared/auth/authStorage";
import { Button, Card, Skeleton } from "../../shared/ui";
import { LanguageSwitcher } from "../shell/LanguageSwitcher";
import { applyTemplate } from "../wizard/applyTemplate";
import { pickText } from "../wizard/localized";
import "../wizard/wizard.css";

export function StartPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = getToken() ?? "";
  const [choosingTemplate, setChoosingTemplate] = useState(false);
  const language: ConversationLanguage = i18n.language.startsWith("he") ? "he" : "en";

  const draftQuery = useQuery({
    queryKey: ["wizard-draft"],
    queryFn: () => getWizardDraft(token),
    staleTime: Infinity,
  });
  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => getTemplates(token),
    enabled: choosingTemplate,
  });

  const startMutation = useMutation({
    mutationFn: (template: Template | null) =>
      saveWizardDraft(token, applyTemplate(draftQuery.data ?? null, template, templatesQuery.data ?? [], language)),
    onSuccess: (saved) => {
      queryClient.setQueryData(["wizard-draft"], saved);
      navigate("/app/wizard");
    },
  });

  const busy = startMutation.isPending || draftQuery.isPending;

  return (
    <main className="wizard-page">
      <header className="wizard-header">
        <span className="wizard-brand">{t("app.title")}</span>
        <LanguageSwitcher />
      </header>
      <div className="wizard-container">
        <h1 className="wizard-title">{t("start.title")}</h1>
        <p className="wizard-lead">{t("start.description")}</p>

        {startMutation.isError ? (
          <p role="alert" className="wizard-error">
            {t("start.saveError")}
          </p>
        ) : null}

        {!choosingTemplate ? (
          <div className="start-options">
            <Card className="start-card">
              <h2>{t("start.templateTitle")}</h2>
              <p>{t("start.templateDescription")}</p>
              <Button type="button" onClick={() => setChoosingTemplate(true)}>
                {t("start.templateAction")}
              </Button>
            </Card>
            <Card className="start-card">
              <h2>{t("start.scratchTitle")}</h2>
              <p>{t("start.scratchDescription")}</p>
              <Button type="button" disabled={busy} onClick={() => startMutation.mutate(null)}>
                {t("start.scratchAction")}
              </Button>
            </Card>
          </div>
        ) : (
          <section aria-labelledby="template-list-title">
            <div className="start-templates-header">
              <h2 id="template-list-title">{t("start.chooseTemplate")}</h2>
              <Button type="button" onClick={() => setChoosingTemplate(false)}>
                {t("start.changeChoice")}
              </Button>
            </div>
            {templatesQuery.isPending ? (
              <div className="start-options" aria-label={t("start.loadingTemplates")}>
                <Skeleton className="start-skeleton" />
                <Skeleton className="start-skeleton" />
                <Skeleton className="start-skeleton" />
              </div>
            ) : templatesQuery.isError ? (
              <div role="alert" className="wizard-error">
                <p>{t("start.templatesError")}</p>
                <Button type="button" onClick={() => templatesQuery.refetch()}>
                  {t("app.retry")}
                </Button>
              </div>
            ) : templatesQuery.data.length === 0 ? (
              <p>{t("start.templatesEmpty")}</p>
            ) : (
              <ul className="start-options start-templates">
                {templatesQuery.data.map((template) => (
                  <li key={template.id}>
                    <Card className="start-card">
                      <h3>{pickText(template.name, i18n.language)}</h3>
                      <p>{pickText(template.description, i18n.language)}</p>
                      <p className="start-card__meta">{t("start.includes")}</p>
                      <ul className="start-capabilities">
                        {template.capabilities.map((capability) => (
                          <li key={capability.id}>{pickText(capability.name, i18n.language)}</li>
                        ))}
                      </ul>
                      <Button type="button" disabled={busy} onClick={() => startMutation.mutate(template)}>
                        {t("start.useTemplate", { name: pickText(template.name, i18n.language) })}
                      </Button>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
