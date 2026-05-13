import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Increments each time an authoritative workshop snapshot arrives (initial
   *  load via REST, initial WS frame, and any subsequent WS-pushed snapshot).
   *  Consumers use this to reconcile to server positions without firing on
   *  every local optimistic update. */
  snapshotNonce: number;
  /** Increments each time a queues frame is received (including the first
   *  empty one). Lets the page distinguish "no queue data yet" from "queue
   *  data confirmed empty" so it can hold the loading curtain until the
   *  character set is known. */
  queuesNonce: number;
  sendAgentUpdate: (role: string, state: WorkshopAgentState) => void;
}

interface QueueFrame {
  type: 'queues';
  agents?: AgentSummary[];
}

export function useWorkshopWS(): UseWorkshopWS {
  const [agentPositions, setAgentPositions] = useState<Record<string, WorkshopAgentState>>({});
  const [queueAgents, setQueueAgents] = useState<AgentSummary[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotNonce, setSnapshotNonce] = useState(0);
  const [queuesNonce, setQueuesNonce] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Initial REST fetch for positions as a fallback when WS is slow.
  useEffect(() => {
    let cancelled = false;
    api
      .getWorkshop()
      .then((snap) => {
        if (cancelled) return;
        if (snap?.agents) {
          setAgentPositions((prev) => ({ ...snap.agents, ...prev }));
          setSnapshotNonce((n) => n + 1);
        }
      })
      .catch(() => {
        // WS will deliver an initial snapshot; ignore REST failure.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        setConnected(true);
        setError(null);
        retryMs = WORKER_SOCKET_INITIAL_RETRY_MS;
      };
      ws.onclose = () => {
        wsRef.current = null;
        scheduleReconnect('workshop ws disconnected; retrying');
      };
      ws.onerror = () => {
        ws?.close();
      };
      ws.onmessage = (ev) => {
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
          const snap = frame as unknown as WorkshopSnapshot;
          if (snap.agents) {
            setAgentPositions(snap.agents);
            setSnapshotNonce((n) => n + 1);
          }
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
  }, []);

  const sendAgentUpdate = useCallback((role: string, state: WorkshopAgentState) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // Optimistically reflect locally so the next reconnect snapshot lines up.
      setAgentPositions((prev) => ({ ...prev, [role]: { ...prev[role], ...state } }));
      return;
    }
    try {
      ws.send(JSON.stringify({ type: 'agentUpdate', role, state }));
      setAgentPositions((prev) => ({ ...prev, [role]: { ...prev[role], ...state } }));
    } catch {
      // ignore — onclose will retry
    }
  }, []);

  return { agentPositions, queueAgents, connected, error, snapshotNonce, queuesNonce, sendAgentUpdate };
}
