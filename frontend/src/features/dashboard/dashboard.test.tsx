import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "../../app/LanguageProvider";
import { server } from "../../shared/api/mocks/server";
import { saveToken } from "../../shared/auth/authStorage";
import { i18n } from "../../shared/i18n";
import type { Agent, DashboardOverview } from "../../shared/api/dashboard";
import { DashboardContextProvider } from "./context";
import { DashboardLayout } from "./DashboardLayout";
import { ConversationsPage } from "./pages/ConversationsPage";
import { OverviewPage } from "./pages/OverviewPage";

const apiBaseUrl = "http://127.0.0.1:8000/api/v1";
const agentId = "11111111-1111-4111-8111-111111111111";

const agent: Agent = {
  id: agentId,
  name: "Assistant",
  business_name: "Green Clinic",
  opening_message: "How can I help?",
  conversation_language: "en",
  description: "A local clinic",
  system_prompt: null,
  model: "gpt-4o-mini",
  temperature: 0.7,
  max_tokens: null,
  rag_top_k: 5,
  rag_similarity_threshold: 0.3,
  skills_top_k: 3,
  skills_similarity_threshold: 0.75,
  is_active: true,
  is_published: true,
  owner_id: "22222222-2222-4222-8222-222222222222",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
};

const overview: DashboardOverview = {
  is_active: true,
  counts_7_days: { conversations: 2, messages: 5, leads: 1, meetings: 0 },
  counts_30_days: { conversations: 8, messages: 19, leads: 3, meetings: 2 },
  conversations_by_day: Array.from({ length: 30 }, (_, index) => ({
    date: `2026-10-${String(index + 1).padStart(2, "0")}`,
    count: index === 29 ? 2 : 0,
  })),
  recommendations: [],
};

function renderDashboard(page: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <MemoryRouter>
          <DashboardContextProvider agent={agent} token="dashboard-test-token">
            {page}
          </DashboardContextProvider>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("dashboard", () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  it("shows persisted overview data and saves the active state", async () => {
    let active = true;
    server.use(
      http.get(`${apiBaseUrl}/agents/:agentId/dashboard/overview`, () =>
        HttpResponse.json({ ...overview, is_active: active }),
      ),
      http.patch(`${apiBaseUrl}/agents/:agentId`, async ({ request }) => {
        const body = (await request.json()) as { is_active: boolean };
        active = body.is_active;
        return HttpResponse.json({ ...agent, is_active: active });
      }),
    );

    renderDashboard(<OverviewPage />);

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    const statusSwitch = screen.getByRole("switch", { name: "Assistant status" });
    expect(statusSwitch).toHaveAttribute("aria-checked", "true");
    fireEvent.click(statusSwitch);
    await waitFor(() => expect(statusSwitch).toHaveAttribute("aria-checked", "false"));
  });

  it("renders real conversation summaries and activity tags", async () => {
    server.use(
      http.get(`${apiBaseUrl}/agents/:agentId/dashboard/conversations`, () =>
        HttpResponse.json({
          conversations: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              title: null,
              first_message: "Can I book an appointment?",
              message_count: 4,
              tags: ["lead", "meeting"],
              created_at: "2026-11-09T12:00:00Z",
              updated_at: "2026-11-09T12:05:00Z",
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      ),
    );

    renderDashboard(<ConversationsPage />);

    expect(await screen.findByText("Can I book an appointment?")).toBeInTheDocument();
    expect(screen.getAllByText("Lead")).toHaveLength(2);
    expect(screen.getAllByText("Meeting")).toHaveLength(2);
    expect(screen.queryByText("test conversation")).not.toBeInTheDocument();
  });

  it("opens the dashboard route for an agent returned by the real agent API", async () => {
    saveToken("dashboard-test-token");
    server.use(
      http.get(`${apiBaseUrl}/agents`, () => HttpResponse.json([agent])),
      http.get(`${apiBaseUrl}/agents/:agentId/dashboard/overview`, () =>
        HttpResponse.json(overview),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <MemoryRouter initialEntries={["/dashboard"]}>
            <Routes>
              <Route path="/dashboard/*" element={<DashboardLayout />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Dashboard navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conversations" })).toHaveAttribute(
      "href",
      "/dashboard/conversations",
    );
  });
});
