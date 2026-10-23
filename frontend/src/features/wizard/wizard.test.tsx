import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../app/LanguageProvider";
import { i18n } from "../../shared/i18n";
import { saveToken } from "../../shared/auth/authStorage";
import { server } from "../../shared/api/mocks/server";
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

async function goToInformation() {
  renderApp("/app/start");
  await startFromScratch();
  await screen.findByRole("heading", { name: "Your business" });
  fillRequiredFields();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Information" });
  await screen.findByRole("heading", { name: "Added information" });
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

  it("adds free-text information to the source list", async () => {
    await goToInformation();
    fireEvent.click(screen.getByRole("tab", { name: "Free text" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Opening hours" } });
    fireEvent.change(screen.getByLabelText("Information"), {
      target: { value: "We are open on weekdays from nine to five." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add information" }));

    await waitFor(() =>
      expect(document.querySelector(".information-source-list")).toHaveTextContent("Opening hours"),
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("replaces existing free-text information", async () => {
    await goToInformation();
    fireEvent.click(screen.getByRole("tab", { name: "Free text" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Opening hours" } });
    fireEvent.change(screen.getByLabelText("Information"), { target: { value: "Weekdays, nine to five." } });
    fireEvent.click(screen.getByRole("button", { name: "Add information" }));
    await waitFor(() =>
      expect(document.querySelector(".information-source-list")).toHaveTextContent("Opening hours"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    fireEvent.change(screen.getByLabelText("Information"), {
      target: { value: "Weekdays, eight to six." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(document.querySelectorAll(".information-source-list li")).toHaveLength(1);
      expect(document.querySelector(".information-source-list")).toHaveTextContent("Ready");
    });
  });

  it("scans a website and lets the user select which pages to add", async () => {
    await goToInformation();
    fireEvent.click(screen.getByRole("tab", { name: "Website" }));
    expect(screen.getByText("We look for publicly available pages on this website, up to 20 pages."))
      .toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Website address"), {
      target: { value: "https://example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find pages" }));

    expect(await screen.findByText("About")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Contact/ }));
    expect(screen.getByText("2 pages selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add selected pages" }));

    await waitFor(() => {
      const list = document.querySelector(".information-source-list");
      expect(list).toHaveTextContent("https://example.test/");
      expect(list).toHaveTextContent("https://example.test/about");
      expect(list?.querySelectorAll("li")).toHaveLength(2);
    });
  });

  it("offers a retry when website scanning fails", async () => {
    server.use(
      http.post("http://127.0.0.1:8000/api/v1/agents/:agentId/documents/website/scan", () =>
        HttpResponse.json({ detail: "Website is temporarily unavailable" }, { status: 502 }),
      ),
    );
    await goToInformation();
    fireEvent.click(screen.getByRole("tab", { name: "Website" }));
    fireEvent.change(screen.getByLabelText("Website address"), {
      target: { value: "https://example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find pages" }));

    expect(await screen.findByText(
      "This website could not be scanned. Check the address and make sure the site is publicly available.",
    )).toBeInTheDocument();
    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: "Try scanning again" }));
    expect(await screen.findByText("About")).toBeInTheDocument();
  });

  it("uploads and removes a file with confirmation", async () => {
    await goToInformation();
    const file = new File(["Business information"], "business-notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Choose files to upload"), { target: { files: [file] } });

    expect(await screen.findByText("test-upload.txt")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Remove this information");
    fireEvent.click(screen.getByRole("dialog").querySelectorAll("button")[1]);

    await waitFor(() => expect(screen.queryByText("test-upload.txt")).not.toBeInTheDocument());
  });

  it("warns before continuing without information", async () => {
    await goToInformation();
    fireEvent.click(screen.getByRole("button", { name: "Continue without adding information" }));

    expect(await screen.findByText("Without business information, your assistant can only answer in general terms."))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue without it" }));
    expect(await screen.findByRole("heading", { name: "Capabilities" })).toBeInTheDocument();
  });

  it("shows a failed file source with a reason and retry action", async () => {
    server.use(
      http.post("http://127.0.0.1:8000/api/v1/agents/:agentId/documents", () =>
        HttpResponse.json({ detail: "Upload unavailable" }, { status: 503 }),
      ),
    );
    await goToInformation();
    const file = new File(["Business information"], "business-notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Choose files to upload"), { target: { files: [file] } });

    expect(
      await screen.findAllByText("This file could not be added. Check your connection or choose another file."),
    ).toHaveLength(2);
    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("test-upload.txt")).toBeInTheDocument();
  });
});
