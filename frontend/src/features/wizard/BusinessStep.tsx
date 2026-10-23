import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { BusinessData } from "../../api/contracts/wizardDraft";
import { conversationLanguages, industryOptions, toneOptions } from "../../api/contracts/wizardDraft";
import { Card, Input } from "../../shared/ui";
import { businessSchema } from "./businessSchema";

export const BUSINESS_FORM_ID = "business-step-form";

type Props = {
  value: BusinessData;
  onChange: (value: BusinessData) => void;
  onValid: () => void;
};

export function BusinessStep({ value, onChange, onValid }: Props) {
  const { t } = useTranslation();
  const form = useForm<BusinessData>({
    resolver: zodResolver(businessSchema) as never,
    defaultValues: value,
    mode: "onTouched",
  });
  const { register, control, handleSubmit, formState } = form;
  const values = useWatch({ control });

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const subscription = form.watch((next) => onChangeRef.current(next as BusinessData));
    return () => subscription.unsubscribe();
  }, [form]);

  const errorFor = (name: keyof BusinessData) => {
    const message = formState.errors[name]?.message;
    return message ? t(`wizard.business.validation.${message}`) : null;
  };
  const fieldProps = (name: keyof BusinessData) => ({
    id: `business-${name}`,
    "aria-invalid": errorFor(name) ? true : undefined,
    "aria-describedby": errorFor(name) ? `business-${name}-error` : undefined,
  });
  const renderError = (name: keyof BusinessData) =>
    errorFor(name) ? (
      <p id={`business-${name}-error`} role="alert" className="field-error">
        {errorFor(name)}
      </p>
    ) : null;

  const previewDirection = values.language === "he" ? "rtl" : "ltr";

  return (
    <div className="business-step">
      <form id={BUSINESS_FORM_ID} noValidate onSubmit={handleSubmit(() => onValid())} className="wizard-form">
        <div className="field">
          <label htmlFor="business-businessName">{t("wizard.business.businessName")}</label>
          <Input {...register("businessName")} {...fieldProps("businessName")} autoComplete="organization" />
          {renderError("businessName")}
        </div>

        <div className="field">
          <label htmlFor="business-industry">{t("wizard.business.industry")}</label>
          <select {...register("industry")} {...fieldProps("industry")}>
            <option value="">{t("wizard.business.industryPlaceholder")}</option>
            {industryOptions.map((option) => (
              <option key={option} value={option}>
                {t(`wizard.business.industries.${option}`)}
              </option>
            ))}
          </select>
          {renderError("industry")}
        </div>

        {values.industry === "other" ? (
          <div className="field">
            <label htmlFor="business-industryOther">{t("wizard.business.industryOther")}</label>
            <Input {...register("industryOther")} {...fieldProps("industryOther")} />
            {renderError("industryOther")}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="business-businessDescription">{t("wizard.business.description")}</label>
          <p className="field-hint">{t("wizard.business.descriptionExample")}</p>
          <textarea rows={4} {...register("businessDescription")} {...fieldProps("businessDescription")} />
          {renderError("businessDescription")}
        </div>

        <div className="field">
          <label htmlFor="business-agentName">{t("wizard.business.agentName")}</label>
          <Input {...register("agentName")} {...fieldProps("agentName")} />
          {renderError("agentName")}
        </div>

        <div className="field">
          <label htmlFor="business-openingMessage">{t("wizard.business.openingMessage")}</label>
          <textarea rows={3} {...register("openingMessage")} {...fieldProps("openingMessage")} />
          {renderError("openingMessage")}
        </div>

        <div className="field">
          <label htmlFor="business-language">{t("wizard.business.language")}</label>
          <select {...register("language")} {...fieldProps("language")}>
            {conversationLanguages.map((option) => (
              <option key={option} value={option}>
                {t(`wizard.business.languages.${option}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="business-tone">{t("wizard.business.tone")}</label>
          <select {...register("tone")} {...fieldProps("tone")}>
            {toneOptions.map((option) => (
              <option key={option} value={option}>
                {t(`wizard.business.tones.${option}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="business-guidelines">{t("wizard.business.guidelines")}</label>
          <p className="field-hint">{t("wizard.business.guidelinesHint")}</p>
          <textarea rows={3} {...register("guidelines")} {...fieldProps("guidelines")} />
          {renderError("guidelines")}
        </div>
      </form>

      <Card className="intro-preview" aria-labelledby="intro-preview-title">
        <h2 id="intro-preview-title">{t("wizard.business.previewTitle")}</h2>
        <p className="intro-preview__agent">
          <strong>{values.agentName?.trim() || t("wizard.business.previewAgentFallback")}</strong>
          {values.businessName?.trim() ? <span> · {values.businessName.trim()}</span> : null}
        </p>
        <p className="intro-preview__bubble" dir={previewDirection} lang={values.language}>
          {values.openingMessage?.trim() || t("wizard.business.previewMessageFallback")}
        </p>
      </Card>
    </div>
  );
}
