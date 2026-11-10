import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/dom";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { PublicAgentProfile } from "../../../src/api/contracts/publicChat";
import { server } from "../../../src/shared/api/mocks/server";
import { mountPublicChat } from "./widget-app";

const apiBaseUrl = "http://127.0.0.1:8000/api/v1";
const publicKey = "public-demo";
const profile: PublicAgentProfile = {
  public_key: publicKey,
  agent_name: "Maya",
  opening_message: "How can I help?",
  language: "en",
  primary_color: "#2369a8",
  logo_data: null,
  is_active: true,
  paused_message: null,
};

async function startChat(options = "publicKey=public-demo&mode=standalone&lang=en") {
  document.body.innerHTML = '<main id="public-chat-root"></main>';
  window.history.replaceState({}, "", `/packages/widget/widget.html?${options}`);
  const root = document.getElementById("public-chat-root");
  if (!root) throw new Error("Chat root is missing");
  await mountPublicChat(root);
  return root;
}

describe("standalone widget package", () => {
  beforeEach(() => {
    document.body.className = "";
    document.body.replaceChildren();
    localStorage.clear();
    localStorage.setItem(`mock-public-agent:${publicKey}`, JSON.stringify(profile));
  });

  it("supports meeting selection and confirms the booking", async () => {
    await startChat();
    expect(await screen.findByText("How can I help?")).toHaveAttribute("dir", "auto");

    fireEvent.input(screen.getByLabelText("Your message"), {
      target: { value: "I would like to schedule a meeting" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tomorrow, 10:00" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "sam@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send details" }));

    expect(await screen.findByText("The time has been selected. Meeting details will be sent to you."))
      .toBeInTheDocument();
    expect(screen.getByText("Replies are provided automatically.")).toBeInTheDocument();
  });

  it("collects lead details and confirms receipt", async () => {
    await startChat();
    fireEvent.input(screen.getByLabelText("Your message"), {
      target: { value: "Can you contact me?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "sam@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send details" }));
    expect(await screen.findByText("Thank you. Your details have been sent to the business."))
      .toBeInTheDocument();
  });

  it("asks for contact preference before confirming a handoff", async () => {
    await startChat();
    fireEvent.input(screen.getByLabelText("Your message"), {
      target: { value: "I would like to speak to a person" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("How would you prefer us to contact you?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Email" }));
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "sam@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send details" }));
    expect(await screen.findByText(/Your request has been passed to the business/)).toBeInTheDocument();
  });

  it("renders untrusted text without interpreting it as markup", async () => {
    server.use(
      http.get(`${apiBaseUrl}/public/agents/${publicKey}`, () =>
        HttpResponse.json({ ...profile, opening_message: '<img src=x onerror="alert(1)">' }),
      ),
    );
    const root = await startChat();

    expect(await screen.findByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(root.querySelector("img")).toBeNull();
  });

  it("shows a paused-agent state", async () => {
    localStorage.setItem(
      `mock-public-agent:${publicKey}`,
      JSON.stringify({ ...profile, is_active: false }),
    );
    await startChat();

    expect(await screen.findByText("This service is currently unavailable.")).toBeInTheDocument();
  });

  it("retains a failed message and retries it", async () => {
    let attempts = 0;
    server.use(
      http.post(`${apiBaseUrl}/public/agents/${publicKey}/chat`, () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json({ detail: "Temporary service error" }, { status: 503 });
        }
        return HttpResponse.json({
          conversation_id: "conversation-1",
          message: { id: "reply-1", role: "assistant", content: "I received your message." },
          interaction: null,
        });
      }),
    );
    await startChat();
    const input = screen.getByLabelText("Your message");
    fireEvent.input(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Your message could not be sent.")).toBeInTheDocument();
    expect(input).toHaveValue("Hello");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("I received your message.")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(attempts).toBe(2);
  });

  it("uses the page language and sends public requests without owner credentials", async () => {
    let authorization: string | null = "not-checked";
    server.use(
      http.get(`${apiBaseUrl}/public/agents/${publicKey}`, ({ request }) => {
        authorization = request.headers.get("authorization");
        return HttpResponse.json(profile);
      }),
    );
    const root = await startChat("publicKey=public-demo&mode=widget&lang=he&dir=rtl");

    expect(await screen.findByRole("button", { name: "פתיחת שיחה" })).toBeInTheDocument();
    expect(root).toHaveAttribute("dir", "rtl");
    expect(authorization).toBeNull();
  });
});
