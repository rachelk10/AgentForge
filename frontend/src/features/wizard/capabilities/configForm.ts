import { z } from "zod";
import type { ConfigField } from "../../../shared/api/capabilities";

export const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof weekdays)[number];

export type LeadField = { key: string; label: string; required: boolean };
export type TimeRange = { start: string; end: string };
export type Availability = Partial<Record<Weekday, TimeRange[]>>;
export type FormValue = string | string[] | LeadField[] | Availability;
export type FormValues = Record<string, FormValue>;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function stringSchema(field: ConfigField, strict: boolean) {
  const required = strict && field.required;
  return z.string().superRefine((raw, ctx) => {
    const value = raw.trim();
    if (value === "") {
      if (required) ctx.addIssue({ code: "custom", message: "required" });
      return;
    }
    if (field.type === "email" && !EMAIL.test(value)) ctx.addIssue({ code: "custom", message: "invalidEmail" });
    if (field.type === "select" && !(field.options ?? []).some((option) => option.value === value)) {
      ctx.addIssue({ code: "custom", message: "invalidOption" });
    }
    if (field.type === "number") {
      const number = Number(value);
      if (!Number.isFinite(number)) ctx.addIssue({ code: "custom", message: "invalidNumber" });
      else if (field.min != null && number < field.min) ctx.addIssue({ code: "custom", message: "tooSmall" });
      else if (field.max != null && number > field.max) ctx.addIssue({ code: "custom", message: "tooLarge" });
    }
    if ((field.type === "text" || field.type === "textarea") && field.max != null && value.length > field.max) {
      ctx.addIssue({ code: "custom", message: "tooLong" });
    }
  });
}

const leadFieldsSchema = (strict: boolean, required: boolean) =>
  z
    .array(z.object({ key: z.string(), label: z.string(), required: z.boolean() }))
    .superRefine((items, ctx) => {
      if (strict && required && items.length === 0) ctx.addIssue({ code: "custom", message: "required" });
      if (items.some((item) => item.label.trim() === "")) ctx.addIssue({ code: "custom", message: "emptyLabel" });
      if (new Set(items.map((item) => item.key)).size !== items.length) {
        ctx.addIssue({ code: "custom", message: "duplicate" });
      }
    });

const availabilitySchema = (strict: boolean, required: boolean) =>
  z.record(z.string(), z.array(z.object({ start: z.string(), end: z.string() }))).superRefine((schedule, ctx) => {
    const all = Object.values(schedule).flat();
    if (strict && required && all.length === 0) ctx.addIssue({ code: "custom", message: "missingDays" });
    for (const ranges of Object.values(schedule)) {
      if (ranges.some((range) => !TIME.test(range.start) || !TIME.test(range.end))) {
        ctx.addIssue({ code: "custom", message: "invalidTime" });
        return;
      }
      if (ranges.some((range) => range.start >= range.end)) {
        ctx.addIssue({ code: "custom", message: "rangeOrder" });
        return;
      }
      const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
      if (sorted.some((range, index) => index > 0 && range.start < sorted[index - 1].end)) {
        ctx.addIssue({ code: "custom", message: "overlap" });
        return;
      }
    }
  });

/** Builds validation from backend field definitions; required fields are enforced only when `strict`. */
export function buildConfigSchema(fields: ConfigField[], strict: boolean) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    if (field.type === "multiselect") {
      shape[field.key] = z.array(z.string()).refine((items) => !(strict && field.required) || items.length > 0, {
        message: "required",
      });
    } else if (field.type === "lead_fields") {
      shape[field.key] = leadFieldsSchema(strict, field.required);
    } else if (field.type === "weekly_availability") {
      shape[field.key] = availabilitySchema(strict, field.required);
    } else {
      shape[field.key] = stringSchema(field, strict);
    }
  }
  return z.object(shape);
}

export function emptyValue(field: ConfigField): FormValue {
  if (field.type === "multiselect" || field.type === "lead_fields") return [];
  if (field.type === "weekly_availability") return {};
  return "";
}

export function initialValues(fields: ConfigField[], saved: Record<string, unknown>): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    const source = saved[field.key] ?? field.default;
    if (source == null) values[field.key] = emptyValue(field);
    else if (typeof source === "number") values[field.key] = String(source);
    else values[field.key] = source as FormValue;
  }
  return values;
}

export function toPayload(fields: ConfigField[], values: FormValues): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") continue;
      config[field.key] = field.type === "number" ? Number(trimmed) : trimmed;
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue;
      config[field.key] =
        field.type === "lead_fields" ? (value as LeadField[]).map((item) => ({ ...item, label: item.label.trim() })) : value;
    } else {
      const schedule = Object.fromEntries(Object.entries(value).filter(([, ranges]) => ranges && ranges.length > 0));
      if (Object.keys(schedule).length > 0) config[field.key] = schedule;
    }
  }
  return config;
}

/** True when the saved settings plus catalog defaults would not satisfy the required fields. */
export function needsSetup(fields: ConfigField[], saved: Record<string, unknown>): boolean {
  return !buildConfigSchema(fields, true).safeParse(initialValues(fields, saved)).success;
}
