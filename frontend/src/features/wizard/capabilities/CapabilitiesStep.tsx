import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentCapability, Capability } from "../../../shared/api/capabilities";
import { getAgentCapabilities, getCapabilities, saveAgentCapability } from "../../../shared/api/capabilities";
import { Button, Card, Skeleton } from "../../../shared/ui";
import { CapabilityConfigDialog } from "./CapabilityConfigDialog";
import { initialValues, needsSetup, toPayload } from "./configForm";
import { SkillsPicker } from "./SkillsPicker";
import { useLocalize } from "./useLocalize";
import "./capabilities.css";

type Props = { agentId: string; token: string };
type DialogState = { capability: Capability; enableOnSave: boolean };

export function CapabilitiesStep({ agentId, token }: Props) {
  const { t } = useTranslation();
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const catalogKey = ["capabilities", "catalog"];
  const agentKey = ["capabilities", "agent", agentId];
  const catalog = useQuery({ queryKey: catalogKey, queryFn: () => getCapabilities(token) });
  const states = useQuery({ queryKey: agentKey, queryFn: () => getAgentCapabilities(token, agentId) });

  const save = useMutation({
    mutationFn: ({ capabilityId, enabled, config }: { capabilityId: string; enabled: boolean; config: Record<string, unknown> }) =>
      saveAgentCapability(token, agentId, capabilityId, { enabled, config }),
    onSuccess: (saved) => {
      queryClient.setQueryData<AgentCapability[]>(agentKey, (current = []) =>
        current.some((item) => item.capability_id === saved.capability_id)
          ? current.map((item) => (item.capability_id === saved.capability_id ? saved : item))
          : [...current, saved],
      );
    },
  });

  if (catalog.isPending || states.isPending) {
    return (
      <div role="status" aria-label={t("wizard.capabilities.loading")}>
        <Skeleton className="wizard-skeleton" />
        <Skeleton className="wizard-skeleton" />
      </div>
    );
  }
  if (catalog.isError || states.isError) {
    return (
      <div role="alert" className="wizard-error">
        <p>{t("wizard.capabilities.loadError")}</p>
        <Button
          type="button"
          onClick={() => {
            void catalog.refetch();
            void states.refetch();
          }}
        >
          {t("app.retry")}
        </Button>
      </div>
    );
  }

  const stateOf = (capabilityId: string) => states.data.find((item) => item.capability_id === capabilityId);

  const persist = async (capability: Capability, enabled: boolean, config: Record<string, unknown>) => {
    setFailedId(null);
    await save.mutateAsync({ capabilityId: capability.id, enabled, config });
  };

  const toggle = (capability: Capability, enabled: boolean) => {
    const saved = stateOf(capability.id)?.config ?? {};
    if (enabled && needsSetup(capability.config_fields, saved)) {
      setDialog({ capability, enableOnSave: true });
      return;
    }
    const config = enabled
      ? toPayload(capability.config_fields, initialValues(capability.config_fields, saved))
      : saved;
    persist(capability, enabled, config).catch(() => setFailedId(capability.id));
  };

  return (
    <div className="capabilities-step">
      <section aria-label={t("wizard.capabilities.sectionLabel")}>
        {catalog.data.length === 0 ? (
          <p>{t("wizard.capabilities.empty")}</p>
        ) : (
          <ul className="capability-list">
            {catalog.data.map((capability) => {
              const state = stateOf(capability.id);
              const enabled = Boolean(state?.enabled) && !capability.locked;
              const name = localize(capability.name);
              const nameId = `capability-name-${capability.id}`;
              return (
                <li key={capability.id}>
                  <Card className="capability-card" aria-labelledby={nameId}>
                    <div className="capability-card__header">
                      <h2 id={nameId}>{name}</h2>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={enabled}
                        disabled={capability.locked || save.isPending}
                        aria-label={t("wizard.capabilities.toggleLabel", { name })}
                        onChange={(event) => toggle(capability, event.target.checked)}
                      />
                    </div>
                    <p>{localize(capability.description)}</p>
                    {capability.locked ? (
                      <p className="capability-card__locked">
                        <span aria-hidden="true">🔒 </span>
                        {t("wizard.capabilities.locked")}
                      </p>
                    ) : capability.config_fields.length > 0 ? (
                      <Button
                        type="button"
                        aria-label={t("wizard.capabilities.configureLabel", { name })}
                        onClick={() => setDialog({ capability, enableOnSave: false })}
                      >
                        {t("wizard.capabilities.configure")}
                      </Button>
                    ) : null}
                    {failedId === capability.id ? (
                      <p role="alert" className="field-error">
                        {t("wizard.capabilities.saveError")}
                      </p>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <SkillsPicker agentId={agentId} token={token} />

      {dialog ? (
        <CapabilityConfigDialog
          capability={dialog.capability}
          saved={stateOf(dialog.capability.id)?.config ?? {}}
          strict={dialog.enableOnSave || Boolean(stateOf(dialog.capability.id)?.enabled)}
          onClose={() => setDialog(null)}
          onSave={async (config) => {
            const enabled = dialog.enableOnSave || Boolean(stateOf(dialog.capability.id)?.enabled);
            await persist(dialog.capability, enabled, config);
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}
