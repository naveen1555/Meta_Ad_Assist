import type { ChannelType } from "@chatnova/shared";
import type { MessageDto } from "./message-bubble";

export interface ContactDto {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  tags: string[];
  customFields: Record<string, string>;
  optIn: boolean;
  source?: string | null;
  createdAt: string;
}

export interface ConversationDto {
  id: string;
  status: "OPEN" | "PENDING" | "CLOSED";
  unreadCount: number;
  lastMessageAt: string;
  lastInboundAt?: string | null;
  windowOpen: boolean;
  contact: ContactDto;
  channel: { id: string; type: ChannelType; name: string; phoneNumber?: string | null };
  assignee?: { id: string; name: string; email: string } | null;
  lastMessage?: MessageDto | null;
}
