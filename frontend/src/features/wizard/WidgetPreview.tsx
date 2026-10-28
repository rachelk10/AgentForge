import { useTranslation } from "react-i18next";

export type WidgetPreviewProps = {
  agentName: string;
  openingMessage: string;
  primaryColor: string;
  logoData: string | null;
};

export function WidgetPreview({ agentName, openingMessage, primaryColor, logoData }: WidgetPreviewProps) {
  const { t } = useTranslation();

  return (
    <section className="widget-preview" aria-label={t("wizard.appearance.previewLabel")}>
      <header className="widget-preview__header" style={{ backgroundColor: primaryColor }}>
        {logoData ? <img src={logoData} alt="" className="widget-preview__logo" /> : null}
        <strong>{agentName || t("wizard.business.previewAgentFallback")}</strong>
      </header>
      <div className="widget-preview__body">
        <p className="widget-preview__bubble">{openingMessage || t("wizard.business.previewMessageFallback")}</p>
        <div className="widget-preview__input">{t("wizard.appearance.messagePlaceholder")}</div>
      </div>
      <span className="widget-preview__button" style={{ backgroundColor: primaryColor }} aria-hidden="true">
        {t("wizard.appearance.previewButton")}
      </span>
    </section>
  );
}
