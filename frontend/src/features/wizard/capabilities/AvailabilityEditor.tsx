import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui";
import type { Availability, TimeRange, Weekday } from "./configForm";
import { weekdays } from "./configForm";

const DEFAULT_RANGE: TimeRange = { start: "09:00", end: "17:00" };

type Props = {
  id: string;
  value: Availability;
  onChange: (value: Availability) => void;
  describedBy?: string;
};

export function AvailabilityEditor({ id, value, onChange, describedBy }: Props) {
  const { t } = useTranslation();
  const base = "wizard.capabilities.availability";

  const setRanges = (day: Weekday, ranges: TimeRange[]) => onChange({ ...value, [day]: ranges });
  const updateRange = (day: Weekday, index: number, patch: Partial<TimeRange>) =>
    setRanges(
      day,
      (value[day] ?? []).map((range, position) => (position === index ? { ...range, ...patch } : range)),
    );

  return (
    <div id={id} className="availability" role="group" aria-describedby={describedBy}>
      {weekdays.map((day) => {
        const ranges = value[day] ?? [];
        const dayName = t(`${base}.days.${day}`);
        return (
          <div key={day} className="availability__day">
            <label className="availability__toggle">
              <input
                type="checkbox"
                checked={ranges.length > 0}
                onChange={(event) => setRanges(day, event.target.checked ? [{ ...DEFAULT_RANGE }] : [])}
              />
              <span>{dayName}</span>
            </label>
            {ranges.length === 0 ? (
              <span className="availability__closed">{t(`${base}.closed`)}</span>
            ) : (
              <div className="availability__ranges">
                {ranges.map((range, index) => (
                  <div key={index} className="availability__range">
                    <label>
                      <span className="visually-hidden">{`${dayName} ${t(`${base}.from`)}`}</span>
                      <input
                        type="time"
                        value={range.start}
                        onChange={(event) => updateRange(day, index, { start: event.target.value })}
                      />
                    </label>
                    <span aria-hidden="true">–</span>
                    <label>
                      <span className="visually-hidden">{`${dayName} ${t(`${base}.to`)}`}</span>
                      <input
                        type="time"
                        value={range.end}
                        onChange={(event) => updateRange(day, index, { end: event.target.value })}
                      />
                    </label>
                    <Button
                      type="button"
                      aria-label={t(`${base}.remove`, { day: dayName })}
                      onClick={() =>
                        setRanges(
                          day,
                          ranges.filter((_, position) => position !== index),
                        )
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button type="button" onClick={() => setRanges(day, [...ranges, { start: "17:00", end: "18:00" }])}>
                  {t(`${base}.addRange`)}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
