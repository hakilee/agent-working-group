import { useEffect, useRef, useState } from 'react';
import { WORKER_SOCKET_INITIAL_RETRY_MS, WORKER_SOCKET_MAX_RETRY_MS } from '../dashboard-rules';

export interface UseWebSocketState<T> {
  data: T | null;
  connected: boolean;
  error: string | null;
}

/**
 * Connect to a WebSocket URL and decode each JSON frame into `T`. Ignores
 * `{ type: "ping" }` heartbeats so consumers never see them as data.
 * Auto-reconnects with exponential backoff on close/error.
 */
export function useWebSocket<T>(url: string | null): UseWebSocketState<T> {
  const [data, setData] = useState<T | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track latest values inside refs so the effect's cleanup can read them
  // without re-running for every state change.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!url) return;
    cancelledRef.current = false;
    let ws: WebSocket | null = null;
    let retryMs = WORKER_SOCKET_INITIAL_RETRY_MS;
    let retryTimer: number | undefined;

    const connect = () => {
      if (cancelledRef.current) return;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        setError(String(err));
        return;
      }
      ws.onopen = () => {
        setConnected(true);
        setError(null);
        retryMs = WORKER_SOCKET_INITIAL_RETRY_MS;
      };
      ws.onclose = () => {
        setConnected(false);
        if (cancelledRef.current) return;
        retryTimer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, WORKER_SOCKET_MAX_RETRY_MS);
      };
      ws.onerror = () => {
        // onerror is always followed by onclose; let the close handler retry.
        ws?.close();
      };
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed && parsed.type === 'ping') return;
          setData(parsed as T);
        } catch (err) {
          setError(String(err));
        }
      };
    };

    connect();
    return () => {
      cancelledRef.current = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      ws?.close();
    };
  }, [url]);

  return { data, connected, error };
}
