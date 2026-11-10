import type {
  PublicAgentProfile,
  PublicChatActionResponse,
  PublicChatInteraction,
  PublicChatReply,
  PublicChatRequest,
  PublicLanguage,
} from "../../../src/api/contracts/publicChat";
import { publicAgentPath } from "../../../src/api/contracts/publicChat";
import en from "./locales/en.json";
import he from "./locales/he.json";

type Copy = typeof en;
type FailedRequest = { message: string; action?: PublicChatActionResponse };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

function isLanguage(value: string | null): value is PublicLanguage {
  return value === "he" || value === "en";
}

function textElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function safeColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#2369a8";
}

function safeLogoSource(value: string | null): value is string {
  if (!value) return false;
  if (/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(value)) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function publicRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "omit",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const detail = typeof body === "object" && body !== null && "detail" in body
      ? String(body.detail)
      : response.statusText;
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return body as T;
}

function languageFromPage(): PublicLanguage {
  const params = new URLSearchParams(window.location.search);
  if (isLanguage(params.get("lang"))) return params.get("lang") as PublicLanguage;
  return navigator.language.toLowerCase().startsWith("he") ? "he" : "en";
}

function addMessage(list: HTMLElement, message: ChatMessage) {
  const paragraph = textElement(
    "p",
    message.content,
    `public-chat-message public-chat-message--${message.role}`,
  );
  paragraph.dir = "auto";
  list.append(paragraph);
}

export async function mountPublicChat(root: HTMLElement): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const publicKey = params.get("publicKey") ?? "";
  const mode = params.get("mode") === "widget" ? "widget" : "standalone";
  const language = languageFromPage();
  const copy: Copy = language === "he" ? he : en;
  const direction = params.get("dir") === "rtl" || (params.get("dir") !== "ltr" && language === "he")
    ? "rtl"
    : "ltr";
  const publicPath = publicAgentPath(publicKey);
  let conversationId: string | undefined;
  let interaction: PublicChatInteraction | null = null;
  let failedRequest: FailedRequest | null = null;
  let profile: PublicAgentProfile | null = null;
  let isSending = false;
  let isOpen = mode === "standalone";
  let messageInput: HTMLInputElement | null = null;
  let sendButton: HTMLButtonElement | null = null;
  let messages: HTMLElement | null = null;
  let interactionArea: HTMLElement | null = null;
  let typing: HTMLElement | null = null;
  let errorArea: HTMLElement | null = null;
  let windowElement: HTMLElement | null = null;
  let toggle: HTMLButtonElement | null = null;

  document.documentElement.lang = language;
  document.documentElement.dir = direction;
  document.title = copy.chatTitle;
  document.body.classList.toggle("public-widget-body", mode === "widget");
  root.className = mode === "widget" ? "public-widget-root" : "public-chat-standalone-root";
  root.dir = direction;

  function resizeWidget(open: boolean) {
    const parentOrigin = params.get("parentOrigin");
    if (mode === "widget" && window.parent !== window && parentOrigin) {
      try {
        if (new URL(parentOrigin).origin !== parentOrigin) return;
      } catch {
        return;
      }
      window.parent.postMessage(
        { type: "agent-widget:resize", isOpen: open },
        parentOrigin,
      );
    }
  }

  function setOpen(open: boolean) {
    if (mode !== "widget") return;
    isOpen = open;
    if (windowElement) windowElement.hidden = !open;
    if (toggle) toggle.hidden = open;
    resizeWidget(open);
  }

  function renderInteraction() {
    if (!interactionArea) return;
    interactionArea.replaceChildren();
    if (!interaction) return;

    const card = document.createElement("div");
    card.className = "public-chat-interaction";
    if (interaction.type === "lead_collection") {
      const form = document.createElement("form");
      form.className = "public-chat-interaction";
      interaction.fields.forEach((field, index) => {
        const label = textElement("label", field.label, "public-chat-field");
        const input = document.createElement("input");
        input.id = `public-chat-field-${index}`;
        input.type = field.type;
        input.required = field.required;
        const labelText = document.createElement("span");
        labelText.textContent = field.label;
        label.replaceChildren(labelText, input);
        form.append(label);
      });
      const submit = textElement("button", copy.submitDetails);
      submit.type = "submit";
      form.append(submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const values = Object.fromEntries(
          Array.from(form.querySelectorAll("input")).map((input, index) => {
            const field = interaction?.type === "lead_collection" ? interaction.fields[index] : undefined;
            return [field?.id ?? "", input.value];
          }),
        );
        void submitRequest("", { type: "lead_collection", values });
      });
      interactionArea.append(form);
      return;
    }

    if (interaction.type === "meeting_slots") {
      const meetingInteraction = interaction;
      card.append(textElement("p", meetingInteraction.prompt));
      meetingInteraction.slots.forEach((slot) => {
        const button = textElement("button", slot.label);
        button.type = "button";
        button.addEventListener("click", () => {
          card.replaceChildren(textElement("p", meetingInteraction.prompt));
          const form = document.createElement("form");
          form.className = "public-chat-interaction";
          const nameInput = document.createElement("input");
          nameInput.type = "text";
          nameInput.required = true;
          nameInput.autocomplete = "name";
          const emailInput = document.createElement("input");
          emailInput.type = "email";
          emailInput.required = true;
          emailInput.autocomplete = "email";
          for (const [labelText, input] of [
            [copy.name, nameInput],
            [copy.emailAddress, emailInput],
          ] as const) {
            const label = textElement("label", labelText, "public-chat-field");
            const caption = document.createElement("span");
            caption.textContent = labelText;
            label.replaceChildren(caption, input);
            form.append(label);
          }
          const submit = textElement("button", copy.submitDetails);
          submit.type = "submit";
          form.append(submit);
          form.addEventListener("submit", (event) => {
            event.preventDefault();
            void submitRequest("", {
              type: "meeting_slots",
              slot_id: slot.id,
              values: { name: nameInput.value, email: emailInput.value },
            });
          });
          card.append(form);
        });
        card.append(button);
      });
    } else {
      const handoffInteraction = interaction;
      card.append(textElement("p", handoffInteraction.prompt));
      handoffInteraction.contact_methods.forEach((method) => {
        const button = textElement("button", method.label);
        button.type = "button";
        button.addEventListener("click", () => {
          card.replaceChildren(textElement("p", handoffInteraction.prompt));
          const form = document.createElement("form");
          form.className = "public-chat-interaction";
          const contactLabel = method.id === "email" ? copy.emailAddress : copy.phoneNumber;
          const label = textElement("label", contactLabel, "public-chat-field");
          const input = document.createElement("input");
          input.type = method.id === "email" ? "email" : "tel";
          input.required = true;
          input.autocomplete = method.id === "email" ? "email" : "tel";
          const labelText = document.createElement("span");
          labelText.textContent = contactLabel;
          label.replaceChildren(labelText, input);
          const submit = textElement("button", copy.submitDetails);
          submit.type = "submit";
          form.append(label, submit);
          form.addEventListener("submit", (event) => {
            event.preventDefault();
            void submitRequest("", {
              type: "handoff",
              contact_preference: method.id,
              contact_details: input.value,
            });
          });
          card.append(form);
        });
        card.append(button);
      });
    }
    interactionArea.append(card);
  }

  function appendFailure(failed: FailedRequest) {
    if (!errorArea) return;
    errorArea.replaceChildren();
    const message = textElement("p", copy.sendError);
    const retry = textElement("button", copy.retry);
    retry.type = "button";
    retry.addEventListener("click", () => void submitRequest(failed.message, failed.action));
    errorArea.append(message, retry);
    errorArea.hidden = false;
  }

  async function submitRequest(text: string, action?: PublicChatActionResponse) {
    const cleanText = text.trim();
    if (isSending || (!cleanText && !action) || !profile) return;
    isSending = true;
    failedRequest = null;
    if (errorArea) errorArea.hidden = true;
    if (typing) {
      typing.textContent = copy.typing;
      typing.hidden = false;
    }
    if (sendButton) sendButton.disabled = true;
    const body: PublicChatRequest = {
      message: cleanText || undefined,
      conversation_id: conversationId,
      language,
      action_response: action,
    };
    try {
      const reply = await publicRequest<PublicChatReply>(`${publicPath}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      conversationId = reply.conversation_id;
      if (cleanText && messages) {
        addMessage(messages, { id: `user-${crypto.randomUUID()}`, role: "user", content: cleanText });
      }
      if (messages) addMessage(messages, reply.message);
      interaction = reply.interaction;
      renderInteraction();
      if (messageInput && cleanText) messageInput.value = "";
    } catch {
      failedRequest = { message: cleanText, action };
      appendFailure(failedRequest);
    } finally {
      isSending = false;
      if (typing) typing.hidden = true;
      if (sendButton) sendButton.disabled = !messageInput?.value.trim();
    }
  }

  async function loadProfile() {
    root.replaceChildren();
    if (!publicKey) {
      showLoadError();
      return;
    }
    const status = document.createElement("section");
    status.className = mode === "widget" ? "public-widget-loading" : "public-chat-status public-chat-loading";
    status.setAttribute("role", "status");
    status.setAttribute("aria-label", copy.loading);
    if (mode === "widget") {
      status.append(document.createElement("span"));
    } else {
      status.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
    }
    root.append(status);
    try {
      profile = await publicRequest<PublicAgentProfile>(publicPath);
      renderChat();
    } catch {
      showLoadError();
      if (mode === "widget") setOpen(true);
    }
  }

  function showLoadError() {
    const status = document.createElement("section");
    status.className = "public-chat-status public-chat-error";
    status.setAttribute("role", "alert");
    status.append(textElement("p", copy.loadError));
    const retry = textElement("button", copy.retry);
    retry.type = "button";
    retry.addEventListener("click", () => void loadProfile());
    status.append(retry);
    root.replaceChildren(status);
  }

  function renderChat() {
    if (!profile) return;
    root.replaceChildren();
    if (mode === "widget") {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "public-widget-toggle";
      toggle.setAttribute("aria-label", copy.open);
      toggle.style.backgroundColor = safeColor(profile.primary_color);
      toggle.addEventListener("click", () => setOpen(true));
      if (safeLogoSource(profile.logo_data)) {
        const logo = document.createElement("img");
        logo.src = profile.logo_data;
        logo.alt = "";
        toggle.append(logo);
      } else {
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("aria-hidden", "true");
        icon.setAttribute("viewBox", "0 0 24 24");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M4 4h16v12h-9l-5 4v-4H4z");
        icon.append(path);
        toggle.append(icon);
      }
      root.append(toggle);
    }

    windowElement = document.createElement("section");
    windowElement.className = "public-chat-window";
    windowElement.setAttribute("aria-label", copy.chatLabel);
    windowElement.hidden = mode === "widget" && !isOpen;
    const header = document.createElement("header");
    header.className = "public-chat-header";
    header.style.backgroundColor = safeColor(profile.primary_color);
    if (safeLogoSource(profile.logo_data)) {
      const logo = document.createElement("img");
      logo.src = profile.logo_data;
      logo.alt = "";
      logo.className = "public-chat-logo";
      header.append(logo);
    }
    header.append(textElement("h1", profile.agent_name));
    if (mode === "widget") {
      const close = textElement("button", "×", "public-chat-close");
      close.type = "button";
      close.setAttribute("aria-label", copy.close);
      close.addEventListener("click", () => setOpen(false));
      header.append(close);
    }
    windowElement.append(header);

    if (!profile.is_active) {
      const paused = document.createElement("section");
      paused.className = "public-chat-paused";
      paused.setAttribute("role", "status");
      paused.append(textElement("p", profile.paused_message || copy.paused));
      windowElement.append(paused);
      root.append(windowElement);
      setOpen(mode === "standalone" || isOpen);
      return;
    }

    messages = document.createElement("div");
    messages.className = "public-chat-messages";
    messages.setAttribute("aria-live", "polite");
    addMessage(messages, {
      id: `opening-${profile.public_key}`,
      role: "assistant",
      content: profile.opening_message,
    });
    interactionArea = document.createElement("div");
    messages.append(interactionArea);
    typing = textElement("p", "", "public-chat-typing");
    typing.setAttribute("role", "status");
    typing.hidden = true;
    messages.append(typing);
    errorArea = document.createElement("div");
    errorArea.className = "public-chat-error";
    errorArea.hidden = true;
    messages.append(errorArea);
    windowElement.append(messages);

    const form = document.createElement("form");
    form.className = "public-chat-form";
    const label = textElement("label", copy.messageLabel, "public-chat-visually-hidden");
    messageInput = document.createElement("input");
    messageInput.id = "public-chat-message";
    messageInput.placeholder = copy.messagePlaceholder;
    messageInput.maxLength = 4000;
    messageInput.autocomplete = "off";
    label.htmlFor = messageInput.id;
    sendButton = textElement("button", copy.send);
    sendButton.type = "submit";
    sendButton.disabled = true;
    const updateSendButton = () => {
      if (sendButton) sendButton.disabled = !messageInput?.value.trim() || isSending;
    };
    messageInput.addEventListener("input", updateSendButton);
    messageInput.addEventListener("change", updateSendButton);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitRequest(messageInput?.value ?? "");
    });
    form.append(label, messageInput, sendButton);
    windowElement.append(form);
    windowElement.append(textElement("p", copy.automatedNote, "public-chat-note"));
    root.append(windowElement);
    renderInteraction();
    setOpen(mode === "standalone" || isOpen);
  }

  if (mode === "widget") resizeWidget(false);
  await loadProfile();
}

if (typeof document !== "undefined") {
  const root = document.getElementById("public-chat-root");
  if (root) void mountPublicChat(root);
}
