"use client";

import { useQuery } from "@tanstack/react-query";
import type { ChannelType } from "@chatnova/shared";
import { api } from "./api";

export interface ChannelDto {
  id: string;
  type: ChannelType;
  name: string;
  externalId: string;
  phoneNumber?: string | null;
  status: string;
  createdAt: string;
}

export interface TemplateDto {
  id: string;
  channelId: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: any[];
  variableCount: number;
  headerFormat: string | null;
  bodyText?: string;
}

export interface MemberDto {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
}

export function useChannels() {
  return useQuery({ queryKey: ["channels"], queryFn: () => api<ChannelDto[]>("/api/channels") });
}

export function useTemplates(channelId?: string | null, approvedOnly = false) {
  return useQuery({
    queryKey: ["templates", channelId ?? "all"],
    queryFn: () => api<TemplateDto[]>(`/api/templates${channelId ? `?channelId=${channelId}` : ""}`),
    select: (list) => (approvedOnly ? list.filter((t) => t.status === "APPROVED") : list),
  });
}

export function useMembers() {
  return useQuery({
    queryKey: ["members"],
    queryFn: () => api<{ members: MemberDto[]; invites: any[] }>("/api/workspace/members"),
  });
}

export function useTags() {
  return useQuery({ queryKey: ["contact-tags"], queryFn: () => api<string[]>("/api/contacts/tags") });
}
