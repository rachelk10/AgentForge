import { http, HttpResponse, passthrough, type RequestHandler } from "msw";

import type { InformationSource } from "../../../api/contracts/informationSources";
import type {
  PublicAgentProfile,
  PublicChatInteraction,
  PublicChatRequest,
} from "../../../api/contracts/publicChat";
import type { WizardDraft } from "../../../api/contracts/wizardDraft";
import { mockTemplates } from "./templates";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const DRAFT_STORAGE_KEY = "mock-wizard-draft";
const AGENTS_STORAGE_KEY = "mock-agents";
const DOCUMENTS_STORAGE_KEY = "mock-documents";
const SOURCES_STORAGE_KEY = "mock-information-sources";
const APPEARANCE_STORAGE_KEY = "mock-agent-appearance";
const CONVERSATIONS_STORAGE_KEY = "mock-conversations";

function readStoredDraft(): WizardDraft | null {
  const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
  return stored ? (JSON.parse(stored) as WizardDraft) : null;
}

function readStoredList<T>(key: string): T[] {
  const stored = localStorage.getItem(key);
  return stored ? (JSON.parse(stored) as T[]) : [];
}

function writeStoredList<T>(key: string, values: T[]) {
  localStorage.setItem(key, JSON.stringify(values));
}

function sourceKey(agentId: string) {
  return `${SOURCES_STORAGE_KEY}:${agentId}`;
}

function documentKey(agentId: string) {
  return `${DOCUMENTS_STORAGE_KEY}:${agentId}`;
}

function appearanceKey(agentId: string) {
  return `${APPEARANCE_STORAGE_KEY}:${agentId}`;
}

function publicAgentKey(publicKey: string) {
  return `mock-public-agent:${publicKey}`;
}

function conversationsKey(agentId: string) {
  return `${CONVERSATIONS_STORAGE_KEY}:${agentId}`;
}

function readStoredValue<T>(key: string, fallback: T): T {
  const stored = localStorage.getItem(key);
  return stored ? (JSON.parse(stored) as T) : fallback;
}

const testOnly = import.meta.env.MODE === "test";

function getPublicProfile(publicKey: string): PublicAgentProfile | null {
  const stored = localStorage.getItem(publicAgentKey(publicKey));
  if (stored) return JSON.parse(stored) as PublicAgentProfile;
  if (testOnly) return null;
  return {
    public_key: publicKey,
    agent_name: "Business assistant",
    opening_message: "How can I help you today?",
    language: "en",
    primary_color: "#2369a8",
    logo_data: null,
    is_active: true,
    paused_message: null,
  };
}

export const handlers: RequestHandler[] = [
  http.get(`${apiBaseUrl}/auth/me`, ({ request }) => {
    const authorization = request.headers.get("authorization");
    if (
      authorization !== "Bearer mock-google-access-token" &&
      authorization !== "Bearer stage1-test-token"
    ) {
      return passthrough();
    }
    return HttpResponse.json({
      id: authorization.includes("google") ? "mock-google-user" : "stage1-test-user",
      email: authorization.includes("google") ? "google-user@example.com" : "stage1@example.com",
      username: authorization.includes("google") ? "Google User" : "Stage One User",
      is_active: true,
      is_admin: false,
    });
  }),
  http.post(`${apiBaseUrl}/auth/google`, () =>
    HttpResponse.json({ access_token: "mock-google-access-token", token_type: "bearer" }),
  ),
  http.post(`${apiBaseUrl}/auth/password-recovery`, () =>
    HttpResponse.json({ accepted: true }, { status: 202 }),
  ),
  http.get(`${apiBaseUrl}/account/agent-state`, () =>
    HttpResponse.json(readStoredDraft() ? "draft" : "none"),
  ),
  http.get(`${apiBaseUrl}/templates`, () => HttpResponse.json(mockTemplates)),
  http.get(`${apiBaseUrl}/account/wizard-draft`, () => HttpResponse.json(readStoredDraft())),
  http.put(`${apiBaseUrl}/account/wizard-draft`, async ({ request }) => {
    const draft = (await request.json()) as WizardDraft;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return HttpResponse.json(draft);
  }),
  http.get(`${apiBaseUrl}/agents`, () => {
    if (!testOnly) return passthrough();
    return HttpResponse.json(readStoredList<Record<string, unknown>>(AGENTS_STORAGE_KEY));
  }),
  http.post(`${apiBaseUrl}/agents`, async ({ request }) => {
    if (!testOnly) return passthrough();
    const input = (await request.json()) as Record<string, unknown>;
    const agent = {
      id: crypto.randomUUID(),
      owner_id: "stage3-test-user",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      description: null,
      system_prompt: null,
      max_tokens: null,
      is_published: false,
      ...input,
    };
    const agents = readStoredList<Record<string, unknown>>(AGENTS_STORAGE_KEY);
    agents.push(agent);
    writeStoredList(AGENTS_STORAGE_KEY, agents);
    return HttpResponse.json(agent, { status: 201 });
  }),
  http.patch(`${apiBaseUrl}/agents/:agentId`, async ({ params, request }) => {
    if (!testOnly) return passthrough();
    const changes = (await request.json()) as Record<string, unknown>;
    const agents = readStoredList<Record<string, unknown>>(AGENTS_STORAGE_KEY);
    let agent = agents.find((item) => item.id === params.agentId);
    if (!agent) {
      agent = {
        id: String(params.agentId),
        owner_id: "stage5-test-user",
        description: null,
        system_prompt: null,
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: null,
        rag_top_k: 5,
        rag_similarity_threshold: 0.3,
        skills_top_k: 3,
        skills_similarity_threshold: 0.75,
        is_active: true,
        is_published: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      agents.push(agent);
    }
    Object.assign(agent, changes, { updated_at: new Date().toISOString() });
    writeStoredList(AGENTS_STORAGE_KEY, agents);
    return HttpResponse.json(agent);
  }),
  http.get(`${apiBaseUrl}/agents/:agentId/documents`, ({ params }) => {
    if (!testOnly) return passthrough();
    return HttpResponse.json(readStoredList<Record<string, unknown>>(documentKey(String(params.agentId))));
  }),
  http.post(`${apiBaseUrl}/agents/:agentId/documents`, ({ params }) => {
    if (!testOnly) return passthrough();
    const document = {
      id: crypto.randomUUID(),
      agent_id: String(params.agentId),
      filename: "test-upload.txt",
      content_type: "text/plain",
      file_size: 1,
      status: "processed",
      extracted_text: "",
      metadata_: { source_type: "txt", chunk_count: 0, extracted_chars: 0 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const key = documentKey(String(params.agentId));
    writeStoredList(key, [document, ...readStoredList<Record<string, unknown>>(key)]);
    return HttpResponse.json(document, { status: 201 });
  }),
  http.delete(`${apiBaseUrl}/agents/:agentId/documents/:documentId`, ({ params }) => {
    if (!testOnly) return passthrough();
    const key = documentKey(String(params.agentId));
    writeStoredList(
      key,
      readStoredList<Record<string, unknown>>(key).filter((document) => document.id !== params.documentId),
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${apiBaseUrl}/agents/:agentId/information-sources`, ({ params }) =>
    HttpResponse.json(readStoredList<InformationSource>(sourceKey(String(params.agentId)))),
  ),
  http.post(`${apiBaseUrl}/agents/:agentId/information-sources/text`, async ({ params, request }) => {
    const input = (await request.json()) as { title: string; content: string };
    const source: InformationSource = {
      id: crypto.randomUUID(),
      kind: "text",
      title: input.title,
      content: input.content,
      status: "ready",
    };
    const key = sourceKey(String(params.agentId));
    writeStoredList(key, [...readStoredList<InformationSource>(key), source]);
    return HttpResponse.json(source, { status: 201 });
  }),
  http.post(`${apiBaseUrl}/agents/:agentId/documents/website/scan`, async ({ request }) => {
    if (!testOnly) return passthrough();
    const { url } = (await request.json()) as { url: string };
    const base = new URL(url);
    return HttpResponse.json({
      pages: [
        { url: base.toString(), title: "Home" },
        { url: new URL("/about", base).toString(), title: "About" },
        { url: new URL("/contact", base).toString(), title: "Contact" },
      ],
    });
  }),
  http.post(`${apiBaseUrl}/agents/:agentId/documents/website`, async ({ params, request }) => {
    if (!testOnly) return passthrough();
    const input = (await request.json()) as { url: string; pages: string[] };
    const key = documentKey(String(params.agentId));
    const documents = readStoredList<Record<string, unknown>>(key);
    const added = input.pages.map((pageUrl) => ({
      id: crypto.randomUUID(),
      agent_id: String(params.agentId),
      filename: `${new URL(pageUrl).hostname}.txt`,
      content_type: "text/plain",
      file_size: 1,
      status: "processed",
      extracted_text: "",
      metadata_: { source_type: "website", source_url: pageUrl, chunk_count: 1, extracted_chars: 1 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    writeStoredList(key, [...added, ...documents]);
    return HttpResponse.json(added, { status: 201 });
  }),
  http.post(`${apiBaseUrl}/agents/:agentId/information-sources/:sourceId/retry`, ({ params }) => {
    const key = sourceKey(String(params.agentId));
    const sources = readStoredList<InformationSource>(key).map((source) =>
      source.id === params.sourceId ? { ...source, status: "ready" as const, failureReason: null } : source,
    );
    writeStoredList(key, sources);
    const source = sources.find((item) => item.id === params.sourceId);
    return source ? HttpResponse.json(source) : HttpResponse.json({ detail: "Source not found" }, { status: 404 });
  }),
  http.put(`${apiBaseUrl}/agents/:agentId/information-sources/:sourceId`, async ({ params, request }) => {
    const input = (await request.json()) as { title: string; content?: string; pages?: string[] };
    const key = sourceKey(String(params.agentId));
    const sources = readStoredList<InformationSource>(key).map((source) =>
      source.id === params.sourceId
        ? { ...source, title: input.title, content: input.content, pages: input.pages }
        : source,
    );
    writeStoredList(key, sources);
    const source = sources.find((item) => item.id === params.sourceId);
    return source ? HttpResponse.json(source) : HttpResponse.json({ detail: "Source not found" }, { status: 404 });
  }),
  http.delete(`${apiBaseUrl}/agents/:agentId/information-sources/:sourceId`, ({ params }) => {
    const key = sourceKey(String(params.agentId));
    writeStoredList(
      key,
      readStoredList<InformationSource>(key).filter((source) => source.id !== params.sourceId),
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(`${apiBaseUrl}/agents/:agentId/chat`, async ({ params, request }) => {
    if (!testOnly) return passthrough();
    const body = (await request.json()) as {
      message: string;
      conversation_id?: string;
      is_test?: boolean;
    };
    if (!body.is_test) {
      return HttpResponse.json({ detail: "Test conversations must be marked as tests" }, { status: 400 });
    }

    const agentId = String(params.agentId);
    const conversations = readStoredList<Record<string, unknown>>(conversationsKey(agentId));
    const conversation = body.conversation_id
      ? conversations.find((item) => item.id === body.conversation_id)
      : undefined;
    if (conversation && conversation.is_test !== true) {
      return HttpResponse.json({ detail: "Conversation test mode cannot be changed" }, { status: 400 });
    }
    const conversationId = typeof conversation?.id === "string" ? conversation.id : crypto.randomUUID();
    if (!conversation) {
      conversations.push({ id: conversationId, is_test: true });
      writeStoredList(conversationsKey(agentId), conversations);
    }
    const responseMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "This is a test response from your assistant.",
    };
    return HttpResponse.json({ conversation_id: conversationId, message: responseMessage });
  }),
  http.get(`${apiBaseUrl}/agents/:agentId/appearance`, ({ params }) => {
    if (!testOnly) return passthrough();
    return HttpResponse.json(
      readStoredValue(appearanceKey(String(params.agentId)), {
        primary_color: "#2369a8",
        logo_data: null,
        is_published: false,
        public_key: null,
      }),
    );
  }),
  http.put(`${apiBaseUrl}/agents/:agentId/appearance`, async ({ params, request }) => {
    if (!testOnly) return passthrough();
    const { primary_color } = (await request.json()) as { primary_color: string };
    const key = appearanceKey(String(params.agentId));
    const current = readStoredValue(key, {
      primary_color: "#2369a8",
      logo_data: null,
      is_published: false,
      public_key: null,
    });
    const updated = { ...current, primary_color };
    localStorage.setItem(key, JSON.stringify(updated));
    return HttpResponse.json(updated);
  }),
  http.post(`${apiBaseUrl}/agents/:agentId/appearance/logo`, ({ params }) => {
    if (!testOnly) return passthrough();
    const key = appearanceKey(String(params.agentId));
    const current = readStoredValue(key, {
      primary_color: "#2369a8",
      logo_data: null,
      is_published: false,
      public_key: null,
    });
    const updated = {
      ...current,
      logo_data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAwQAAAAASUVORK5CYII=",
    };
    localStorage.setItem(key, JSON.stringify(updated));
    return HttpResponse.json(updated);
  }),
  http.post(`${apiBaseUrl}/agents/:agentId/publish`, ({ params }) => {
    if (!testOnly) return passthrough();
    const key = appearanceKey(String(params.agentId));
    const current = readStoredValue(key, {
      primary_color: "#2369a8",
      logo_data: null,
      is_published: false,
      public_key: null,
    });
    const publicKey = current.public_key ?? crypto.randomUUID().replaceAll("-", "");
    const updated = { ...current, is_published: true, public_key: publicKey };
    localStorage.setItem(key, JSON.stringify(updated));
    const draft = readStoredDraft();
    const business = draft && draft.agentId === params.agentId ? draft.business : null;
    const publicProfile: PublicAgentProfile = {
      public_key: publicKey,
      agent_name: business?.agentName || "Digital assistant",
      opening_message: business?.openingMessage || "How can I help you today?",
      language: business?.language === "he" ? "he" : "en",
      primary_color: updated.primary_color,
      logo_data: updated.logo_data,
      is_active: true,
      paused_message: null,
    };
    localStorage.setItem(publicAgentKey(publicKey), JSON.stringify(publicProfile));
    return HttpResponse.json({ public_key: publicKey, published_at: new Date().toISOString() });
  }),
  http.get(`${apiBaseUrl}/public/agents/:publicKey`, ({ params }) => {
    const profile = getPublicProfile(String(params.publicKey));
    if (!profile) return HttpResponse.json({ detail: "This chat is not available" }, { status: 404 });
    return HttpResponse.json(profile);
  }),
  http.post(`${apiBaseUrl}/public/agents/:publicKey/chat`, async ({ params, request }) => {
    const profile = getPublicProfile(String(params.publicKey));
    if (!profile) return HttpResponse.json({ detail: "This chat is not available" }, { status: 404 });
    if (!profile.is_active) {
      return HttpResponse.json({ detail: "This assistant is temporarily unavailable" }, { status: 403 });
    }

    const input = (await request.json()) as PublicChatRequest;
    if (typeof input.message === "string" && input.message.length > 4000) {
      return HttpResponse.json({ detail: "The message is too long" }, { status: 413 });
    }

    const language = input.language === "he" ? "he" : "en";
    let responseContent: string;
    let interaction: PublicChatInteraction | null = null;
    if (input.action_response?.type === "lead_collection") {
      responseContent = language === "he"
        ? "תודה, הפרטים נשלחו ונציג העסק יוכל לחזור אליכם."
        : "Thank you. Your details have been sent to the business.";
    } else if (input.action_response?.type === "meeting_slots") {
      responseContent = language === "he"
        ? "המועד נבחר. פרטי הפגישה יישלחו אליכם."
        : "The time has been selected. Meeting details will be sent to you.";
    } else if (input.action_response?.type === "handoff") {
      responseContent = language === "he"
        ? "הבקשה הועברה לעסק בהתאם להעדפת הקשר שבחרתם."
        : "Your request has been passed to the business using your preferred contact method.";
    } else {
      const message = (input.message ?? "").toLowerCase();
      if (/\b(meeting|appointment|schedule)\b|פגיש|תור/.test(message)) {
        responseContent = language === "he" ? "אלה המועדים הזמינים:" : "These times are available:";
        interaction = {
          type: "meeting_slots",
          prompt: language === "he" ? "בחרו מועד לפגישה" : "Choose an available meeting time",
          slots: language === "he"
            ? [
                { id: "slot-1", label: "מחר, 10:00" },
                { id: "slot-2", label: "מחר, 14:30" },
              ]
            : [
                { id: "slot-1", label: "Tomorrow, 10:00" },
                { id: "slot-2", label: "Tomorrow, 14:30" },
              ],
        };
      } else if (/\b(contact|call|email|lead)\b|פרטים|קשר|לחזור אליי/.test(message)) {
        responseContent = language === "he"
          ? "אפשר להשאיר פרטים ונחזור אליכם."
          : "You can leave your details and the business will get back to you.";
        interaction = {
          type: "lead_collection",
          fields: language === "he"
            ? [
                { id: "name", label: "שם", type: "text", required: true },
                { id: "email", label: "כתובת דוא״ל", type: "email", required: true },
                { id: "message", label: "במה נוכל לעזור", type: "text", required: false },
              ]
            : [
                { id: "name", label: "Name", type: "text", required: true },
                { id: "email", label: "Email address", type: "email", required: true },
                { id: "message", label: "How can we help", type: "text", required: false },
              ],
        };
      } else if (/\b(person|representative|human|staff)\b|נציג|אדם/.test(message)) {
        responseContent = language === "he"
          ? "העברתי את הבקשה לצוות."
          : "I have passed your request to the team.";
        interaction = {
          type: "handoff",
          prompt: language === "he" ? "איך נוח לכם שניצור קשר?" : "How would you prefer us to contact you?",
          contact_methods: language === "he"
            ? [
                { id: "email", label: "דוא״ל" },
                { id: "phone", label: "טלפון" },
              ]
            : [
                { id: "email", label: "Email" },
                { id: "phone", label: "Phone" },
              ],
        };
      } else {
        responseContent = language === "he"
          ? "תודה על ההודעה. איך אוכל לעזור?"
          : "Thank you for your message. How can I help?";
      }
    }

    return HttpResponse.json({
      conversation_id: input.conversation_id ?? crypto.randomUUID(),
      message: { id: crypto.randomUUID(), role: "assistant", content: responseContent },
      interaction,
    });
  }),
  http.get(`${apiBaseUrl}/capabilities`, () => {
    if (!testOnly) return passthrough();
    return HttpResponse.json([]);
  }),
  http.get(`${apiBaseUrl}/agents/:agentId/capabilities`, () => {
    if (!testOnly) return passthrough();
    return HttpResponse.json([]);
  }),
];
