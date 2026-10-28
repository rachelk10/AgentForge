import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input } from "../../../shared/ui";
import type { LeadField } from "./configForm";

const suggestionKeys = ["name", "phone", "email", "message"] as const;

type Props = {
  id: string;
  value: LeadField[];
  onChange: (value: LeadField[]) => void;
  describedBy?: string;
};

export function LeadFieldsEditor({ id, value, onChange, describedBy }: Props) {
  const { t } = useTranslation();
  const [customCount, setCustomCount] = useState(0);
  const base = "wizard.capabilities.leadFields";

  const update = (index: number, patch: Partial<LeadField>) =>
    onChange(value.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  const addSuggestion = (key: (typeof suggestionKeys)[number]) =>
    onChange([...value, { key, label: t(`${base}.suggestions.${key}`), required: false }]);
  const addCustom = () => {
    const taken = new Set(value.map((item) => item.key));
    let next = customCount + 1;
    while (taken.has(`custom${next}`)) next += 1;
    setCustomCount(next);
    onChange([...value, { key: `custom${next}`, label: "", required: false }]);
  };

  const availableSuggestions = suggestionKeys.filter((key) => !value.some((item) => item.key === key));

  return (
    <div id={id} className="lead-fields" role="group" aria-describedby={describedBy}>
      {value.length === 0 ? <p className="field-hint">{t(`${base}.empty`)}</p> : null}
      <ul className="lead-fields__list">
        {value.map((item, index) => (
          <li key={item.key} className="lead-fields__row">
            <Input
              aria-label={t(`${base}.labelText`)}
              value={item.label}
              onChange={(event) => update(index, { label: event.target.value })}
            />
            <label className="lead-fields__required">
              <input
                type="checkbox"
                checked={item.required}
                onChange={(event) => update(index, { required: event.target.checked })}
              />
              {t(`${base}.required`)}
            </label>
            <Button
              type="button"
              aria-label={t(`${base}.remove`, { name: item.label || t(`${base}.labelText`) })}
              onClick={() => onChange(value.filter((_, position) => position !== index))}
            >
              ×
            </Button>
          </li>
        ))}
      </ul>
      <div className="lead-fields__add">
        {availableSuggestions.map((key) => (
          <Button key={key} type="button" onClick={() => addSuggestion(key)}>
            {t(`${base}.add`)} {t(`${base}.suggestions.${key}`)}
          </Button>
        ))}
        <Button type="button" onClick={addCustom}>
          {t(`${base}.addCustom`)}
        </Button>
      </div>
    </div>
  );
}
