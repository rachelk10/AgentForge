import { useCallback, useEffect, useRef, useState } from "react";
import type { WizardDraft } from "../../api/contracts/wizardDraft";
import { saveWizardDraft } from "../../shared/api/wizardContracts";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;

export function useAutosave(draft: WizardDraft, token: string) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const savedJson = useRef(JSON.stringify(draft));
  const pending = useRef<WizardDraft | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const toSave = pending.current;
    if (!toSave) return;
    pending.current = null;
    setStatus("saving");
    try {
      await saveWizardDraft(token, toSave);
      savedJson.current = JSON.stringify(toSave);
      setStatus("saved");
    } catch {
      pending.current ??= toSave;
      setStatus("error");
    }
  }, [token]);

  useEffect(() => {
    if (JSON.stringify(draft) === savedJson.current) return;
    pending.current = draft;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [draft, flush]);

  useEffect(() => {
    const handler = () => void flush();
    window.addEventListener("pagehide", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      void flush();
    };
  }, [flush]);

  return { status, retry: flush };
}
