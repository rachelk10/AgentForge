import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { Capability, ConfigField } from "../../../shared/api/capabilities";
import { Button, Dialog, Input } from "../../../shared/ui";
import { AvailabilityEditor } from "./AvailabilityEditor";
import type { Availability, FormValues, LeadField } from "./configForm";
import { buildConfigSchema, initialValues, toPayload } from "./configForm";
import { LeadFieldsEditor } from "./LeadFieldsEditor";
import { useLocalize } from "./useLocalize";

type Props = {
  capability: Capability;
  saved: Record<string, unknown>;
  strict: boolean;
  onSave: (config: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
};

export function CapabilityConfigDialog({ capability, saved, strict, onSave, onClose }: Props) {
  const { t } = useTranslation();
  const localize = useLocalize();
  const fields = capability.config_fields;
  const titleId = `capability-config-${capability.id}`;
  const [failed, setFailed] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(buildConfigSchema(fields, strict)) as never,
    defaultValues: initialValues(fields, saved),
    mode: "onTouched",
  });
  const { control, register, handleSubmit, formState } = form;

  const submit = handleSubmit(async (values) => {
    setFailed(false);
    try {
      await onSave(toPayload(fields, values));
    } catch {
      setFailed(true);
    }
  });

  const errorFor = (key: string) => {
    const message = formState.errors[key]?.message;
    return typeof message === "string" ? t(`wizard.capabilities.validation.${message}`) : null;
  };

  const renderControl = (field: ConfigField) => {
    const id = `${titleId}-${field.key}`;
    const error = errorFor(field.key);
    const describedBy = [field.help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
    const common = { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy };
    const options = field.options ?? [];

    switch (field.type) {
      case "text":
        return <Input {...register(field.key)} {...common} />;
      case "email":
        return <Input type="email" autoComplete="email" {...register(field.key)} {...common} />;
      case "number":
        return <Input type="number" inputMode="numeric" min={field.min ?? undefined} max={field.max ?? undefined} {...register(field.key)} {...common} />;
      case "textarea":
        return <textarea rows={3} {...register(field.key)} {...common} />;
      case "select":
        return (
          <select {...register(field.key)} {...common}>
            <option value="">{t("wizard.capabilities.selectPlaceholder")}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {localize(option.label)}
              </option>
            ))}
          </select>
        );
      case "multiselect":
        return (
          <Controller
            control={control}
            name={field.key}
            render={({ field: controller }) => {
              const selected = (controller.value as string[]) ?? [];
              return (
                <div id={id} role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="config-options">
                  {options.map((option) => (
                    <label key={option.value} className="config-options__item">
                      <input
                        type="checkbox"
                        checked={selected.includes(option.value)}
                        onChange={(event) =>
                          controller.onChange(
                            event.target.checked
                              ? [...selected, option.value]
                              : selected.filter((value) => value !== option.value),
                          )
                        }
                      />
                      {localize(option.label)}
                    </label>
                  ))}
                </div>
              );
            }}
          />
        );
      case "lead_fields":
        return (
          <Controller
            control={control}
            name={field.key}
            render={({ field: controller }) => (
              <LeadFieldsEditor
                id={id}
                describedBy={describedBy}
                value={(controller.value as LeadField[]) ?? []}
                onChange={controller.onChange}
              />
            )}
          />
        );
      case "weekly_availability":
        return (
          <Controller
            control={control}
            name={field.key}
            render={({ field: controller }) => (
              <AvailabilityEditor
                id={id}
                describedBy={describedBy}
                value={(controller.value as Availability) ?? {}}
                onChange={controller.onChange}
              />
            )}
          />
        );
    }
  };

  return (
    <Dialog open titleId={titleId} onClose={onClose}>
      <h2 id={titleId}>{t("wizard.capabilities.configureTitle", { name: localize(capability.name) })}</h2>
      <form noValidate onSubmit={submit} className="wizard-form">
        {fields.map((field) => {
          const id = `${titleId}-${field.key}`;
          const error = errorFor(field.key);
          const grouped = ["multiselect", "lead_fields", "weekly_availability"].includes(field.type);
          return (
            <div className="field" key={field.key}>
              {grouped ? (
                <span id={`${id}-label`} className="field-label">
                  {localize(field.label)}
                </span>
              ) : (
                <label htmlFor={id}>
                  {localize(field.label)}
                  {field.required ? null : <span className="field-optional"> ({t("wizard.capabilities.optional")})</span>}
                </label>
              )}
              {field.help ? (
                <p id={`${id}-help`} className="field-hint">
                  {localize(field.help)}
                </p>
              ) : null}
              {renderControl(field)}
              {error ? (
                <p id={`${id}-error`} role="alert" className="field-error">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
        {failed ? (
          <p role="alert" className="field-error">
            {t("wizard.capabilities.saveError")}
          </p>
        ) : null}
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? t("wizard.capabilities.saving") : t("wizard.capabilities.save")}
        </Button>
      </form>
    </Dialog>
  );
}
