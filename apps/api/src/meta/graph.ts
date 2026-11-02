import { config } from "../config";

export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public raw?: unknown,
  ) {
    super(message);
  }
}

export const GRAPH_BASE = `https://graph.facebook.com/${config.meta.graphVersion}`;

type GraphOptions = {
  method?: "GET" | "POST" | "DELETE";
  token?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

export async function graph<T = any>(path: string, opts: GraphOptions = {}): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok || data?.error) {
    const err = data?.error;
    const message = err?.error_user_msg || err?.message || `Meta API error (${res.status})`;
    throw new GraphError(message, res.status, err?.code, data);
  }
  return data as T;
}

/** Downloads a binary resource (e.g. WhatsApp media URL) with the channel token. */
export async function graphDownload(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new GraphError(`Media download failed (${res.status})`, res.status);
  return Buffer.from(await res.arrayBuffer());
}
