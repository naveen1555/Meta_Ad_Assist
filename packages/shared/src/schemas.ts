import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  workspaceName: z.string().min(2).max(80),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const contactInputSchema = z.object({
  name: z.string().max(120).optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  tags: z.array(z.string().max(40)).optional(),
  customFields: z.record(z.string()).optional(),
  optIn: z.boolean().optional(),
});

export const leadSettingsSchema = z.object({
  enabled: z.boolean(),
  channelId: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
  variables: z.array(z.string()).default([]),
  assignMode: z.enum(["none", "round_robin", "user"]).default("none"),
  assigneeId: z.string().nullable().optional(),
  defaultCountryCode: z.string().regex(/^\d{0,4}$/).default("91"),
  tags: z.array(z.string()).default(["lead"]),
});

export type LeadSettings = z.infer<typeof leadSettingsSchema>;

export const DEFAULT_LEAD_SETTINGS: LeadSettings = {
  enabled: false,
  channelId: null,
  templateId: null,
  variables: ["{{name}}"],
  assignMode: "none",
  assigneeId: null,
  defaultCountryCode: "91",
  tags: ["lead"],
};

export const broadcastInputSchema = z.object({
  name: z.string().min(1).max(120),
  channelId: z.string(),
  templateId: z.string(),
  variables: z.array(z.string()).default([]),
  audience: z.object({
    tags: z.array(z.string()).default([]),
    optInOnly: z.boolean().default(true),
  }),
  scheduledAt: z.string().datetime().optional().nullable(),
});

export const INTEGRATION_EVENTS = [
  "lead.created",
  "contact.created",
  "message.received",
] as const;

export type IntegrationEvent = (typeof INTEGRATION_EVENTS)[number];

export const integrationInputSchema = z.object({
  type: z.enum(["webhook", "google_sheets"]),
  name: z.string().min(1).max(80),
  events: z.array(z.enum(INTEGRATION_EVENTS)).min(1),
  active: z.boolean().default(true),
  config: z.object({
    url: z.string().url().optional(),
    secret: z.string().optional(),
    spreadsheetId: z.string().optional(),
    sheetName: z.string().optional(),
  }),
});
