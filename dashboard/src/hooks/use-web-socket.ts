import { useEffect, useRef, useState } from 'react';
import { WORKER_SOCKET_INITIAL_RETRY_MS, WORKER_SOCKET_MAX_RETRY_MS } from '../dashboard-rules';

export interface UseWebSocketState<T> {
  data: T | null;
  connected: boolean;
  error: string | null;
  retryInMs: number | null;
  lastMessageAt: number | null;
}

export function useWebSocket<T>(url: string | null): UseWebSocketState<T> {
  const [data, setData] = useState<T | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryInMs, setRetryInMs] = useState<number | null>(null);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!url) return;
    cancelledRef.current = false;
    let ws: WebSocket | null = null;
    let retryMs = WORKER_SOCKET_INITIAL_RETRY_MS;
    let retryTimer: number | undefined;

    const scheduleReconnect = (message: string) => {
      if (cancelledRef.current) return;
      const delay = retryMs;
      setConnected(false);
      setError(message);
      setRetryInMs(delay);
      retryTimer = window.setTimeout(connect, delay);
      retryMs = Math.min(retryMs * 2, WORKER_SOCKET_MAX_RETRY_MS);
    };

    const connect = () => {
      if (cancelledRef.current) return;
      setRetryInMs(null);
      try {
        ws = new WebSocket(url);
      } catch (err) {
        scheduleReconnect(`socket open failed: ${String(err)}`);
        return;
      }
      ws.onopen = () => {
        setConnected(true);
        setError(null);
        setRetryInMs(null);
        retryMs = WORKER_SOCKET_INITIAL_RETRY_MS;
      };
      ws.onclose = () => {
        scheduleReconnect('live updates disconnected; retrying');
      };
      ws.onerror = () => {
        ws?.close();
      };
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed && parsed.type === 'ping') {
            setLastMessageAt(Date.now());
            return;
          }
          setData(parsed as T);
          setLastMessageAt(Date.now());
          setError(null);
        } catch (err) {
          setError(`invalid socket frame: ${String(err)}`);
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

  return { data, connected, error, retryInMs, lastMessageAt };
}
