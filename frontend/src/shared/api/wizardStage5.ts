import type {
  AgentAppearance,
  AgentAppearanceSettings,
  ChatReply,
  PublishResult,
} from "../../api/contracts/wizardStage5";
import { apiFetch } from "./client";

const agentPath = (agentId: string) => `/agents/${encodeURIComponent(agentId)}`;

export function sendTestMessage(
  token: string,
  agentId: string,
  message: string,
  conversationId?: string,
): Promise<ChatReply> {
  return apiFetch<ChatReply>(`${agentPath(agentId)}/chat`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation_id: conversationId, is_test: true }),
  });
}

export function getAgentAppearance(token: string, agentId: string): Promise<AgentAppearance> {
  return apiFetch<AgentAppearance>(`${agentPath(agentId)}/appearance`, { token });
}

export function updateAgentColor(
  token: string,
  agentId: string,
  primaryColor: string,
): Promise<AgentAppearanceSettings> {
  return apiFetch<AgentAppearanceSettings>(`${agentPath(agentId)}/appearance`, {
    token,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ primary_color: primaryColor }),
  });
}

export function uploadAgentLogo(token: string, agentId: string, file: File): Promise<AgentAppearance> {
  const body = new FormData();
  body.set("file", file);
  return apiFetch<AgentAppearance>(`${agentPath(agentId)}/appearance/logo`, {
    token,
    method: "POST",
    body,
  });
}

export function publishAgent(token: string, agentId: string): Promise<PublishResult> {
  return apiFetch<PublishResult>(`${agentPath(agentId)}/publish`, { token, method: "POST" });
}
