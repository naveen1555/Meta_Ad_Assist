"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface AnalyticsOverview {
  totals: {
    inbound: number;
    outbound: number;
    leads: number;
    qualifiedLeads: number;
    contactsTotal: number;
    contactsNew: number;
    openConversations: number;
    avgResponseSec: number | null;
  };
  daily: { date: string; inbound: number; outbound: number; leads: number }[];
  leadSources: { source: string; count: number }[];
  channels: { type: string; c: number }[];
  campaigns: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
    total?: number;
    funnelSent?: number;
    funnelDelivered?: number;
    funnelRead?: number;
    replied?: number;
    failed?: number;
  }[];
}

export const CHART_COLORS = ["#5B21B6", "#FF6B6B", "#10B981", "#F59E0B", "#8B5CF6", "#0EA5E9"];

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const tooltipStyle = { borderRadius: 10, border: "1px solid #E9E5F5", fontSize: 12 };

export function MessagesChart({ data, height = 280 }: { data: AnalyticsOverview["daily"]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5B21B6" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#5B21B6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF6B6B" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#FF6B6B" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#EEEAF7" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => shortDate(String(l))} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="inbound" name="Received" stroke="#5B21B6" strokeWidth={2} fill="url(#gIn)" />
        <Area type="monotone" dataKey="outbound" name="Sent" stroke="#FF6B6B" strokeWidth={2} fill="url(#gOut)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LeadsChart({ data, height = 240 }: { data: AnalyticsOverview["daily"]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EEEAF7" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => shortDate(String(l))} cursor={{ fill: "#F3F0FB" }} />
        <Bar dataKey="leads" name="Leads" fill="#5B21B6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 220 }: { data: { name: string; value: number }[]; height?: number }) {
  if (!data.some((d) => d.value > 0)) {
    return <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>No data yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
