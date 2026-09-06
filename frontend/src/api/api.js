const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";

function errorMessage(status, body) {
  const detail = body?.detail;
  const message = Array.isArray(detail)
    ? detail.map((item) => item.msg).join(", ")
    : detail || body?.message || "Request failed";
  return `API Error: ${status} - ${message}`;
}

async function request(path, { token, method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body,
  });

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const responseBody = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (response.status === 401) {
    localStorage.removeItem("agent-platform-token");
    window.dispatchEvent(new Event("auth-expired"));
  }

  if (!response.ok) throw new Error(errorMessage(response.status, responseBody));
  return responseBody;
}

function jsonRequest(path, token, method, payload) {
  return request(path, {
    token,
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

export const api = {
  login(email, password) {
    const body = new URLSearchParams({ username: email, password });
    return request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  },
  getAgents: (token) => request("/agents", { token }),
  createAgent: (token, payload) => jsonRequest("/agents", token, "POST", payload),
  deleteAgent: (token, agentId) => request(`/agents/${agentId}`, { token, method: "DELETE" }),
  getDocuments: (token, agentId) => request(`/agents/${agentId}/documents`, { token }),
  uploadDocument(token, agentId, file) {
    const formData = new FormData();
    formData.append("file", file);
    return request(`/agents/${agentId}/documents`, { token, method: "POST", body: formData });
  },
  deleteDocument: (token, agentId, documentId) =>
    request(`/agents/${agentId}/documents/${documentId}`, { token, method: "DELETE" }),
  getSkills: (token) => request("/skills", { token }),
  createSkill: (token, payload) => jsonRequest("/skills", token, "POST", payload),
  deleteSkill: (token, skillId) => request(`/skills/${skillId}`, { token, method: "DELETE" }),
  enableSkillForAgent: (token, skillId, agentId) =>
    request(`/skills/${skillId}/agents/${agentId}`, { token, method: "PUT" }),
  disableSkillForAgent: (token, skillId, agentId) =>
    request(`/skills/${skillId}/agents/${agentId}`, { token, method: "DELETE" }),
  getTools: (token) => request("/tools", { token }),
  createTool: (token, payload) => jsonRequest("/tools", token, "POST", payload),
  deleteTool: (token, toolId) => request(`/tools/${toolId}`, { token, method: "DELETE" }),
  enableToolForAgent: (token, toolId, agentId) =>
    request(`/tools/${toolId}/agents/${agentId}`, { token, method: "PUT" }),
  disableToolForAgent: (token, toolId, agentId) =>
    request(`/tools/${toolId}/agents/${agentId}`, { token, method: "DELETE" }),
  chat: (token, agentId, payload) => jsonRequest(`/agents/${agentId}/chat`, token, "POST", payload),
};