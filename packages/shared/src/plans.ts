export type PlanId = "free" | "starter" | "growth" | "pro";

export interface PlanLimits {
  /** -1 means unlimited */
  contacts: number;
  messagesPerMonth: number;
  agents: number;
  flows: number;
  channels: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  priceInr: number;
  priceUsd: number;
  popular?: boolean;
  limits: PlanLimits;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Try the platform with one number",
    priceInr: 0,
    priceUsd: 0,
    limits: { contacts: 500, messagesPerMonth: 1000, agents: 1, flows: 2, channels: 1 },
    features: [
      "1 channel (WhatsApp, Messenger or Instagram)",
      "500 contacts",
      "1,000 messages / month",
      "2 chatbot flows",
      "Lead Ads instant reply",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For small teams replying to ad leads",
    priceInr: 1499,
    priceUsd: 19,
    limits: { contacts: 5000, messagesPerMonth: 10000, agents: 3, flows: 10, channels: 3 },
    features: [
      "3 channels",
      "5,000 contacts",
      "10,000 messages / month",
      "3 team members",
      "10 chatbot flows",
      "Broadcast campaigns",
      "Webhooks & Google Sheets",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    tagline: "Scale conversations across channels",
    priceInr: 3999,
    priceUsd: 49,
    popular: true,
    limits: { contacts: 25000, messagesPerMonth: 50000, agents: 10, flows: 50, channels: 6 },
    features: [
      "6 channels",
      "25,000 contacts",
      "50,000 messages / month",
      "10 team members",
      "50 chatbot flows",
      "REST API access",
      "Advanced analytics",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Unlimited automation for agencies",
    priceInr: 7999,
    priceUsd: 99,
    limits: { contacts: -1, messagesPerMonth: 200000, agents: -1, flows: -1, channels: 20 },
    features: [
      "20 channels",
      "Unlimited contacts",
      "200,000 messages / month",
      "Unlimited team members",
      "Unlimited flows",
      "Priority support",
    ],
  },
};

export const PLAN_LIST: Plan[] = [PLANS.free, PLANS.starter, PLANS.growth, PLANS.pro];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in PLANS;
}

export function formatLimit(value: number): string {
  return value < 0 ? "Unlimited" : value.toLocaleString("en-IN");
}
