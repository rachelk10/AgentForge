import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "../../app/LanguageProvider";
import { saveToken } from "../../shared/auth/authStorage";
import { server } from "../../shared/api/mocks/server";
import { AdminRoute } from "./AdminRoute";

function renderAdminRoute() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route
              path="/admin/*"
              element={<AdminRoute><p>Developer panel</p></AdminRoute>}
            />
            <Route path="/admin/login" element={<p>Admin login</p>} />
            <Route path="/admin/denied" element={<p>Denied area</p>} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("AdminRoute", () => {
  beforeEach(() => localStorage.clear());

  it("redirects unauthenticated visitors to admin sign-in", async () => {
    renderAdminRoute();

    expect(await screen.findByText("Admin login")).toBeInTheDocument();
    expect(screen.queryByText("Developer panel")).not.toBeInTheDocument();
  });

  it("does not render the developer panel for a non-admin account", async () => {
    saveToken("member-token");
    server.use(
      http.get("http://127.0.0.1:8000/api/v1/auth/me", () =>
        HttpResponse.json({
          id: "member-id",
          email: "member@example.com",
          username: "member",
          is_active: true,
          is_admin: false,
        }),
      ),
    );

    renderAdminRoute();

    expect(await screen.findByText("Denied area")).toBeInTheDocument();
    expect(screen.queryByText("Developer panel")).not.toBeInTheDocument();
  });

  it("renders the developer panel only after administrator access is confirmed", async () => {
    saveToken("admin-token");
    server.use(
      http.get("http://127.0.0.1:8000/api/v1/auth/me", () =>
        HttpResponse.json({
          id: "admin-id",
          email: "admin@example.com",
          username: "admin",
          is_active: true,
          is_admin: true,
        }),
      ),
    );

    renderAdminRoute();

    expect(await screen.findByText("Developer panel")).toBeInTheDocument();
  });
});
