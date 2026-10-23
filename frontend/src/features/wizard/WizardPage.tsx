import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import type { BusinessData, WizardDraft } from "../../api/contracts/wizardDraft";
import { wizardStepCount } from "../../api/contracts/wizardDraft";
import { getWizardDraft } from "../../shared/api/wizardContracts";
import { getToken } from "../../shared/auth/authStorage";
import { Button, Skeleton } from "../../shared/ui";
import { LanguageSwitcher } from "../shell/LanguageSwitcher";
import { BUSINESS_FORM_ID, BusinessStep } from "./BusinessStep";
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
  const queryClient = useQueryClient();
  const { status, retry } = useAutosave(draft, token);
  useEffect(() => {
    queryClient.setQueryData(["wizard-draft"], draft);
  }, [draft, queryClient]);
  const step = Math.min(Math.max(draft.currentStep, 1), wizardStepCount);

  const goToStep = (next: number) => setDraft((current) => ({ ...current, currentStep: next }));
  const updateBusiness = (business: BusinessData) => setDraft((current) => ({ ...current, business }));

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
                <Button type="button" onClick={() => goToStep(step + 1)}>
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
