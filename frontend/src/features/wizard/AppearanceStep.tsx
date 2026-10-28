import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentAppearance, PublishResult } from "../../api/contracts/wizardStage5";
import type { BusinessData } from "../../api/contracts/wizardDraft";
import {
  getAgentAppearance,
  publishAgent,
  updateAgentColor,
  uploadAgentLogo,
} from "../../shared/api/wizardStage5";
import { updateAgent } from "../../shared/api/wizardContracts";
import { Button, Skeleton } from "../../shared/ui";
import { buildAgentInstructions } from "./agentInstructions";
import { WidgetPreview } from "./WidgetPreview";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const allowedLogoTypes = ["image/png", "image/jpeg", "image/svg+xml"];

export function contrastRatio(hexColor: string): number {
  const channels = hexColor.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!channels) return 1;
  const values = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(channels.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  return (1.05) / (luminance + 0.05);
}

function getEmbedCode(publicKey: string): string {
  return `<script src="${window.location.origin}/widget.js" data-public-key="${publicKey}" async></script>`;
}

export function AppearanceStep({
  agentId,
  token,
  business,
}: {
  agentId: string;
  token: string;
  business: BusinessData;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [publishError, setPublishError] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const appearanceQuery = useQuery({
    queryKey: ["agent-appearance", agentId],
    queryFn: () => getAgentAppearance(token, agentId),
  });
  const appearance = appearanceQuery.data;

  useEffect(() => {
    const publicKey = appearance?.public_key;
    if (appearance?.is_published && publicKey) {
      setPublishResult((current) => current ?? { public_key: publicKey, published_at: "" });
    }
  }, [appearance]);

  const lowContrast = useMemo(
    () => Boolean(appearance && contrastRatio(appearance.primary_color) < 4.5),
    [appearance],
  );
  const standaloneUrl = publishResult
    ? `${window.location.origin}/chat/${encodeURIComponent(publishResult.public_key)}`
    : null;
  const embedCode = publishResult ? getEmbedCode(publishResult.public_key) : null;

  async function handleColorChange(primaryColor: string) {
    setActionError(false);
    try {
      const updated = await updateAgentColor(token, agentId, primaryColor);
      queryClient.setQueryData<AgentAppearance>(["agent-appearance", agentId], (current) =>
        current ? { ...current, ...updated } : current,
      );
    } catch {
      setActionError(true);
    }
  }

  async function handleLogoChange(file: File | undefined) {
    if (!file) return;
    setLogoError(false);
    if (!allowedLogoTypes.includes(file.type) || file.size > MAX_LOGO_BYTES) {
      setLogoError(true);
      return;
    }
    try {
      const updated = await uploadAgentLogo(token, agentId, file);
      queryClient.setQueryData<AgentAppearance>(["agent-appearance", agentId], updated);
    } catch {
      setLogoError(true);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setPublishError(false);
    try {
      await updateAgent(token, agentId, {
        name: business.agentName,
        description: business.businessDescription,
        system_prompt: buildAgentInstructions(business),
      });
      const result = await publishAgent(token, agentId);
      setPublishResult(result);
      queryClient.setQueryData<AgentAppearance>(["agent-appearance", agentId], (current) =>
        current ? { ...current, is_published: true, public_key: result.public_key } : current,
      );
    } catch {
      setPublishError(true);
    } finally {
      setPublishing(false);
    }
  }

  async function copyEmbedCode() {
    if (!embedCode) return;
    setCopyError(false);
    setCopied(false);
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
    } catch {
      setCopyError(true);
    }
  }

  if (appearanceQuery.isPending) {
    return <Skeleton className="appearance-skeleton" aria-label={t("wizard.appearance.loading")} />;
  }
  if (appearanceQuery.isError || !appearance) {
    return (
      <div role="alert" className="appearance-error">
        <p>{t("wizard.appearance.loadError")}</p>
        <Button type="button" onClick={() => void appearanceQuery.refetch()}>{t("app.retry")}</Button>
      </div>
    );
  }

  return (
    <div className="appearance-step">
      <section className="appearance-controls" aria-label={t("wizard.appearance.controlsLabel")}>
        <div className="field">
          <label htmlFor="agent-logo">{t("wizard.appearance.logo")}</label>
          <input
            id="agent-logo"
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(event) => {
              void handleLogoChange(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <p className="field-hint">{t("wizard.appearance.logoHint")}</p>
          {logoError ? <p className="field-error" role="alert">{t("wizard.appearance.logoError")}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="agent-primary-color">{t("wizard.appearance.primaryColor")}</label>
          <input
            id="agent-primary-color"
            type="color"
            value={appearance.primary_color}
            onChange={(event) => void handleColorChange(event.currentTarget.value)}
          />
          {lowContrast ? (
            <p className="appearance-warning" role="alert">{t("wizard.appearance.contrastWarning")}</p>
          ) : null}
        </div>
        {actionError ? <p className="field-error" role="alert">{t("wizard.appearance.saveError")}</p> : null}
        <WidgetPreview
          agentName={business.agentName}
          openingMessage={business.openingMessage}
          primaryColor={appearance.primary_color}
          logoData={appearance.logo_data}
        />
        <Button type="button" disabled={publishing} onClick={() => void handlePublish()}>
          {publishing ? t("wizard.appearance.publishing") : t("wizard.appearance.publish")}
        </Button>
        {publishError ? <p className="field-error" role="alert">{t("wizard.appearance.publishError")}</p> : null}
      </section>

      {publishResult && embedCode && standaloneUrl ? (
        <section className="publish-result" aria-live="polite">
          <h2>{t("wizard.appearance.publishedTitle")}</h2>
          <p>{t("wizard.appearance.embedInstructions")}</p>
          <label htmlFor="agent-embed-code">{t("wizard.appearance.embedCode")}</label>
          <textarea id="agent-embed-code" readOnly value={embedCode} />
          <Button type="button" onClick={() => void copyEmbedCode()}>
            {copied ? t("wizard.appearance.copied") : t("wizard.appearance.copyCode")}
          </Button>
          {copyError ? <p className="field-error" role="alert">{t("wizard.appearance.copyError")}</p> : null}
          <p>
            <a href={standaloneUrl} target="_blank" rel="noreferrer">{t("wizard.appearance.standaloneLink")}</a>
          </p>
        </section>
      ) : null}
    </div>
  );
}
