import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import type { BusinessData, InformationFailure, WizardDraft } from "../../api/contracts/wizardDraft";
import { wizardStepCount } from "../../api/contracts/wizardDraft";
import { createAgent, getAgents, getWizardDraft, saveWizardDraft } from "../../shared/api/wizardContracts";
import { getToken } from "../../shared/auth/authStorage";
import { Button, Skeleton } from "../../shared/ui";
import { LanguageSwitcher } from "../shell/LanguageSwitcher";
import { BUSINESS_FORM_ID, BusinessStep } from "./BusinessStep";
import { InformationStep } from "./InformationStep";
import { useAutosave } from "./useAutosave";
import "./wizard.css";

const stepKeys = ["business", "information", "capabilities", "test", "appearance"] as const;

export function WizardPage() {
  const { t } = useTranslation();
  const token = getToken() ?? "";
  const draftQuery = useQuery({
    queryKey: ["wizard-draft"],
    queryFn: () => getWizardDraft(token),
    staleTime: Infinity,
  });

  if (draftQuery.isPending) {
    return (
      <main className="wizard-page">
        <div className="wizard-container" aria-label={t("wizard.loading")}>
          <Skeleton className="wizard-skeleton" />
          <Skeleton className="wizard-skeleton" />
        </div>
      </main>
    );
  }
  if (draftQuery.isError) {
    return (
      <main className="wizard-page">
        <div className="wizard-container wizard-error" role="alert">
          <p>{t("wizard.loadError")}</p>
          <Button type="button" onClick={() => draftQuery.refetch()}>
            {t("app.retry")}
          </Button>
        </div>
      </main>
    );
  }
  if (!draftQuery.data) return <Navigate to="/app/start" replace />;
  return <WizardShell initialDraft={draftQuery.data} token={token} />;
}

function WizardShell({ initialDraft, token }: { initialDraft: WizardDraft; token: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initialDraft);
  const draftRef = useRef(draft);
  const agentCreationRef = useRef<Promise<string> | null>(null);
  const [agentSetupStatus, setAgentSetupStatus] = useState<"loading" | "ready" | "error">(
    initialDraft.agentId ? "ready" : "loading",
  );
  const [agentSetupAttempt, setAgentSetupAttempt] = useState(0);
  const queryClient = useQueryClient();
  const { status, retry } = useAutosave(draft, token);
  useEffect(() => {
    draftRef.current = draft;
    queryClient.setQueryData(["wizard-draft"], draft);
  }, [draft, queryClient]);
  const step = Math.min(Math.max(draft.currentStep, 1), wizardStepCount);

  const goToStep = (next: number) => setDraft((current) => ({ ...current, currentStep: next }));
  const updateBusiness = (business: BusinessData) => setDraft((current) => ({ ...current, business }));
  const updateInformationFailures = (informationFailures: InformationFailure[]) =>
    setDraft((current) => ({ ...current, informationFailures }));

  useEffect(() => {
    if (step !== 2 || draft.agentId) return;
    let active = true;
    setAgentSetupStatus("loading");
    agentCreationRef.current ??= getAgents(token).then(async (agents) => {
      if (agents[0]) return agents[0].id;
      const created = await createAgent(token, {
        name: draftRef.current.business.agentName,
        description: draftRef.current.business.businessDescription,
        model: "gpt-4o-mini",
        temperature: 0.7,
        rag_top_k: 5,
        rag_similarity_threshold: 0.3,
        skills_top_k: 3,
        skills_similarity_threshold: 0.75,
        is_active: true,
      });
      return created.id;
    });

    void agentCreationRef.current
      .then(async (agentId) => {
        const updatedDraft = { ...draftRef.current, agentId };
        await saveWizardDraft(token, updatedDraft);
        if (!active) return;
        setDraft(updatedDraft);
        setAgentSetupStatus("ready");
      })
      .catch(() => {
        agentCreationRef.current = null;
        if (active) setAgentSetupStatus("error");
      });

    return () => {
      active = false;
    };
  }, [agentSetupAttempt, draft.agentId, step, token]);

  return (
    <main className="wizard-page">
      <header className="wizard-header">
        <span className="wizard-brand">{t("app.title")}</span>
        <LanguageSwitcher />
      </header>
      <div className="wizard-container">
        <nav aria-label={t("wizard.progressLabel")}>
          <p className="wizard-progress-text">{t("wizard.progress", { current: step, total: wizardStepCount })}</p>
          <div
            className="wizard-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={wizardStepCount}
            aria-valuenow={step}
            aria-valuetext={t("wizard.progress", { current: step, total: wizardStepCount })}
          >
            <div className="wizard-progress__bar" style={{ inlineSize: `${(step / wizardStepCount) * 100}%` }} />
          </div>
          <ol className="wizard-steps">
            {stepKeys.map((key, index) => (
              <li key={key} aria-current={index + 1 === step ? "step" : undefined}>
                {t(`wizard.steps.${key}`)}
              </li>
            ))}
          </ol>
        </nav>

        <h1 className="wizard-title">{t(`wizard.steps.${stepKeys[step - 1]}`)}</h1>
        <p className="wizard-lead">{t(`wizard.stepDescriptions.${stepKeys[step - 1]}`)}</p>

        {step === 1 ? (
          <BusinessStep value={draft.business} onChange={updateBusiness} onValid={() => goToStep(2)} />
        ) : step === 2 ? (
          agentSetupStatus === "ready" && draft.agentId ? (
            <InformationStep
              agentId={draft.agentId}
              token={token}
              failures={draft.informationFailures ?? []}
              onFailuresChange={updateInformationFailures}
              onSkip={() => goToStep(step + 1)}
            />
          ) : (
            <div className="wizard-agent-setup" role={agentSetupStatus === "error" ? "alert" : "status"}>
              <p>{t(agentSetupStatus === "error" ? "wizard.information.agentError" : "wizard.information.agentLoading")}</p>
              {agentSetupStatus === "error" ? (
                <Button type="button" onClick={() => setAgentSetupAttempt((attempt) => attempt + 1)}>
                  {t("app.retry")}
                </Button>
              ) : null}
            </div>
          )
        ) : (
          <p className="wizard-placeholder">{t("wizard.laterStage")}</p>
        )}

        <footer className="wizard-footer">
          <div className="wizard-save-status" role="status" aria-live="polite">
            {status === "saving" ? t("wizard.saving") : null}
            {status === "saved" ? t("wizard.saved") : null}
            {status === "error" ? (
              <span className="wizard-error">
                {t("wizard.saveError")}{" "}
                <Button type="button" onClick={() => void retry()}>
                  {t("app.retry")}
                </Button>
              </span>
            ) : null}
          </div>
          <div className="wizard-actions">
            <Button type="button" onClick={() => (step === 1 ? navigate("/app/start") : goToStep(step - 1))}>
              {t("wizard.back")}
            </Button>
            {step < wizardStepCount ? (
              step === 1 ? (
                <Button type="submit" form={BUSINESS_FORM_ID}>
                  {t("wizard.next")}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={step === 2 && agentSetupStatus !== "ready"}
                  onClick={() => goToStep(step + 1)}
                >
                  {t("wizard.next")}
                </Button>
              )
            ) : null}
          </div>
        </footer>
      </div>
    </main>
  );
}
