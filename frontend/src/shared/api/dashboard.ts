import type { components } from "../../api/generated/openapi";
import { apiFetch } from "./client";

export type Agent = components["schemas"]["AgentResponse"];
export type DashboardOverview = components["schemas"]["DashboardOverviewResponse"];
export type DashboardConversationPage = components["schemas"]["DashboardConversationPage"];
export type DashboardConversation = components["schemas"]["DashboardConversationResponse"];
export type ConversationWithMessages = components["schemas"]["ConversationWithMessages"];

const agentPath = (agentId: string) => `/agents/${encodeURIComponent(agentId)}`;

export function getAgents(token: string): Promise<Agent[]> {
  return apiFetch<Agent[]>("/agents", { token });
}

export function getDashboardOverview(token: string, agentId: string): Promise<DashboardOverview> {
  return apiFetch<DashboardOverview>(`${agentPath(agentId)}/dashboard/overview`, { token });
}

export function updateAgentStatus(token: string, agentId: string, isActive: boolean): Promise<Agent> {
  return apiFetch<Agent>(agentPath(agentId), {
    token,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive }),
  });
}

export function getDashboardConversations(
  token: string,
  agentId: string,
  options: { search?: string; tag?: string; limit?: number; offset?: number },
): Promise<DashboardConversationPage> {
  const query = new URLSearchParams();
  if (options.search) query.set("search", options.search);
  if (options.tag) query.set("tag", options.tag);
  if (options.limit !== undefined) query.set("limit", String(options.limit));
  if (options.offset !== undefined) query.set("offset", String(options.offset));
  return apiFetch<DashboardConversationPage>(
    `${agentPath(agentId)}/dashboard/conversations?${query.toString()}`,
    { token },
  );
}

export function getConversation(
  token: string,
  agentId: string,
  conversationId: string,
): Promise<ConversationWithMessages> {
  return apiFetch<ConversationWithMessages>(
    `${agentPath(agentId)}/conversations/${encodeURIComponent(conversationId)}`,
    { token },
  );
}
