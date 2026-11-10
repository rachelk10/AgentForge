import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../app/LanguageProvider";
import { server } from "../../shared/api/mocks/server";
import { i18n } from "../../shared/i18n";
import { AuthScreen } from "./AuthScreen";
import { PasswordResetPage } from "./PasswordResetPage";

const api = "http://127.0.0.1:8000/api/v1";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <MemoryRouter initialEntries={["/reset-password?token=valid-reset-token-12345678901234567890"]}>
          <Routes>
            <Route path="/reset-password" element={<PasswordResetPage />} />
            <Route path="/" element={<AuthScreen />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("Password recovery", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("submits a new password with the emailed one-time token", async () => {
    let payload: { token: string; password: string } | undefined;
    server.use(
      http.post(`${api}/auth/password-reset`, async ({ request }) => {
        payload = await request.json() as { token: string; password: string };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your password has been updated. You can now log in.",
    );
    expect(payload).toEqual({
      token: "valid-reset-token-12345678901234567890",
      password: "new-password",
    });
  });

  it("rejects mismatched passwords before sending a request", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "different-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    await waitFor(() => {
      expect(screen.getByText("The passwords do not match.")).toBeInTheDocument();
    });
  });
});
