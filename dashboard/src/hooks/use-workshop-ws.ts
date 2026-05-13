import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  api,
  workshopStreamUrl,
  type AgentSummary,
  type WorkshopAgentState,
  type WorkshopSnapshot,
} from '../api/client';
import { WORKER_SOCKET_INITIAL_RETRY_MS, WORKER_SOCKET_MAX_RETRY_MS } from '../dashboard-rules';

export interface UseWorkshopWS {
  agentPositions: Record<string, WorkshopAgentState>;
  queueAgents: AgentSummary[];
  connected: boolean;
  error: string | null;
  /** Increments each time an authoritative workshop snapshot arrives. */
  snapshotNonce: number;
  /** Increments each time queue data is confirmed by WS or REST fallback. */
  queuesNonce: number;
  sendAgentUpdate: (role: string, state: WorkshopAgentState) => void;
}

interface QueueFrame {
  type: 'queues';
  agents?: AgentSummary[];
}

const REST_FALLBACK_INTERVAL_MS = 8000;
const SOCKET_STALE_RECONNECT_MS = 45_000;

function mergeSnapshotAgents(
  setAgentPositions: Dispatch<SetStateAction<Record<string, WorkshopAgentState>>>,
  setSnapshotNonce: Dispatch<SetStateAction<number>>,
  snap: WorkshopSnapshot,
): void {
  if (!snap?.agents) return;
  setAgentPositions(snap.agents);
  setSnapshotNonce((n) => n + 1);
}

export function useWorkshopWS(): UseWorkshopWS {
  const [agentPositions, setAgentPositions] = useState<Record<string, WorkshopAgentState>>({});
  const [queueAgents, setQueueAgents] = useState<AgentSummary[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotNonce, setSnapshotNonce] = useState(0);
  const [queuesNonce, setQueuesNonce] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const lastFrameAtRef = useRef(0);
  const fallbackInFlightRef = useRef(false);

  const refreshFromRest = useCallback(async () => {
    if (fallbackInFlightRef.current) return;
    fallbackInFlightRef.current = true;
    try {
      const [snap, queues] = await Promise.all([api.getWorkshop(), api.listQueues()]);
      mergeSnapshotAgents(setAgentPositions, setSnapshotNonce, snap);
      if (Array.isArray(queues.agents)) {
        setQueueAgents(queues.agents);
        setQueuesNonce((n) => n + 1);
      }
    } finally {
      fallbackInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshFromRest().catch(() => {
      // WS can still recover; the visible connection state is handled below.
    });
  }, [refreshFromRest]);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retryMs = WORKER_SOCKET_INITIAL_RETRY_MS;
    let retryTimer: number | undefined;
    const url = workshopStreamUrl();

    const scheduleReconnect = (msg: string) => {
      if (cancelled) return;
      setConnected(false);
      setError(msg);
      retryTimer = window.setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, WORKER_SOCKET_MAX_RETRY_MS);
      refreshFromRest().catch(() => undefined);
    };

    const connect = () => {
      if (cancelled) return;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        scheduleReconnect(`workshop socket failed: ${String(err)}`);
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        lastFrameAtRef.current = Date.now();
        setConnected(true);
        setError(null);
        retryMs = WORKER_SOCKET_INITIAL_RETRY_MS;
        refreshFromRest().catch(() => undefined);
      };
      ws.onclose = () => {
        wsRef.current = null;
        scheduleReconnect('workshop ws disconnected; retrying');
      };
      ws.onerror = () => {
        ws?.close();
      };
      ws.onmessage = (ev) => {
        lastFrameAtRef.current = Date.now();
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== 'object') return;
        const frame = parsed as Record<string, unknown>;
        if (frame.type === 'ping') return;
        if (frame.type === 'workshop') {
          mergeSnapshotAgents(setAgentPositions, setSnapshotNonce, frame as unknown as WorkshopSnapshot);
          return;
        }
        if (frame.type === 'queues') {
          const q = frame as unknown as QueueFrame;
          if (Array.isArray(q.agents)) setQueueAgents(q.agents);
          setQueuesNonce((n) => n + 1);
          return;
        }
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      ws?.close();
      wsRef.current = null;
    };
  }, [refreshFromRest]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      const ws = wsRef.current;
      const stale = lastFrameAtRef.current > 0 && now - lastFrameAtRef.current > REST_FALLBACK_INTERVAL_MS;
      if (!connected || stale) {
        refreshFromRest().catch(() => undefined);
      }
      if (ws && ws.readyState === WebSocket.OPEN && now - lastFrameAtRef.current > SOCKET_STALE_RECONNECT_MS) {
        ws.close();
      }
    }, REST_FALLBACK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [connected, refreshFromRest]);

  const sendAgentUpdate = useCallback((role: string, state: WorkshopAgentState) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setAgentPositions((prev) => ({ ...prev, [role]: { ...prev[role], ...state } }));
      return;
    }
    try {
      ws.send(JSON.stringify({ type: 'agentUpdate', role, state }));
      setAgentPositions((prev) => ({ ...prev, [role]: { ...prev[role], ...state } }));
    } catch {
      refreshFromRest().catch(() => undefined);
    }
  }, [refreshFromRest]);

  return { agentPositions, queueAgents, connected, error, snapshotNonce, queuesNonce, sendAgentUpdate };
}
