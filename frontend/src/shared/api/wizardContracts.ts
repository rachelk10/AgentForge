import type { Template } from "../../api/contracts/templates";
import { templatesPath } from "../../api/contracts/templates";
import type { WizardDraft } from "../../api/contracts/wizardDraft";
import { wizardDraftPath } from "../../api/contracts/wizardDraft";
import type {
  FreeTextSourceInput,
  InformationSource,
  InformationSourceUpdate,
  WebsiteScanResult,
  WebsiteSourceInput,
} from "../../api/contracts/informationSources";
import {
  documentsPath,
  informationSourcesPath,
  websiteImportPath,
  websiteScanPath,
} from "../../api/contracts/informationSources";
import { apiFetch } from "./client";
import type { components } from "../../api/generated/openapi";

type Agent = components["schemas"]["AgentResponse"];
type NewAgent = components["schemas"]["AgentCreate"];
type AgentChanges = components["schemas"]["AgentUpdate"];
type Document = components["schemas"]["DocumentResponse"];

export function getTemplates(token: string): Promise<Template[]> {
  return apiFetch<Template[]>(templatesPath, { token });
}

export function getWizardDraft(token: string): Promise<WizardDraft | null> {
  return apiFetch<WizardDraft | null>(wizardDraftPath, { token });
}

export function saveWizardDraft(token: string, draft: WizardDraft): Promise<WizardDraft> {
  return apiFetch<WizardDraft>(wizardDraftPath, {
    token,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
}

export function getAgents(token: string): Promise<Agent[]> {
  return apiFetch<Agent[]>("/agents", { token });
}

export function createAgent(token: string, agent: NewAgent): Promise<Agent> {
  return apiFetch<Agent>("/agents", {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(agent),
  });
}

export function updateAgent(token: string, agentId: string, changes: AgentChanges): Promise<Agent> {
  return apiFetch<Agent>(`/agents/${encodeURIComponent(agentId)}`, {
    token,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
}

export function getDocuments(token: string, agentId: string): Promise<Document[]> {
  return apiFetch<Document[]>(documentsPath(agentId), { token });
}

export function uploadDocument(token: string, agentId: string, file: File): Promise<Document> {
  const body = new FormData();
  body.set("file", file);
  return apiFetch<Document>(
    documentsPath(agentId),
    { token, method: "POST", body },
  );
}

export function deleteDocument(token: string, agentId: string, documentId: string): Promise<void> {
  return apiFetch<void>(
    `${documentsPath(agentId)}/${encodeURIComponent(documentId)}`,
    { token, method: "DELETE" },
  );
}

export function getInformationSources(token: string, agentId: string): Promise<InformationSource[]> {
  return apiFetch<InformationSource[]>(informationSourcesPath(agentId), { token });
}

export function addFreeTextSource(
  token: string,
  agentId: string,
  source: FreeTextSourceInput,
): Promise<InformationSource> {
  return apiFetch<InformationSource>(`${informationSourcesPath(agentId)}/text`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(source),
  });
}

export function scanWebsite(token: string, agentId: string, url: string): Promise<WebsiteScanResult> {
  return apiFetch<WebsiteScanResult>(websiteScanPath(agentId), {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

export function addWebsiteSource(
  token: string,
  agentId: string,
  source: WebsiteSourceInput,
): Promise<Document[]> {
  return apiFetch<Document[]>(websiteImportPath(agentId), {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(source),
  });
}

export function retryInformationSource(
  token: string,
  agentId: string,
  sourceId: string,
): Promise<InformationSource> {
  return apiFetch<InformationSource>(
    `${informationSourcesPath(agentId)}/${encodeURIComponent(sourceId)}/retry`,
    { token, method: "POST" },
  );
}

export function deleteInformationSource(token: string, agentId: string, sourceId: string): Promise<void> {
  return apiFetch<void>(`${informationSourcesPath(agentId)}/${encodeURIComponent(sourceId)}`, {
    token,
    method: "DELETE",
  });
}

export function updateInformationSource(
  token: string,
  agentId: string,
  sourceId: string,
  source: InformationSourceUpdate,
): Promise<InformationSource> {
  return apiFetch<InformationSource>(
    `${informationSourcesPath(agentId)}/${encodeURIComponent(sourceId)}`,
    {
      token,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(source),
    },
  );
}
