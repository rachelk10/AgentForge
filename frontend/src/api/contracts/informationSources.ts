export type SourceStatus = "pending" | "processing" | "ready" | "failed";

export type InformationSource = {
  id: string;
  kind: "text" | "website";
  title: string;
  content?: string;
  status: SourceStatus;
  failureReason?: string | null;
  pages?: string[];
};

export type WebsitePage = {
  url: string;
  title: string;
};

export type FreeTextSourceInput = {
  title: string;
  content: string;
};

export type WebsiteSourceInput = {
  url: string;
  pages: string[];
};

export type InformationSourceUpdate = {
  title: string;
  content?: string;
  pages?: string[];
};

export type WebsiteScanResult = {
  pages: WebsitePage[];
};

export const informationSourcesPath = (agentId: string) =>
  `/agents/${encodeURIComponent(agentId)}/information-sources`;

export const documentsPath = (agentId: string) =>
  `/agents/${encodeURIComponent(agentId)}/documents`;

export const websiteScanPath = (agentId: string) =>
  `${documentsPath(agentId)}/website/scan`;

export const websiteImportPath = (agentId: string) =>
  `${documentsPath(agentId)}/website`;
