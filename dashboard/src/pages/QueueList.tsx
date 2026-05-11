import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
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
  TabsList,
  TabsRoot,
  TabsTrigger,
  Text,
  VStack,
} from '@seed-design/react';
import { api, type QueueSummary } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { useQueueStream } from '../hooks/useQueueStream';

const FILTERS = ['all', 'pending', 'processing', 'processed', 'dead'] as const;
type Filter = (typeof FILTERS)[number];

export default function QueueList() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<QueueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const stream = useQueueStream();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listQueue({ state: filter === 'all' ? undefined : filter, limit: 500 })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setError(null);
      })
      .catch((err) => !cancelled && setError(String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter]);

  useEffect(() => {
    if (!stream) return;
    api
      .listQueue({ state: filter === 'all' ? undefined : filter, limit: 500 })
      .then((data) => {
        setItems(data.items);
        setError(null);
      })
      .catch((err) => setError(String(err)));
  }, [stream, filter]);

  const grouped = useMemo(() => items, [items]);

  return (
    <VStack gap="20px">
      <Text as="h1" textStyle="screenTitle">
        Queue
      </Text>

      <TabsRoot
        triggerLayout="hug"
        size="small"
        value={filter}
        onValueChange={(v) => setFilter(v as Filter)}
      >
        <TabsList>
          {FILTERS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {value}
            </TabsTrigger>
          ))}
        </TabsList>
      </TabsRoot>

      {error && (
        <CalloutRoot tone="critical">
          <CalloutContent>
            <CalloutTitle>Failed to load queue</CalloutTitle>
            <CalloutDescription>{error}</CalloutDescription>
          </CalloutContent>
        </CalloutRoot>
      )}

      {loading && (
        <VStack gap="8px">
          <Skeleton height="56px" radius="8" />
          <Skeleton height="56px" radius="8" />
          <Skeleton height="56px" radius="8" />
        </VStack>
      )}

      {!loading && grouped.length === 0 && !error && (
        <Box
          padding="32px"
          borderRadius="r3"
          borderWidth={1}
          borderColor="stroke.neutralMuted"
          style={{ textAlign: 'center' }}
        >
          <Text textStyle="t6Regular" color="fg.neutralMuted">
            No queue items.
          </Text>
        </Box>
      )}

      {!loading && grouped.length > 0 && (
        <ListRoot as="div">
          {grouped.map((item) => (
            <ListItem key={`${item.agent}/${item.filename}`} asChild>
              <button
                type="button"
                onClick={() => navigate(`/queue/${encodeURIComponent(item.id)}`)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 0,
                  font: 'inherit',
                  color: 'inherit',
                }}
              >
                <ListContent>
                  <ListTitle>
                    <HStack gap="8px" wrap="wrap" style={{ alignItems: 'center' }}>
                      <StatusBadge status={item.state} />
                      <Text textStyle="t6Medium" color="fg.neutralMuted">
                        {item.kind}
                      </Text>
                      <Text textStyle="t7Regular" color="fg.neutralSubtle">
                        {item.agent}
                      </Text>
                    </HStack>
                  </ListTitle>
                  <ListDetail>
                    <Text textStyle="t6Regular">
                      {item.body.split('\n')[0].slice(0, 96) || '(empty)'}
                    </Text>
                    <Text
                      as="p"
                      textStyle="t7Regular"
                      color="fg.neutralSubtle"
                      style={{ marginTop: 4 }}
                    >
                      {item.from ?? '?'} → {item.to ?? '?'} ·{' '}
                      {item.createdAt ?? '—'}
                    </Text>
                  </ListDetail>
                </ListContent>
              </button>
            </ListItem>
          ))}
        </ListRoot>
      )}
    </VStack>
  );
}
