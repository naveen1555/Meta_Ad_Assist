import crypto from "node:crypto";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(secret: string, payload: string | Buffer) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Normalises a phone number to digits only (WhatsApp wa_id format), adding a default country code to bare local numbers. */
export function normalizePhone(input: string | null | undefined, defaultCountryCode = "91"): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && defaultCountryCode) digits = defaultCountryCode + digits;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export interface RenderContext {
  contact?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    customFields?: unknown;
  } | null;
  vars?: Record<string, unknown>;
  fields?: Record<string, unknown>;
}

/** Replaces {{name}}, {{phone}}, {{email}}, {{field.key}}, {{var.key}} and {{lead.key}} placeholders. */
export function renderText(template: string | null | undefined, ctx: RenderContext): string {
  if (!template) return "";
  const custom = (ctx.contact?.customFields as Record<string, unknown>) || {};
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const [scope, ...rest] = key.split(".");
    const sub = rest.join(".");
    let value: unknown;
    if (scope === "name") value = ctx.contact?.name?.split(" ")[0] || ctx.contact?.name || "there";
    else if (scope === "full_name") value = ctx.contact?.name;
    else if (scope === "phone") value = ctx.contact?.phone;
    else if (scope === "email") value = ctx.contact?.email;
    else if (scope === "field") value = custom[sub];
    else if (scope === "var") value = ctx.vars?.[sub];
    else if (scope === "lead") value = ctx.fields?.[sub];
    else value = ctx.vars?.[key] ?? custom[key];
    return value == null ? "" : String(value);
  });
}

export function currentPeriod(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}
