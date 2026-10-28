import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../app/LanguageProvider";
import { createEmptyBusiness } from "../../api/contracts/wizardDraft";
import { server } from "../../shared/api/mocks/server";
import { i18n } from "../../shared/i18n";
import { AppearanceStep, contrastRatio } from "./AppearanceStep";
import { TestStep } from "./TestStep";

const agentId = "11111111-1111-4111-8111-111111111111";

function renderStep(element: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>{element}</LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("Stage 5 wizard steps", () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage("en");
  });

  afterEach(() => cleanup());

  it("uses a live test chat and starts a fresh test conversation", async () => {
    const onEdit = vi.fn();
    renderStep(
      <TestStep
        agentId={agentId}
        token="test-token"
        business={{ ...createEmptyBusiness("en"), businessName: "Green Clinic", agentName: "Dana" }}
        onEdit={onEdit}
      />,
    );

    const editButtons = await screen.findAllByRole("button", { name: "Edit" });
    expect(editButtons).toHaveLength(3);
    fireEvent.click(editButtons[1]);
    expect(onEdit).toHaveBeenCalledWith(2);

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "When are you open?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("This is a test response from your assistant.")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(`mock-conversations:${agentId}`) ?? "[]")).toEqual([
      expect.objectContaining({ is_test: true }),
    ]);
    expect(JSON.parse(localStorage.getItem("mock-agents") ?? "[]")[0].system_prompt)
      .toContain("customer-facing assistant for Green Clinic");
    expect(screen.queryByText(/<business_information>/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(screen.getByText("Send a message to try your assistant.")).toBeInTheDocument();
  });

  it("warns about insufficient contrast and publishes the preview details", async () => {
    expect(contrastRatio("#ffffff")).toBeCloseTo(1);
    expect(contrastRatio("#000000")).toBeCloseTo(21);

    renderStep(
      <AppearanceStep
        agentId={agentId}
        token="test-token"
        business={{ ...createEmptyBusiness("en"), agentName: "Dana", openingMessage: "How can I help?" }}
      />,
    );

    const colorInput = await screen.findByLabelText("Primary color");
    fireEvent.change(colorInput, { target: { value: "#ffffff" } });
    expect(await screen.findByText(/does not provide enough contrast/)).toBeInTheDocument();

    const logoInput = screen.getByLabelText("Logo");
    fireEvent.change(logoInput, {
      target: { files: [new File(["logo"], "logo.png", { type: "image/png" })] },
    });
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(`mock-agent-appearance:${agentId}`) ?? "{}").logo_data)
        .toBe("data:image/png;base64,");
    });
    const preview = screen.getByLabelText("Live assistant preview");
    expect(preview).toHaveTextContent("Dana");
    expect(preview).toHaveTextContent("How can I help?");
    expect((preview.querySelector(".widget-preview__header") as HTMLElement).style.backgroundColor)
      .toBe("rgb(255, 255, 255)");
    expect(preview.querySelector("img")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("heading", { name: "Your assistant is published" })).toBeInTheDocument();
    expect((screen.getByLabelText("Website code") as HTMLTextAreaElement).value).toContain("/widget.js");
    expect(screen.getByRole("link", { name: "Open the standalone chat page" }).getAttribute("href")).toContain("/chat/");
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(`mock-agent-appearance:${agentId}`) ?? "{}")).toMatchObject({
        primary_color: "#ffffff",
        is_published: true,
      });
    });
  });
});
