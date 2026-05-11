import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ActionButton,
  Badge,
  Box,
  CalloutContent,
  CalloutDescription,
  CalloutRoot,
  CalloutTitle,
  HStack,
  Text,
  VStack,
} from '@seed-design/react';
import { api, workerSocketUrl, type WorkerSession } from '../api/client';
import TerminalOutput from '../components/TerminalOutput';

type WSMessage =
  | { type: 'snapshot' | 'update'; session: string; data: string; ts: number }
  | { type: 'ping'; ts: number };

const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export default function WorkerTerminal() {
  const { session = '' } = useParams<{ session: string }>();
  const navigate = useNavigate();
  const [worker, setWorker] = useState<WorkerSession | null>(null);
  const [output, setOutput] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getWorker(session)
      .then((data) => {
        if (cancelled) return;
        setWorker(data);
        if (data.recentOutput) setOutput(data.recentOutput);
      })
      .catch((err) => !cancelled && setError(String(err)));
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let ws: WebSocket | null = null;
    let retryMs = RECONNECT_INITIAL_MS;
    let retryTimer: number | undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(workerSocketUrl(session));
      ws.onopen = () => {
        setConnected(true);
        retryMs = RECONNECT_INITIAL_MS;
      };
      ws.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        retryTimer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, RECONNECT_MAX_MS);
      };
      ws.onerror = () => {
        ws?.close();
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WSMessage;
          if (msg.type === 'snapshot' || msg.type === 'update') setOutput(msg.data);
        } catch {
          /* ignore */
        }
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      ws?.close();
    };
  }, [session]);

  return (
    <VStack gap="16px">
      <HStack justify="space-between" gap="8px" style={{ alignItems: 'center' }}>
        <ActionButton variant="ghost" size="small" onClick={() => navigate('/workers')}>
          ← Back
        </ActionButton>
        <Badge
          tone={connected ? 'positive' : 'neutral'}
          variant="weak"
          size="medium"
        >
          {connected ? 'streaming' : 'disconnected'}
        </Badge>
      </HStack>

      <Box
        padding="12px 16px"
        borderRadius="r3"
        borderWidth={1}
        borderColor="stroke.neutralMuted"
        background="bg.layerFill"
      >
        <Text as="p" textStyle="t5Bold">
          {session}
        </Text>
        {worker && (
          <Text
            as="p"
            textStyle="t7Regular"
            color="fg.neutralMuted"
            style={{ marginTop: 4 }}
          >
            status: {worker.status} · windows: {worker.windows} · attached:{' '}
            {worker.attached ? 'yes' : 'no'}
          </Text>
        )}
      </Box>

      {error && (
        <CalloutRoot tone="critical">
          <CalloutContent>
            <CalloutTitle>Worker error</CalloutTitle>
            <CalloutDescription>{error}</CalloutDescription>
          </CalloutContent>
        </CalloutRoot>
      )}

      <TerminalOutput text={output} />
    </VStack>
  );
}
