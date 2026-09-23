import { useEffect, useState } from "react";
import { api } from "./api/api";

const TOKEN_KEY = "agent-platform-token";

function errorText(error) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function JsonField({ label, value, onChange }) {
  return (
    <label>
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows="3" />
    </label>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [skills, setSkills] = useState([]);
  const [agentSkills, setAgentSkills] = useState([]);
  const [tools, setTools] = useState([]);
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState({});
  const [agentName, setAgentName] = useState("");
  const [selectedToolIds, setSelectedToolIds] = useState([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState([]);
  const [toolForm, setToolForm] = useState({
    name: "",
    description: "",
    inputSchema: "{}",
    outputSchema: "{}",
    executionLogic: "",
  });

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);

  async function runLoading(key, action) {
    setError("");
    setLoading((current) => ({ ...current, [key]: true }));
    try {
      return await action();
    } catch (requestError) {
      setError(errorText(requestError));
      return null;
    } finally {
      setLoading((current) => ({ ...current, [key]: false }));
    }
  }

  async function loadAgents() {
    const data = await runLoading("agents", () => api.getAgents(token));
    if (!data) return;
    setAgents(data);
    setSelectedAgentId((current) => (data.some((agent) => agent.id === current) ? current : data[0]?.id || ""));
  }

  async function loadGlobalResources() {
    const [skillData, toolData] = await Promise.all([
      runLoading("skills", () => api.getSkills(token)),
      runLoading("tools", () => api.getTools(token)),
    ]);
    if (skillData) setSkills(skillData);
    if (toolData) setTools(toolData);
  }

  async function loadAgentSkills(agentId = selectedAgentId) {
    if (!agentId) return;
    const data = await runLoading("agentSkills", () => api.getAgentSkills(token, agentId));
    if (data) setAgentSkills(data);
  }

  async function loadDocuments(agentId = selectedAgentId) {
    if (!agentId) return;
    const data = await runLoading("documents", () => api.getDocuments(token, agentId));
    if (data) setDocuments(data);
  }

  useEffect(() => {
    if (!token) return;
    loadAgents();
    loadGlobalResources();
  }, [token]);

  useEffect(() => {
    const handleAuthExpired = () => setToken("");
    window.addEventListener("auth-expired", handleAuthExpired);
    return () => window.removeEventListener("auth-expired", handleAuthExpired);
  }, []);

  useEffect(() => {
    setDocuments([]);
    setAgentSkills([]);
    setMessages([]);
    setConversationId(null);
    if (token && selectedAgentId) {
      loadDocuments(selectedAgentId);
      loadAgentSkills(selectedAgentId);
    }
  }, [selectedAgentId]);

  async function login(event) {
    event.preventDefault();
    const response = await runLoading("login", () => api.login(email, password));
    if (!response) return;
    localStorage.setItem(TOKEN_KEY, response.access_token);
    setToken(response.access_token);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setAgents([]);
  }

  async function createAgent(event) {
    event.preventDefault();
    const created = await runLoading("createAgent", () => api.createAgent(token, { name: agentName }));
    if (created) {
      setAgentName("");
      await Promise.all(
        selectedToolIds.map((toolId) => api.enableToolForAgent(token, toolId, created.id)),
      );
      await Promise.all(
        selectedSkillIds.map((skillId) => api.enableSkillForAgent(token, skillId, created.id)),
      );
      setSelectedToolIds([]);
      setSelectedSkillIds([]);
      await loadAgents();
      setSelectedAgentId(created.id);
    }
  }

  async function uploadDocument(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedAgentId) return;
    const uploaded = await runLoading("upload", () => api.uploadDocument(token, selectedAgentId, file));
    if (uploaded) loadDocuments();
  }

  async function createTool(event) {
    event.preventDefault();
    let input_schema;
    let output_schema;
    try {
      input_schema = JSON.parse(toolForm.inputSchema);
      output_schema = JSON.parse(toolForm.outputSchema);
    } catch {
      setError("Tool input_schema and output_schema must be valid JSON.");
      return;
    }
    const created = await runLoading("createTool", () => api.createTool(token, {
      name: toolForm.name,
      description: toolForm.description,
      input_schema,
      output_schema,
      execution_logic: toolForm.executionLogic,
    }));
    if (created) {
      setToolForm({ name: "", description: "", inputSchema: "{}", outputSchema: "{}", executionLogic: "" });
      loadGlobalResources();
    }
  }

  async function sendChat(event) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || !selectedAgentId) return;
    setMessages((current) => [...current, { role: "user", content: message }]);
    setChatInput("");
    const response = await runLoading("chat", () => api.chat(token, selectedAgentId, {
      message,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }));
    if (response) {
      setConversationId(response.conversation_id);
      setMessages((current) => [...current, response.message]);
    }
  }

  if (!token) {
    return <main className="login"><h1>Agent Platform Admin</h1><form onSubmit={login}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button disabled={loading.login}>Login</button>{loading.login && <span>Loading...</span>} {error && <p className="error">{error}</p>}</form></main>;
  }

  return (
    <main>
      <header><h1>Agent Platform Admin/Test</h1><button onClick={logout}>Logout</button></header>
      {error && <p className="error">{error}</p>}
      <section>
        <h2>Agent</h2>
        <select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)} disabled={loading.agents}>
          <option value="">Select Agent</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
        <button onClick={loadAgents} disabled={loading.agents}>Refresh Agents</button> {loading.agents && <span>Loading...</span>}
        {selectedAgent && <p>Selected: <strong>{selectedAgent.name}</strong> ({selectedAgent.model})</p>}
        <form onSubmit={createAgent}>
          <label>New agent name<input placeholder="New agent name" value={agentName} onChange={(event) => setAgentName(event.target.value)} required /></label>
          <fieldset>
            <legend>Tools for this agent</legend>
            {tools.length === 0 ? <p>No tools are available.</p> : tools.map((tool) => (
              <label key={tool.id}>
                <input
                  type="checkbox"
                  checked={selectedToolIds.includes(tool.id)}
                  onChange={(event) => setSelectedToolIds((current) => event.target.checked
                    ? [...current, tool.id]
                    : current.filter((toolId) => toolId !== tool.id))}
                />
                {tool.name} - {tool.description}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Skills for this agent</legend>
            {skills.length === 0 ? <p>No skills are available.</p> : skills.map((skill) => (
              <label key={skill.id}>
                <input
                  type="checkbox"
                  checked={selectedSkillIds.includes(skill.id)}
                  onChange={(event) => setSelectedSkillIds((current) => event.target.checked
                    ? [...current, skill.id]
                    : current.filter((skillId) => skillId !== skill.id))}
                />
                {skill.name} - {skill.description}
              </label>
            ))}
          </fieldset>
          <button disabled={loading.createAgent}>Create Agent</button>
        </form>
        {selectedAgent && <button className="danger" onClick={() => runLoading("deleteAgent", async () => { await api.deleteAgent(token, selectedAgent.id); await loadAgents(); })}>Delete Selected Agent</button>}
      </section>

      <section>
        <h2>Tools</h2><p>Available Tools. Select an Agent to enable or remove a tool for that Agent.</p>
        <button onClick={loadGlobalResources} disabled={loading.tools}>Refresh Tools</button> {loading.tools && <span>Loading...</span>}
        <ul>{tools.map((tool) => <li key={tool.id}><strong>{tool.name}</strong>: {tool.description} <button disabled={!selectedAgentId} onClick={() => runLoading(`tool-add-${tool.id}`, () => api.enableToolForAgent(token, tool.id, selectedAgentId))}>Enable for Agent</button> <button disabled={!selectedAgentId} onClick={() => runLoading(`tool-remove-${tool.id}`, () => api.disableToolForAgent(token, tool.id, selectedAgentId))}>Remove from Agent</button> <button className="danger" onClick={() => runLoading(`tool-delete-${tool.id}`, async () => { await api.deleteTool(token, tool.id); await loadGlobalResources(); })}>Delete</button></li>)}</ul>
        <form onSubmit={createTool}><h3>Create Tool</h3><label>Name<input value={toolForm.name} onChange={(event) => setToolForm({ ...toolForm, name: event.target.value })} required /></label><label>Description<input value={toolForm.description} onChange={(event) => setToolForm({ ...toolForm, description: event.target.value })} required /></label><JsonField label="Input schema (JSON)" value={toolForm.inputSchema} onChange={(inputSchema) => setToolForm({ ...toolForm, inputSchema })} /><JsonField label="Output schema (JSON)" value={toolForm.outputSchema} onChange={(outputSchema) => setToolForm({ ...toolForm, outputSchema })} /><label>Execution logic<input value={toolForm.executionLogic} onChange={(event) => setToolForm({ ...toolForm, executionLogic: event.target.value })} required /></label><button disabled={loading.createTool}>Create Tool</button></form>
      </section>

      {!selectedAgent && <p>Select or create an Agent to test documents, skills, tools, and chat.</p>}
      {selectedAgent && <>
        <section>
          <h2>Documents</h2>
          <input type="file" onChange={uploadDocument} disabled={loading.upload} /> {loading.upload && <span>Loading...</span>}
          <button onClick={() => loadDocuments()} disabled={loading.documents}>Refresh Documents</button>
          {loading.documents ? <p>Loading...</p> : <ul>{documents.map((document) => <li key={document.id}><strong>{document.filename}</strong> | {document.status} | {document.file_size} bytes {document.metadata_?.chunk_count != null && `| ${document.metadata_.chunk_count} chunks`} <button className="danger" onClick={() => runLoading(`document-${document.id}`, async () => { await api.deleteDocument(token, selectedAgentId, document.id); await loadDocuments(); })}>Delete</button></li>)}</ul>}
        </section>

        <section>
          <h2>Skills</h2>
          <button onClick={() => { loadGlobalResources(); loadAgentSkills(); }} disabled={loading.skills || loading.agentSkills}>Refresh Skills</button> {loading.skills || loading.agentSkills ? <span>Loading...</span> : null}
          <ul>{skills.map((skill) => {
            const assignment = agentSkills.find((item) => item.skill.id === skill.id);
            return <li key={skill.id}>
              <strong>{skill.name}</strong>: {skill.description} | {assignment ? assignment.status : "not assigned"}
              {assignment?.missing_required_tools?.length ? ` | Missing: ${assignment.missing_required_tools.join(", ")}` : null}
              {!assignment && <button onClick={() => runLoading(`skill-add-${skill.id}`, async () => { await api.enableSkillForAgent(token, skill.id, selectedAgentId); await loadAgentSkills(); })}>Attach</button>}
              {assignment && <button onClick={() => runLoading(`skill-toggle-${skill.id}`, async () => { const action = assignment.enabled ? api.disableSkillForAgent : api.enableSkillForAgent; await action(token, skill.id, selectedAgentId); await loadAgentSkills(); })}>{assignment.enabled ? "Disable" : "Enable"}</button>}
              {assignment && <button onClick={() => runLoading(`skill-remove-${skill.id}`, async () => { await api.removeSkillFromAgent(token, skill.id, selectedAgentId); await loadAgentSkills(); })}>Remove</button>}
            </li>;
          })}</ul>
        </section>

        <section>
          <h2>Chat</h2>
          <div className="messages">{messages.map((message, index) => <p key={`${message.id || "new"}-${index}`} className={message.role}><strong>{message.role === "user" ? "User" : "Agent"}:</strong> {message.content}</p>)}</div>
          <form className="inline-form" onSubmit={sendChat}><input placeholder="Write a message..." value={chatInput} onChange={(event) => setChatInput(event.target.value)} disabled={loading.chat} /><button disabled={loading.chat}>Send</button>{loading.chat && <span>Loading...</span>}</form>
        </section>
      </>}
    </main>
  );
}