import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "../../../app/LanguageProvider";
import type { Capability } from "../../../shared/api/capabilities";
import { server } from "../../../shared/api/mocks/server";
import { i18n } from "../../../shared/i18n";
import { CapabilitiesStep } from "./CapabilitiesStep";
import { buildConfigSchema, initialValues, needsSetup, toPayload } from "./configForm";

const api = "http://127.0.0.1:8000/api/v1";
const agentId = "11111111-1111-4111-8111-111111111111";

const text = (he: string, en: string) => ({ he, en });

const leadCapability: Capability = {
  id: "c0000000-0000-4000-8000-000000000001",
  key: "lead_collection",
  name: text("איסוף פרטי לקוחות", "Collecting customer details"),
  description: text("תיאור", "Asks visitors for their details."),
  default_enabled: false,
  locked: false,
  config_fields: [
    { key: "fields", type: "lead_fields", label: text("פרטים", "Details to collect"), required: true },
    { key: "notificationEmail", type: "email", label: text("דוא\"ל", "Notification email"), required: true },
  ],
};

const meetingCapability: Capability = {
  id: "c0000000-0000-4000-8000-000000000002",
  key: "meeting_scheduling",
  name: text("קביעת פגישות", "Scheduling meetings"),
  description: text("תיאור", "Books meetings."),
  default_enabled: false,
  locked: false,
  config_fields: [
    { key: "availability", type: "weekly_availability", label: text("זמינות", "Available hours"), required: true },
    { key: "durationMinutes", type: "number", label: text("משך", "Meeting length"), required: true, min: 5, max: 480, default: 30 },
  ],
};

const lockedCapability: Capability = {
  id: "c0000000-0000-4000-8000-000000000003",
  key: "calendar_sync",
  name: text("סנכרון ליומן", "Calendar sync"),
  description: text("תיאור", "Connects your calendar."),
  default_enabled: false,
  locked: true,
  config_fields: [],
};

type Saved = { capability_id: string; enabled: boolean; config: Record<string, unknown> };

function useBackend(catalog: Capability[], saved: Saved[] = []) {
  const puts: Array<{ id: string; body: { enabled: boolean; config: Record<string, unknown> } }> = [];
  server.use(
    http.get(`${api}/capabilities`, () => HttpResponse.json(catalog)),
    http.get(`${api}/agents/${agentId}/capabilities`, () =>
      HttpResponse.json(
        catalog.map((item) => saved.find((s) => s.capability_id === item.id) ?? { capability_id: item.id, enabled: false, config: {} }),
      ),
    ),
    http.put(`${api}/agents/${agentId}/capabilities/:capabilityId`, async ({ params, request }) => {
      const body = (await request.json()) as { enabled: boolean; config: Record<string, unknown> };
      puts.push({ id: String(params.capabilityId), body });
      return HttpResponse.json({ capability_id: params.capabilityId, ...body });
    }),
    http.get(`${api}/skills`, () => HttpResponse.json([])),
    http.get(`${api}/agents/${agentId}/skills`, () => HttpResponse.json([])),
  );
  return puts;
}

function renderStep() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <CapabilitiesStep agentId={agentId} token="test-token" />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("capability form definitions", () => {
  it("enforces required fields only in strict mode", () => {
    const fields = leadCapability.config_fields;

    expect(buildConfigSchema(fields, false).safeParse({ fields: [], notificationEmail: "" }).success).toBe(true);
    expect(buildConfigSchema(fields, true).safeParse({ fields: [], notificationEmail: "" }).success).toBe(false);
  });

  it("rejects overlapping or reversed availability ranges", () => {
    const schema = buildConfigSchema([meetingCapability.config_fields[0]], true);

    expect(schema.safeParse({ availability: { mon: [{ start: "09:00", end: "12:00" }] } }).success).toBe(true);
    expect(schema.safeParse({ availability: { mon: [{ start: "12:00", end: "09:00" }] } }).success).toBe(false);
    expect(
      schema.safeParse({
        availability: { mon: [{ start: "09:00", end: "11:00" }, { start: "10:00", end: "12:00" }] },
      }).success,
    ).toBe(false);
  });

  it("builds the saved payload from form values and catalog defaults", () => {
    const fields = meetingCapability.config_fields;
    const values = initialValues(fields, { availability: { mon: [{ start: "09:00", end: "12:00" }], tue: [] } });

    expect(toPayload(fields, values)).toEqual({
      availability: { mon: [{ start: "09:00", end: "12:00" }] },
      durationMinutes: 30,
    });
    expect(needsSetup(fields, {})).toBe(true);
    expect(needsSetup(fields, { availability: { mon: [{ start: "09:00", end: "12:00" }] } })).toBe(false);
  });
});

describe("Stage 4 capabilities step", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });
  afterEach(() => cleanup());

  it("renders every capability from the backend catalog, including newly added ones", async () => {
    const extra: Capability = { ...leadCapability, id: "c0000000-0000-4000-8000-000000000009", key: "brand_new", name: text("חדש", "Brand new capability") };
    useBackend([leadCapability, extra, lockedCapability]);
    renderStep();

    expect(await screen.findByRole("heading", { name: "Collecting customer details" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Brand new capability" })).toBeInTheDocument();
    expect(screen.queryByText(/lead_collection|brand_new/)).not.toBeInTheDocument();
  });

  it("shows locked capabilities with a lock and does not allow enabling them", async () => {
    useBackend([lockedCapability]);
    renderStep();

    const toggle = await screen.findByRole("switch", { name: "Turn on Calendar sync" });
    expect(toggle).toBeDisabled();
    expect(screen.getByText("Available in an advanced plan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Configure/ })).not.toBeInTheDocument();
  });

  it("opens a form built from the field definitions and validates before enabling", async () => {
    const puts = useBackend([leadCapability]);
    renderStep();

    fireEvent.click(await screen.findByRole("switch", { name: "Turn on Collecting customer details" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Notification email")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect((await within(dialog).findAllByRole("alert")).length).toBeGreaterThan(0);
    expect(puts).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Add Name" }));
    fireEvent.change(within(dialog).getByLabelText("Notification email"), { target: { value: "owner@example.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].id).toBe(leadCapability.id);
    expect(puts[0].body).toEqual({
      enabled: true,
      config: { fields: [{ key: "name", label: "Name", required: false }], notificationEmail: "owner@example.com" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Turn on Collecting customer details" })).toBeChecked();
  });

  it("turns off an enabled capability and keeps its saved settings", async () => {
    const config = { notificationEmail: "owner@example.com", fields: [{ key: "name", label: "Name", required: true }] };
    const puts = useBackend([leadCapability], [{ capability_id: leadCapability.id, enabled: true, config }]);
    renderStep();

    const toggle = await screen.findByRole("switch", { name: "Turn on Collecting customer details" });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ enabled: false, config });
  });

  it("shows an error with a retry when the catalog cannot be loaded", async () => {
    server.use(
      http.get(`${api}/capabilities`, () => HttpResponse.json({ detail: "down" }, { status: 500 })),
      http.get(`${api}/agents/${agentId}/capabilities`, () => HttpResponse.json([])),
      http.get(`${api}/skills`, () => HttpResponse.json([])),
      http.get(`${api}/agents/${agentId}/skills`, () => HttpResponse.json([])),
    );
    renderStep();

    expect(await screen.findByText(/capabilities could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("lets the owner pick ready-made behaviors from the real skills catalog", async () => {
    const skillId = "s0000000-0000-4000-8000-000000000001";
    const calls: string[] = [];
    useBackend([]);
    server.use(
      http.get(`${api}/skills`, () =>
        HttpResponse.json([
          { id: skillId, name: "Polite replies", description: "Keeps a courteous tone.", required_tool_names: [], version: 1, enabled: true, status: "published", visibility: "global", created_at: "", updated_at: "" },
          { id: "other", name: "Draft skill", description: "Hidden.", required_tool_names: [], version: 1, enabled: true, status: "draft", visibility: "global", created_at: "", updated_at: "" },
        ]),
      ),
      http.put(`${api}/skills/${skillId}/agents/${agentId}`, () => {
        calls.push("PUT");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderStep();

    const checkbox = await screen.findByRole("checkbox", { name: "Turn on Polite replies" }).catch(() => null);
    const toggle = checkbox ?? (await screen.findByRole("checkbox", { name: "Use Polite replies" }));
    expect(screen.queryByText("Draft skill")).not.toBeInTheDocument();
    expect(screen.getByText("Keeps a courteous tone.")).toBeInTheDocument();
    fireEvent.click(toggle);

    await waitFor(() => expect(calls).toEqual(["PUT"]));
  });
});
