import { API_REQUEST_TIMEOUT_MS, WORKER_TERMINAL_LINES } from '../dashboard-rules';

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

export interface WorkerWindow {
  index: number;
  name: string;
  active: boolean;
  panes: number;
  flags: string;
}

export interface WorkerSession {
  session: string;
  createdAt: number | null;
  uptimeSeconds: number | null;
  attached: boolean;
  windows: number;
  windowItems: WorkerWindow[];
  status: string;
  recentOutput?: string;
}

export interface WorkerActionResponse {
  queued: boolean;
  messageId: string;
}

export interface SystemStatus {
  root: string;
  rootSource: 'env' | 'auto';
  queuePath: string;
  queuePathExists: boolean;
  isTmpRoot: boolean;
  distPath?: string | null;
  distPathExists?: boolean | null;
  staticAssetsExist?: boolean | null;
  counts: Record<string, number>;
  totalQueueItems: number;
  agents: string[];
  workers: { total: number; attached: number; tmuxAvailable: boolean };
  readiness?: {
    ok: boolean;
    level: 'ok' | 'degraded';
    issues: string[];
  };
  recentActivity: Array<{
    id?: string;
    state?: 'pending' | 'processing' | 'processed' | 'dead' | 'logged';
    agent?: string | null;
    kind?: string;
    from?: string | null;
    to?: string | null;
    body?: string;
    createdAt?: string | null;
    createdAtMs?: number | null;
  }>;
  serverTime: number;
}

export interface AgentSummary {
  agent: string;
  counts: Record<string, number>;
  total: number;
}

export interface QueuesIndex {
  root: string;
  agents: AgentSummary[];
}

export interface AgentQueueList {
  agent: string;
  counts: Record<string, number>;
  items: QueueSummary[];
  total: number;
}

export interface HeartbeatEntry {
  agent: string;
  session: string;
  status: 'fresh' | 'stale' | 'missing';
  timestamp: number | null;
  ageSeconds: number | null;
  timeoutSeconds: number;
}

export interface HeartbeatList {
  items: HeartbeatEntry[];
  counts: Record<string, number>;
  total: number;
}

export interface TimeoutItem {
  agent: string;
  messageId: string;
  file: string;
  ageSeconds: number;
  timeoutSeconds: number;
  timestampSource: string;
}

export interface TimeoutList {
  items: TimeoutItem[];
  total: number;
  timeoutSeconds: number;
}

export interface ContractBreach {
  agent: string;
  messageId: string;
  file: string;
  location: string;
  expectedSeconds: number;
  actualSeconds: number;
}

export interface ContractList {
  items: ContractBreach[];
  total: number;
}

export interface HealthInfo {
  ok: boolean;
  version: string;
  uptimeSeconds: number;
  awgRoot: string;
  queuePath?: string;
  queuePathExists?: boolean;
  isTmpRoot?: boolean;
  tmuxAvailable?: boolean;
  distPath?: string;
  distPathExists?: boolean;
  staticAssetsExist?: boolean;
  issues?: string[];
  counts: Record<string, number>;
  totalQueueItems: number;
  serverTime: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      let detail = '';
      try {
        const payload = await res.json();
        detail = typeof payload?.detail === 'string' ? payload.detail : JSON.stringify(payload);
      } catch {
        detail = await res.text().catch(() => '');
      }
      throw new Error(`API ${path} failed: ${res.status}${detail ? ` ${detail.slice(0, 240)}` : ''}`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`API ${path} timed out after ${API_REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  status: () => request<SystemStatus>('/api/status'),
  health: () => request<HealthInfo>('/api/health'),
  listQueue: (params?: { state?: string; agent?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.state) qs.set('state', params.state);
    if (params?.agent) qs.set('agent', params.agent);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<{ items: QueueSummary[]; total: number }>(`/api/queue${q ? `?${q}` : ''}`);
  },
  getQueueItem: (id: string) => request<QueueDetail>(`/api/queue/${encodeURIComponent(id)}`),
  listQueues: () => request<QueuesIndex>('/api/queues'),
  listAgentMessages: (
    agent: string,
    params?: { status?: string; limit?: number },
  ) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<AgentQueueList>(
      `/api/queues/${encodeURIComponent(agent)}${q ? `?${q}` : ''}`,
    );
  },
  getAgentMessage: (agent: string, messageId: string) =>
    request<QueueDetail>(
      `/api/queues/${encodeURIComponent(agent)}/${encodeURIComponent(messageId)}`,
    ),
  listWorkers: () =>
    request<{ items: WorkerSession[]; total: number; tmuxAvailable: boolean }>('/api/workers'),
  getWorker: (session: string, lines = WORKER_TERMINAL_LINES, window?: number) => {
    const qs = new URLSearchParams({ lines: String(lines) });
    if (window !== undefined) qs.set('window', String(window));
    return request<WorkerSession>(`/api/workers/${encodeURIComponent(session)}?${qs.toString()}`);
  },
  requestWorkerAction: (session: string, action: 'close-session' | 'close-window', options?: { window?: number; reason?: string }) =>
    request<WorkerActionResponse>(`/api/workers/${encodeURIComponent(session)}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...options }),
    }),
  getWorkshop: () => request<WorkshopSnapshot>('/api/workshop'),
  liveness: {
    heartbeats: (timeoutSeconds?: number) => {
      const qs = timeoutSeconds ? `?timeoutSeconds=${timeoutSeconds}` : '';
      return request<HeartbeatList>(`/api/liveness/heartbeats${qs}`);
    },
    timeouts: (timeoutSeconds?: number) => {
      const qs = timeoutSeconds ? `?timeoutSeconds=${timeoutSeconds}` : '';
      return request<TimeoutList>(`/api/liveness/timeouts${qs}`);
    },
    contracts: () => request<ContractList>('/api/liveness/contracts'),
  },
};

function wsBase(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}`;
}

export function workerSocketUrl(session: string, window?: number): string {
  if (window !== undefined) return `${wsBase()}/ws/workers/${encodeURIComponent(session)}/windows/${window}`;
  return `${wsBase()}/ws/workers/${encodeURIComponent(session)}`;
}

export function queueStreamUrl(): string {
  return `${wsBase()}/ws/queues`;
}

export function livenessStreamUrl(): string {
  return `${wsBase()}/ws/liveness`;
}

export function workshopStreamUrl(): string {
  return `${wsBase()}/ws/workshop`;
}

export interface WorkshopAgentState {
  tileCol?: number;
  tileRow?: number;
  dir?: number;
  state?: string;
  updatedAt?: number;
  [key: string]: unknown;
}

export interface WorkshopSnapshot {
  type: 'workshop';
  agents: Record<string, WorkshopAgentState>;
  layoutVersion: number;
  ts: number;
}
