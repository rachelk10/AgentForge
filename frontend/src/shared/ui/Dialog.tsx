import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

type DialogProps = {
  open: boolean;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
};

export function Dialog({ open, titleId, onClose, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
      <button type="button" aria-label={t("ui.close")} onClick={onClose}>
        {t("ui.close")}
      </button>
    </dialog>
  );
}
