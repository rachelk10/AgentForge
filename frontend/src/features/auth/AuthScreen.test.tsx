import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../app/LanguageProvider";
import { server } from "../../shared/api/mocks/server";
import { i18n } from "../../shared/i18n";
import { AuthDestination } from "./AuthDestination";
import { AuthScreen } from "./AuthScreen";

const apiBaseUrl = "http://127.0.0.1:8000/api/v1";

function renderAuthScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<AuthScreen />} />
            <Route path="/app/start" element={<AuthDestination destination="start" />} />
            <Route path="/app/wizard" element={<AuthDestination destination="wizard" />} />
            <Route path="/dashboard" element={<AuthDestination destination="dashboard" />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

function fillLoginForm() {
  fireEvent.click(screen.getByRole("tab", { name: "Log in" }));
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "owner@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "correct-password" },
  });
}

describe("Stage 1 authentication", () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage("en");
  });

  it("validates registration fields and terms before sending a request", async () => {
    renderAuthScreen();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter your full name using at least three characters.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Use at least eight characters.")).toBeInTheDocument();
    expect(screen.getByText("Accept the terms of use to create an account.")).toBeInTheDocument();
  });

  it("shows registration errors as clear business language", async () => {
    server.use(
      http.post(`${apiBaseUrl}/auth/register`, () =>
        HttpResponse.json({ detail: "Email already registered" }, { status: 400 }),
      ),
    );
    renderAuthScreen();
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Business Owner" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "StrongPass123!" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "I accept the terms of use" }));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This email address is already registered. You can log in instead.",
    );
  });

  it("registers, logs in, saves the token, and routes a new account to the starting point", async () => {
    let registeredUsername = "";
    let loginUsername = "";
    server.use(
      http.post(`${apiBaseUrl}/auth/register`, async ({ request }) => {
        const body = await request.json() as { username: string };
        registeredUsername = body.username;
        return HttpResponse.json({
          id: "registered-user",
          email: "owner@example.com",
          username: body.username,
          is_active: true,
          is_admin: false,
        });
      }),
      http.post(`${apiBaseUrl}/auth/login`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        loginUsername = body.get("username") ?? "";
        return HttpResponse.json({ access_token: "stage1-test-token", token_type: "bearer" });
      }),
      http.get(`${apiBaseUrl}/account/agent-state`, () => HttpResponse.json("none")),
    );

    renderAuthScreen();
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Business Owner" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "StrongPass123!" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "I accept the terms of use" }));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Starting point" })).toBeInTheDocument();
    expect(registeredUsername).toBe("Business Owner");
    expect(loginUsername).toBe("owner@example.com");
    expect(localStorage.getItem("agent-platform-token")).toBe("stage1-test-token");
  });

  it.each([
    ["draft", "/app/wizard", "Your setup"],
    ["published", "/dashboard", "Dashboard"],
  ] as const)("routes a returning account with %s state to %s", async (state, _path, heading) => {
    server.use(
      http.post(`${apiBaseUrl}/auth/login`, () =>
        HttpResponse.json({ access_token: "stage1-test-token", token_type: "bearer" }),
      ),
      http.get(`${apiBaseUrl}/account/agent-state`, () => HttpResponse.json(state)),
    );

    renderAuthScreen();
    fillLoginForm();
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("shows a human-readable message for invalid credentials", async () => {
    server.use(
      http.post(`${apiBaseUrl}/auth/login`, () =>
        HttpResponse.json({ detail: "Invalid credentials" }, { status: 401 }),
      ),
    );
    renderAuthScreen();
    fillLoginForm();
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The email address or password is incorrect.",
    );
  });

  it("submits password recovery and displays a privacy-preserving confirmation", async () => {
    renderAuthScreen();
    fireEvent.click(screen.getByRole("tab", { name: "Log in" }));
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send instructions" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "If an account exists for this address, password reset instructions will be sent.",
    );
  });

  it("routes mock Google sign-in to the starting point", async () => {
    renderAuthScreen();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Starting point" })).toBeInTheDocument();
    });
  });

  it("renders the authentication screen in Hebrew and switches document direction", async () => {
    renderAuthScreen();
    fireEvent.click(screen.getByRole("button", { name: "Language" }));

    expect(await screen.findByRole("heading", { name: "יצירת חשבון" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("he");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("supports keyboard navigation between the account tabs", async () => {
    renderAuthScreen();
    const registerTab = screen.getByRole("tab", { name: "Create account" });
    registerTab.focus();
    fireEvent.keyDown(registerTab, { key: "ArrowRight" });

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Log in" })).toHaveFocus();
  });
});
