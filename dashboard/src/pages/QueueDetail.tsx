import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ActionButton,
  Box,
  CalloutContent,
  CalloutDescription,
  CalloutRoot,
  CalloutTitle,
  HStack,
  ListContent,
  ListDetail,
  ListItem,
  ListRoot,
  ListTitle,
  Skeleton,
  Text,
  VStack,
} from '@seed-design/react';
import { api, type QueueDetail } from '../api/client';
import StatusBadge from '../components/StatusBadge';

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <ListItem highlighted>
      <ListContent>
        <ListTitle>
          <Text textStyle="t7Regular" color="fg.neutralSubtle">
            {label}
          </Text>
        </ListTitle>
        <ListDetail>
          <Text textStyle="t6Medium">{value}</Text>
        </ListDetail>
      </ListContent>
    </ListItem>
  );
}

function JsonBlock({ children }: { children: React.ReactNode }) {
  return (
    <CalloutRoot tone="neutral">
      <CalloutContent>
        <CalloutDescription>
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {children}
          </pre>
        </CalloutDescription>
      </CalloutContent>
    </CalloutRoot>
  );
}

export default function QueueDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<QueueDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getQueueItem(id)
      .then((data) => !cancelled && setItem(data))
      .catch((err) => !cancelled && setError(String(err)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <VStack gap="20px">
      <HStack justify="space-between" style={{ alignItems: 'center' }}>
        <ActionButton variant="ghost" size="small" onClick={() => navigate(-1)}>
          ← Back
        </ActionButton>
        {item && <StatusBadge status={item.state} />}
      </HStack>

      {error && (
        <CalloutRoot tone="critical">
          <CalloutContent>
            <CalloutTitle>Failed to load message</CalloutTitle>
            <CalloutDescription>{error}</CalloutDescription>
          </CalloutContent>
        </CalloutRoot>
      )}

      {!error && !item && (
        <VStack gap="8px">
          <Skeleton height="32px" radius="8" />
          <Skeleton height="120px" radius="8" />
          <Skeleton height="120px" radius="8" />
        </VStack>
      )}

      {item && (
        <>
          <Box
            padding="16px"
            borderRadius="r3"
            borderWidth={1}
            borderColor="stroke.neutralMuted"
            background="bg.layerFill"
          >
            <HStack gap="8px" wrap="wrap" style={{ alignItems: 'baseline' }}>
              <StatusBadge status={item.kind || 'msg'} />
              <Text textStyle="t6Medium">{item.from ?? '?'}</Text>
              <Text textStyle="t6Regular" color="fg.neutralSubtle">
                →
              </Text>
              <Text textStyle="t6Medium">{item.to ?? '?'}</Text>
              <Text
                textStyle="t8Bold"
                color="fg.neutralSubtle"
                style={{ marginLeft: 'auto' }}
              >
                {item.createdAt ?? '—'}
              </Text>
            </HStack>
          </Box>

          <section>
            <Text
              as="h2"
              textStyle="t5Bold"
              color="fg.neutralMuted"
              style={{ marginBottom: 8, display: 'block' }}
            >
              Metadata
            </Text>
            <ListRoot>
              <KVRow label="id" value={item.id} />
              <KVRow label="priority" value={item.priority} />
              <KVRow label="agent" value={item.agent} />
              <KVRow label="filename" value={item.filename} />
            </ListRoot>
          </section>

          <section>
            <Text
              as="h2"
              textStyle="t5Bold"
              color="fg.neutralMuted"
              style={{ marginBottom: 8, display: 'block' }}
            >
              Body
            </Text>
            <JsonBlock>{item.body || '(empty)'}</JsonBlock>
          </section>

          {Object.keys(item.refs ?? {}).length > 0 && (
            <section>
              <Text
                as="h2"
                textStyle="t5Bold"
                color="fg.neutralMuted"
                style={{ marginBottom: 8, display: 'block' }}
              >
                Refs
              </Text>
              <JsonBlock>{JSON.stringify(item.refs, null, 2)}</JsonBlock>
            </section>
          )}

          <section>
            <Text
              as="h2"
              textStyle="t5Bold"
              color="fg.neutralMuted"
              style={{ marginBottom: 8, display: 'block' }}
            >
              Raw message
            </Text>
            <JsonBlock>{JSON.stringify(item.message, null, 2)}</JsonBlock>
          </section>
        </>
      )}
    </VStack>
  );
}
