import type { components } from "../../api/generated/openapi";
import { apiFetch } from "./client";

export type Capability = components["schemas"]["CapabilityResponse"];
export type ConfigField = components["schemas"]["ConfigField"];
export type AgentCapability = components["schemas"]["AgentCapabilityResponse"];
export type AgentCapabilityInput = components["schemas"]["AgentCapabilityUpdate"];
export type SkillCatalogItem = components["schemas"]["SkillCatalogResponse"];
export type SkillAssignment = components["schemas"]["SkillAssignmentResponse"];

export function getCapabilities(token: string): Promise<Capability[]> {
  return apiFetch<Capability[]>("/capabilities", { token });
}

export function getAgentCapabilities(token: string, agentId: string): Promise<AgentCapability[]> {
  return apiFetch<AgentCapability[]>(`/agents/${encodeURIComponent(agentId)}/capabilities`, { token });
}

export function saveAgentCapability(
  token: string,
  agentId: string,
  capabilityId: string,
  input: AgentCapabilityInput,
): Promise<AgentCapability> {
  return apiFetch<AgentCapability>(
    `/agents/${encodeURIComponent(agentId)}/capabilities/${encodeURIComponent(capabilityId)}`,
    {
      token,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function getSkills(token: string): Promise<SkillCatalogItem[]> {
  return apiFetch<SkillCatalogItem[]>("/skills", { token });
}

export function getAgentSkills(token: string, agentId: string): Promise<SkillAssignment[]> {
  return apiFetch<SkillAssignment[]>(`/agents/${encodeURIComponent(agentId)}/skills`, { token });
}

export function setAgentSkill(token: string, agentId: string, skillId: string, enabled: boolean): Promise<void> {
  return apiFetch<void>(`/skills/${encodeURIComponent(skillId)}/agents/${encodeURIComponent(agentId)}`, {
    token,
    method: enabled ? "PUT" : "DELETE",
  });
}
