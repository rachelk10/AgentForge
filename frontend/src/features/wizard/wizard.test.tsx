import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../app/LanguageProvider";
import { i18n } from "../../shared/i18n";
import { saveToken } from "../../shared/auth/authStorage";
import { StartPage } from "../start/StartPage";
import { WizardPage } from "./WizardPage";

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/app/start" element={<StartPage />} />
            <Route path="/app/wizard" element={<WizardPage />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

function field(label: string) {
  return screen.getByLabelText(label, { exact: false }) as HTMLInputElement;
}

async function startFromScratch() {
  const button = await screen.findByRole("button", { name: "Start from scratch" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

async function chooseTemplate(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: "Choose a template" }));
  fireEvent.click(await screen.findByRole("button", { name: `Use ${name}` }));
  await screen.findByRole("heading", { name: "Your business" });
}

function fillRequiredFields() {
  fireEvent.change(field("Business name"), { target: { value: "Green Clinic" } });
  fireEvent.change(field("Field of activity"), { target: { value: "health" } });
  fireEvent.change(field("About your business"), { target: { value: "A family clinic." } });
  fireEvent.change(field("Assistant name"), { target: { value: "Dana" } });
  fireEvent.change(field("Opening message"), { target: { value: "Hello, how can I help?" } });
}

describe("Stage 2 starting point and wizard", () => {
  beforeEach(async () => {
    localStorage.clear();
    saveToken("stage2-test-token");
    await i18n.changeLanguage("en");
  });

  afterEach(async () => {
    // Unmounting flushes any pending save; let it finish before the next test clears storage.
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it("lists the three templates", async () => {
    renderApp("/app/start");
    fireEvent.click(await screen.findByRole("button", { name: "Choose a template" }));
    expect(await screen.findByRole("heading", { name: "Customer service" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sales and lead collection" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Appointments and meetings" })).toBeInTheDocument();
  });

  it("fills the fields when a template is chosen", async () => {
    renderApp("/app/start");
    await chooseTemplate("Customer service");

    expect(field("About your business").value).toContain("questions about our products");
    expect(field("Opening message").value).toContain("I am here to answer your questions");
    expect(field("Tone of voice").value).toBe("professional");
  });

  it("starts from scratch with empty fields", async () => {
    renderApp("/app/start");
    await startFromScratch();
    await screen.findByRole("heading", { name: "Your business" });
    expect(field("Business name").value).toBe("");
    expect(field("About your business").value).toBe("");
  });

  it("keeps entered data after the page is reloaded", async () => {
    const first = renderApp("/app/start");
    await chooseTemplate("Customer service");
    fireEvent.change(field("Business name"), { target: { value: "Green Clinic" } });
    await waitFor(() => expect(screen.getByText("Your changes are saved")).toBeInTheDocument(), {
      timeout: 3000,
    });
    first.unmount();

    renderApp("/app/wizard");
    await screen.findByRole("heading", { name: "Your business" });
    expect(field("Business name").value).toBe("Green Clinic");
    expect(field("Opening message").value).toContain("I am here to answer your questions");
  });

  it("resumes at the step where the user stopped", async () => {
    const first = renderApp("/app/start");
    await chooseTemplate("Customer service");
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Information" });
    await screen.findByText("Your changes are saved", {}, { timeout: 3000 });
    first.unmount();

    renderApp("/app/wizard");
    expect(await screen.findByRole("heading", { name: "Information" })).toBeInTheDocument();
  });

  it("preserves fields when going back to an earlier step", async () => {
    renderApp("/app/start");
    await chooseTemplate("Sales and lead collection");
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Information" });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    await screen.findByRole("heading", { name: "Your business" });
    expect(field("Business name").value).toBe("Green Clinic");
    expect(field("Assistant name").value).toBe("Dana");
    expect(field("Opening message").value).toBe("Hello, how can I help?");
  });

  it("keeps edited template fields when another template is chosen", async () => {
    renderApp("/app/start");
    await chooseTemplate("Customer service");
    fireEvent.change(field("Opening message"), { target: { value: "My own greeting" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    fireEvent.click(await screen.findByRole("button", { name: "Choose a template" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use Appointments and meetings" }));
    await screen.findByRole("heading", { name: "Your business" });

    expect(field("Opening message").value).toBe("My own greeting");
    expect(field("About your business").value).toContain("by appointment");
  });

  it("shows validation messages for missing required fields", async () => {
    renderApp("/app/start");
    await startFromScratch();
    await screen.findByRole("heading", { name: "Your business" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Enter your business name.")).toBeInTheDocument();
    expect(screen.getByText("Select your field of activity.")).toBeInTheDocument();
    expect(screen.getByText("Enter a name for your assistant.")).toBeInTheDocument();
    expect(screen.getByText("Enter an opening message.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your business" })).toBeInTheDocument();
  });

  it("requires a description when the field of activity is other", async () => {
    renderApp("/app/start");
    await startFromScratch();
    await screen.findByRole("heading", { name: "Your business" });
    fillRequiredFields();
    fireEvent.change(field("Field of activity"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Describe your field of activity.")).toBeInTheDocument();
  });

  it("previews how the assistant introduces itself", async () => {
    renderApp("/app/start");
    await startFromScratch();
    await screen.findByRole("heading", { name: "Your business" });
    fireEvent.change(field("Assistant name"), { target: { value: "Dana" } });
    fireEvent.change(field("Opening message"), { target: { value: "Hello there" } });

    expect(await screen.findByText("Hello there", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Dana")).toBeInTheDocument();
  });
});

