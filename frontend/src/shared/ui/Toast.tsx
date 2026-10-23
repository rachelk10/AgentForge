import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function Toast({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="toast">
      {children}
      <button type="button" aria-label={t("ui.dismiss")} onClick={onDismiss}>
        {t("ui.close")}
      </button>
    </div>
  );
}
