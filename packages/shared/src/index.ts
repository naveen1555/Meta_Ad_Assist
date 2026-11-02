export * from "./plans";
export * from "./flow";
export * from "./schemas";

export type Role = "OWNER" | "ADMIN" | "AGENT";
export type ChannelType = "WHATSAPP" | "MESSENGER" | "INSTAGRAM";

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  WHATSAPP: "WhatsApp",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
};

export const BRAND = {
  name: "ChatNova",
  tagline: "Turn Meta ads into WhatsApp conversations that convert",
} as const;
