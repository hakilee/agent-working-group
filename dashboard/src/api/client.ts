export interface QueueSummary {
  id: string;
  agent: string;
  state: 'pending' | 'processing' | 'processed' | 'dead';
  kind: string;
  from: string | null;
  to: string | null;
  priority: number;
  createdAt: string | null;
  createdAtMs: number | null;
  body: string;
  filename: string;
}

export interface QueueDetail extends QueueSummary {
  refs: Record<string, unknown>;
  message: Record<string, unknown>;
}

export interface WorkerSession {
  session: string;
  createdAt: number | null;
  uptimeSeconds: number | null;
  attached: boolean;
  windows: number;
  status: string;
  recentOutput?: string;
}

export interface SystemStatus {
  root: string;
  counts: Record<string, number>;
  totalQueueItems: number;
  agents: string[];
  workers: { total: number; attached: number; tmuxAvailable: boolean };
  recentActivity: Array<{
    id?: string;
    kind?: string;
    from?: string;
    to?: string;
    body?: string;
    createdAt?: string;
    createdAtMs?: number;
  }>;
  serverTime: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { Accept: 'application/json', ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  status: () => request<SystemStatus>('/api/status'),
  listQueue: (params?: { state?: string; agent?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.state) qs.set('state', params.state);
    if (params?.agent) qs.set('agent', params.agent);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<{ items: QueueSummary[]; total: number }>(`/api/queue${q ? `?${q}` : ''}`);
  },
  getQueueItem: (id: string) => request<QueueDetail>(`/api/queue/${encodeURIComponent(id)}`),
  listWorkers: () =>
    request<{ items: WorkerSession[]; total: number; tmuxAvailable: boolean }>('/api/workers'),
  getWorker: (session: string, lines = 200) =>
    request<WorkerSession>(`/api/workers/${encodeURIComponent(session)}?lines=${lines}`),
};

export function workerSocketUrl(session: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/workers/${encodeURIComponent(session)}`;
}
