import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { InformationFailure } from "../../api/contracts/wizardDraft";
import type { InformationSource, WebsitePage } from "../../api/contracts/informationSources";
import type { components } from "../../api/generated/openapi";
import {
  addFreeTextSource,
  addWebsiteSource,
  deleteDocument,
  deleteInformationSource,
  getDocuments,
  getInformationSources,
  retryInformationSource,
  scanWebsite,
  updateInformationSource,
  uploadDocument,
} from "../../shared/api/wizardContracts";
import { Button, Card, Dialog, Input, Skeleton } from "../../shared/ui";

type Document = components["schemas"]["DocumentResponse"];
type SourceStatus = "pending" | "processing" | "ready" | "failed";
type SourceKind = "file" | "text" | "website";
type DisplaySource = {
  id: string;
  apiId?: string;
  kind: SourceKind;
  title: string;
  status: SourceStatus;
  reason?: string;
  content?: string;
  pages?: string[];
};

const freeTextSchema = z.object({
  title: z.string().trim().min(1, "titleRequired"),
  content: z.string().trim().min(1, "contentRequired"),
});

const websiteSchema = z.object({
  url: z.string().trim().url("invalidUrl"),
});

const allowedExtensions = [".pdf", ".docx", ".txt", ".md"];
const acceptedFileTypes = ".pdf,.docx,.txt,.md";

function getDocumentStatus(status: string): SourceStatus {
  const normalized = status.toLowerCase();
  if (["ready", "processed", "complete", "completed"].includes(normalized)) return "ready";
  if (["failed", "error"].includes(normalized)) return "failed";
  if (["pending", "queued"].includes(normalized)) return "pending";
  return "processing";
}

function mapDocuments(documents: Document[]): DisplaySource[] {
  return documents.map((document) => {
    const isWebsite = document.metadata_?.source_type === "website";
    return {
      id: `${isWebsite ? "website" : "file"}-${document.id}`,
      apiId: document.id,
      kind: isWebsite ? "website" : "file",
      title: isWebsite ? document.metadata_?.source_url ?? document.filename : document.filename,
      status: getDocumentStatus(document.status),
      pages: isWebsite && document.metadata_?.source_url ? [document.metadata_.source_url] : undefined,
    };
  });
}

function mapSources(sources: InformationSource[]): DisplaySource[] {
  return sources.map((source) => ({
    id: `source-${source.id}`,
    apiId: source.id,
    kind: source.kind,
    title: source.title,
    status: source.status,
    reason: source.failureReason ?? undefined,
    content: source.content,
    pages: source.pages,
  }));
}

function isAllowedFile(file: File) {
  const filename = file.name.toLowerCase();
  return allowedExtensions.some((extension) => filename.endsWith(extension));
}

export function InformationStep({
  agentId,
  token,
  failures,
  onFailuresChange,
  onSkip,
}: {
  agentId: string;
  token: string;
  failures: InformationFailure[];
  onFailuresChange: (failures: InformationFailure[]) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"files" | "text" | "website">("files");
  const [uploading, setUploading] = useState(false);
  const [busySource, setBusySource] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [scanFailed, setScanFailed] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [scanPages, setScanPages] = useState<WebsitePage[]>([]);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<DisplaySource | null>(null);
  const [editingSource, setEditingSource] = useState<DisplaySource | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const retryTarget = useRef<DisplaySource | null>(null);
  const retainedFiles = useRef(new Map<string, File>());

  const documentsQuery = useQuery({
    queryKey: ["documents", agentId],
    queryFn: () => getDocuments(token, agentId),
    refetchInterval: (query) =>
      query.state.data?.some((document) => ["pending", "processing", "queued"].includes(document.status.toLowerCase()))
        ? 3000
        : false,
  });
  const sourcesQuery = useQuery({
    queryKey: ["information-sources", agentId],
    queryFn: () => getInformationSources(token, agentId),
    refetchInterval: (query) =>
      query.state.data?.some((source) => source.status === "pending" || source.status === "processing") ? 3000 : false,
  });

  const freeTextForm = useForm<{ title: string; content: string }>({
    resolver: zodResolver(freeTextSchema) as never,
    defaultValues: { title: "", content: "" },
  });
  const websiteForm = useForm<{ url: string }>({
    resolver: zodResolver(websiteSchema) as never,
    defaultValues: { url: "" },
  });

  const refreshSources = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["documents", agentId] }),
      queryClient.invalidateQueries({ queryKey: ["information-sources", agentId] }),
    ]);
  };

  const updateFailureList = (next: InformationFailure[]) => {
    onFailuresChange(next);
  };

  const uploadFiles = async (files: FileList | File[], replacing?: DisplaySource) => {
    setFileError(null);
    setActionError(null);
    setScanFailed(false);
    const selected = Array.from(files);
    if (replacing && selected.length > 1) selected.splice(1);
    for (const file of selected) {
      const failureId = replacing?.id.startsWith("failed-")
        ? replacing.id.slice("failed-".length)
        : undefined;
      if (!isAllowedFile(file)) {
        const id = failureId ?? crypto.randomUUID();
        retainedFiles.current.set(id, file);
        updateFailureList([
          ...failures.filter((failure) => failure.id !== id),
          { id, filename: file.name },
        ]);
        setFileError(t("wizard.information.unsupportedFile"));
        continue;
      }

      setUploading(true);
      try {
        await uploadDocument(token, agentId, file);
        if (replacing?.kind === "file" && replacing.apiId) {
          await deleteDocument(token, agentId, replacing.apiId);
        }
        if (failureId) {
          retainedFiles.current.delete(failureId);
          updateFailureList(failures.filter((failure) => failure.id !== failureId));
        }
        await refreshSources();
      } catch {
        const id = failureId ?? crypto.randomUUID();
        retainedFiles.current.set(id, file);
        updateFailureList([
          ...failures.filter((failure) => failure.id !== id),
          { id, filename: file.name },
        ]);
        setFileError(t("wizard.information.uploadError"));
      } finally {
        setUploading(false);
      }
    }
  };

  const handleFileInput = (files: FileList | null) => {
    if (!files?.length) return;
    const target = retryTarget.current ?? undefined;
    retryTarget.current = null;
    void uploadFiles(files, target);
    if (fileInput.current) fileInput.current.value = "";
  };

  const submitFreeText = freeTextForm.handleSubmit(async (values) => {
    setActionError(null);
    setScanFailed(false);
    setBusySource("text");
    try {
      if (editingSource?.kind === "text" && editingSource.apiId) {
        await updateInformationSource(token, agentId, editingSource.apiId, values);
      } else {
        await addFreeTextSource(token, agentId, values);
      }
      freeTextForm.reset();
      setEditingSource(null);
      await refreshSources();
    } catch {
      setActionError(t("wizard.information.sourceActionError"));
    } finally {
      setBusySource(null);
    }
  });

  const submitScan = websiteForm.handleSubmit(async ({ url }) => {
    setActionError(null);
    setScanFailed(false);
    setBusySource("scan");
    try {
      const result = await scanWebsite(token, agentId, url);
      setScanPages(result.pages);
      setSelectedPages(result.pages.map((page) => page.url));
    } catch {
      setActionError(t("wizard.information.scanError"));
      setScanFailed(true);
    } finally {
      setBusySource(null);
    }
  });

  const submitWebsite = async () => {
    const values = websiteForm.getValues();
    const parsed = websiteSchema.safeParse(values);
    if (!parsed.success) {
      await websiteForm.trigger();
      return;
    }
    if (selectedPages.length === 0) return;
    setActionError(null);
    setScanFailed(false);
    setBusySource("website");
    try {
      await addWebsiteSource(token, agentId, { url: parsed.data.url, pages: selectedPages });
      if (editingSource?.kind === "website" && editingSource.apiId) {
        await deleteDocument(token, agentId, editingSource.apiId);
      }
      websiteForm.reset();
      setScanPages([]);
      setSelectedPages([]);
      setEditingSource(null);
      await refreshSources();
    } catch {
      setActionError(t("wizard.information.sourceActionError"));
    } finally {
      setBusySource(null);
    }
  };

  const documents = documentsQuery.data ? mapDocuments(documentsQuery.data) : [];
  const otherSources = sourcesQuery.data ? mapSources(sourcesQuery.data) : [];
  const failedUploads: DisplaySource[] = failures.map((failure) => ({
    id: `failed-${failure.id}`,
    kind: "file",
    title: failure.filename,
    status: "failed",
    reason: t("wizard.information.uploadError"),
  }));
  const allSources = [...documents, ...otherSources, ...failedUploads];
  const sourceQueryError = documentsQuery.isError || sourcesQuery.isError;

  const requestRemove = (source: DisplaySource) => setRemoveTarget(source);

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setBusySource(removeTarget.id);
    setActionError(null);
    setScanFailed(false);
    try {
      if (removeTarget.id.startsWith("failed-")) {
        const id = removeTarget.id.slice("failed-".length);
        retainedFiles.current.delete(id);
        updateFailureList(failures.filter((failure) => failure.id !== id));
      } else if ((removeTarget.kind === "file" || removeTarget.kind === "website") && removeTarget.apiId) {
        await deleteDocument(token, agentId, removeTarget.apiId);
        await queryClient.invalidateQueries({ queryKey: ["documents", agentId] });
      } else if (removeTarget.apiId) {
        await deleteInformationSource(token, agentId, removeTarget.apiId);
        await queryClient.invalidateQueries({ queryKey: ["information-sources", agentId] });
      }
      setRemoveTarget(null);
    } catch {
      setActionError(t("wizard.information.sourceActionError"));
    } finally {
      setBusySource(null);
    }
  };

  const retrySource = async (source: DisplaySource) => {
    if (source.kind === "file") {
      const failedId = source.id.startsWith("failed-") ? source.id.slice("failed-".length) : null;
      const retained = failedId ? retainedFiles.current.get(failedId) : undefined;
      if (retained) {
        await uploadFiles([retained], source);
        return;
      }
      retryTarget.current = source;
      fileInput.current?.click();
      return;
    }
    if (source.kind === "website" && source.apiId) {
      setBusySource(source.id);
      setActionError(null);
      setScanFailed(false);
      try {
        await addWebsiteSource(token, agentId, {
          url: source.title,
          pages: [source.title],
        });
        await deleteDocument(token, agentId, source.apiId);
        await queryClient.invalidateQueries({ queryKey: ["documents", agentId] });
      } catch {
        setActionError(t("wizard.information.sourceActionError"));
      } finally {
        setBusySource(null);
      }
      return;
    }
    if (!source.apiId) return;
    setBusySource(source.id);
    setActionError(null);
    setScanFailed(false);
    try {
      await retryInformationSource(token, agentId, source.apiId);
      await queryClient.invalidateQueries({ queryKey: ["information-sources", agentId] });
    } catch {
      setActionError(t("wizard.information.sourceActionError"));
    } finally {
      setBusySource(null);
    }
  };

  const replaceSource = (source: DisplaySource) => {
    if (source.kind === "file") {
      retryTarget.current = source;
      fileInput.current?.click();
      return;
    }
    setEditingSource(source);
    if (source.kind === "text") {
      setActiveTab("text");
      freeTextForm.reset({ title: source.title, content: source.content ?? "" });
      return;
    }
    setActiveTab("website");
    websiteForm.reset({ url: source.title });
    const pages = (source.pages ?? []).map((url) => ({ url, title: url }));
    setScanPages(pages);
    setSelectedPages(pages.map((page) => page.url));
  };

  const cancelEditing = () => {
    setEditingSource(null);
    freeTextForm.reset();
    websiteForm.reset();
    setScanPages([]);
    setSelectedPages([]);
  };

  const queryLoading = documentsQuery.isPending || sourcesQuery.isPending;

  return (
    <section className="information-step" aria-label={t("wizard.information.sectionLabel")}>
      <div className="information-tabs" role="tablist" aria-label={t("wizard.information.tabsLabel")}>
        {(["files", "text", "website"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`information-panel-${tab}`}
            id={`information-tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const tabs = ["files", "text", "website"] as const;
              const currentIndex = tabs.indexOf(tab);
              const rtl = document.documentElement.dir === "rtl";
              const direction = event.key === "ArrowRight" ? (rtl ? -1 : 1) : (rtl ? 1 : -1);
              const nextIndex = event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : (currentIndex + direction + tabs.length) % tabs.length;
              setActiveTab(tabs[nextIndex]);
              document.getElementById(`information-tab-${tabs[nextIndex]}`)?.focus();
            }}
          >
            {t(`wizard.information.tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div
        id={`information-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`information-tab-${activeTab}`}
        className="information-panel"
      >
        {activeTab === "files" ? (
          <div>
            <label
              className={`information-dropzone${dragging ? " information-dropzone--active" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void uploadFiles(event.dataTransfer.files);
              }}
            >
              <span>{t("wizard.information.dropFiles")}</span>
              <span className="field-hint">{t("wizard.information.fileTypes")}</span>
              <input
                ref={fileInput}
                type="file"
                accept={acceptedFileTypes}
                multiple={!retryTarget.current}
                aria-label={t("wizard.information.chooseFiles")}
                onChange={(event) => handleFileInput(event.currentTarget.files)}
              />
            </label>
            {uploading ? <p role="status">{t("wizard.information.uploading")}</p> : null}
            {fileError ? <p className="field-error" role="alert">{fileError}</p> : null}
          </div>
        ) : null}

        {activeTab === "text" ? (
          <form className="information-form" onSubmit={submitFreeText} noValidate>
            <div className="field">
              <label htmlFor="information-text-title">{t("wizard.information.textTitle")}</label>
              <Input id="information-text-title" {...freeTextForm.register("title")} aria-invalid={Boolean(freeTextForm.formState.errors.title)} />
              {freeTextForm.formState.errors.title ? (
                <p className="field-error" role="alert">{t(`wizard.information.validation.${freeTextForm.formState.errors.title.message}`)}</p>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="information-text-content">{t("wizard.information.textContent")}</label>
              <textarea id="information-text-content" rows={6} {...freeTextForm.register("content")} aria-invalid={Boolean(freeTextForm.formState.errors.content)} />
              {freeTextForm.formState.errors.content ? (
                <p className="field-error" role="alert">{t(`wizard.information.validation.${freeTextForm.formState.errors.content.message}`)}</p>
              ) : null}
            </div>
            <div className="information-form-actions">
              <Button type="submit" disabled={busySource === "text"}>
                {editingSource?.kind === "text" ? t("wizard.information.saveChanges") : t("wizard.information.addText")}
              </Button>
              {editingSource?.kind === "text" ? (
                <Button type="button" onClick={cancelEditing}>{t("wizard.information.cancelEdit")}</Button>
              ) : null}
            </div>
          </form>
        ) : null}

        {activeTab === "website" ? (
          <div className="information-form">
            <form onSubmit={submitScan} noValidate>
              <div className="field">
                <label htmlFor="information-website-url">{t("wizard.information.websiteUrl")}</label>
                <p className="field-hint">{t("wizard.information.websiteScanNote")}</p>
                <Input
                  id="information-website-url"
                  type="url"
                  {...websiteForm.register("url", {
                    onChange: () => {
                      setActionError(null);
                      setScanFailed(false);
                    },
                  })}
                  aria-invalid={Boolean(websiteForm.formState.errors.url)}
                />
                {websiteForm.formState.errors.url ? (
                  <p className="field-error" role="alert">{t(`wizard.information.validation.${websiteForm.formState.errors.url.message}`)}</p>
                ) : null}
              </div>
              <Button type="submit" disabled={busySource === "scan"}>{t("wizard.information.scanWebsite")}</Button>
            </form>
            {scanPages.length ? (
              <fieldset className="information-pages">
                <legend>{t("wizard.information.choosePages")}</legend>
                <p>{t("wizard.information.selectedPages", { count: selectedPages.length })}</p>
                {scanPages.map((page) => (
                  <label key={page.url}>
                    <input
                      type="checkbox"
                      checked={selectedPages.includes(page.url)}
                      onChange={(event) =>
                        setSelectedPages((current) =>
                          event.target.checked
                            ? [...current, page.url]
                            : current.filter((url) => url !== page.url),
                        )
                      }
                    />
                    <span>{page.title}</span>
                    <span dir="ltr">{page.url}</span>
                  </label>
                ))}
                <Button type="button" disabled={!selectedPages.length || busySource === "website"} onClick={() => void submitWebsite()}>
                  {editingSource?.kind === "website"
                    ? t("wizard.information.saveChanges")
                    : t("wizard.information.addWebsite")}
                </Button>
                {editingSource?.kind === "website" ? (
                  <Button type="button" onClick={cancelEditing}>{t("wizard.information.cancelEdit")}</Button>
                ) : null}
              </fieldset>
            ) : null}
          </div>
        ) : null}
      </div>

      {busySource === "scan" ? <p role="status">{t("wizard.information.scanning")}</p> : null}
      {actionError ? (
        <div className="information-action-error" role="alert">
          <p className="field-error">{actionError}</p>
          {scanFailed ? (
            <Button type="button" disabled={busySource === "scan"} onClick={() => void submitScan()}>
              {t("wizard.information.retryScan")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <Card className="information-helper">
        <h2>{t("wizard.information.helperTitle")}</h2>
        <p>{t("wizard.information.helperDescription")}</p>
        <ul>
          <li>{t("wizard.information.helperFaq")}</li>
          <li>{t("wizard.information.helperPriceList")}</li>
          <li>{t("wizard.information.helperHours")}</li>
          <li>{t("wizard.information.helperPolicies")}</li>
        </ul>
      </Card>

      <section className="information-sources" aria-labelledby="information-sources-title">
        <h2 id="information-sources-title">{t("wizard.information.sourcesTitle")}</h2>
        {queryLoading ? (
          <div aria-label={t("wizard.information.loadingSources")}>
            <Skeleton className="information-source-skeleton" />
            <Skeleton className="information-source-skeleton" />
          </div>
        ) : sourceQueryError ? (
          <div className="information-empty" role="alert">
            <p>{t("wizard.information.sourcesError")}</p>
            <Button type="button" onClick={() => void Promise.all([documentsQuery.refetch(), sourcesQuery.refetch()])}>
              {t("app.retry")}
            </Button>
          </div>
        ) : allSources.length ? (
          <ul className="information-source-list">
            {allSources.map((source) => (
              <li key={source.id} className="information-source">
                <div className="information-source__details">
                  <strong>{source.title}</strong>
                  {source.pages?.length ? <span>{t("wizard.information.selectedPages", { count: source.pages.length })}</span> : null}
                  <span className={`information-status information-status--${source.status}`}>
                    {t(`wizard.information.status.${source.status}`)}
                  </span>
                  {source.status === "failed" ? (
                    <span className="field-error">
                      {source.reason ?? t("wizard.information.processingFailed")}
                    </span>
                  ) : null}
                </div>
                <div className="information-source__actions">
                  {source.status === "failed" ? (
                    <Button
                      type="button"
                      disabled={busySource === source.id || uploading}
                      onClick={() => void retrySource(source)}
                    >
                      {t("wizard.information.retry")}
                    </Button>
                  ) : null}
                  <Button type="button" disabled={uploading} onClick={() => replaceSource(source)}>
                    {t("wizard.information.replace")}
                  </Button>
                  <Button type="button" disabled={busySource === source.id} onClick={() => requestRemove(source)}>
                    {t("wizard.information.remove")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="information-empty">{t("wizard.information.noSources")}</p>
        )}
      </section>

      {!allSources.length && !queryLoading && !sourceQueryError ? (
        <Button type="button" className="information-skip" onClick={() => setSkipDialogOpen(true)}>
          {t("wizard.information.skip")}
        </Button>
      ) : null}

      <Dialog open={skipDialogOpen} titleId="information-skip-title" onClose={() => setSkipDialogOpen(false)}>
        <h2 id="information-skip-title">{t("wizard.information.skipTitle")}</h2>
        <p>{t("wizard.information.skipWarning")}</p>
        <div className="information-dialog-actions">
          <Button type="button" onClick={() => setSkipDialogOpen(false)}>{t("wizard.information.keepAdding")}</Button>
          <Button
            type="button"
            onClick={() => {
              setSkipDialogOpen(false);
              onSkip();
            }}
          >
            {t("wizard.information.continueWithout")}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(removeTarget)}
        titleId="information-remove-title"
        onClose={() => setRemoveTarget(null)}
      >
        <h2 id="information-remove-title">{t("wizard.information.removeTitle")}</h2>
        <p>{t("wizard.information.removeWarning", { name: removeTarget?.title ?? "" })}</p>
        <div className="information-dialog-actions">
          <Button type="button" onClick={() => setRemoveTarget(null)}>{t("wizard.information.cancelRemove")}</Button>
          <Button type="button" disabled={busySource === removeTarget?.id} onClick={() => void confirmRemove()}>
            {t("wizard.information.confirmRemove")}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
