import { useEffect, useMemo, useState } from 'react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import type { ActivityComponentType } from '@stackflow/react';
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
  TabsList,
  TabsRoot,
  TabsTrigger,
  Text,
  VStack,
} from '@seed-design/react';
import { api, type QueueSummary } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import BottomTabs from '../components/BottomTabs';
import { useQueueStream } from '../hooks/useQueueStream';
import { useFlow } from '../stackflow';

const FILTERS = ['all', 'pending', 'processing', 'processed', 'dead'] as const;
type Filter = (typeof FILTERS)[number];

const QueueList: ActivityComponentType = () => {
  const flow = useFlow();
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
    <AppScreen appBar={{ title: 'Queue' }}>
      <Box padding="16px" paddingBottom="96px" style={{ minHeight: '100%' }}>
        <VStack gap="20px">
          <HStack justify="space-between" align="center">
            <Text as="h1" textStyle="screenTitle">
              Queue
            </Text>
          </HStack>

          <TabsRoot
            triggerLayout="hug"
            size="small"
            value={filter}
            onValueChange={(value) => setFilter(value as Filter)}
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

          {!loading && grouped.length === 0 && (
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
                    onClick={() => flow.push('QueueDetail', { id: item.id })}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: 'transparent',
                      border: 0,
                    }}
                  >
                    <ListContent>
                    <ListTitle>
                      <HStack gap="8px" align="center" wrap="wrap">
                        <StatusBadge status={item.state} />
                        <Text
                          textStyle="t6Medium"
                          color="fg.neutralMuted"
                          className="awg-mono"
                        >
                          {item.kind}
                        </Text>
                        <Text
                          textStyle="t6Regular"
                          color="fg.neutralSubtle"
                          className="awg-mono"
                        >
                          {item.agent}
                        </Text>
                      </HStack>
                    </ListTitle>
                    <ListDetail>
                      <Text textStyle="t6Regular" color="fg.neutral">
                        {item.body.split('\n')[0].slice(0, 96) || '(empty)'}
                      </Text>
                      <Text
                        as="p"
                        textStyle="t7Regular"
                        color="fg.neutralSubtle"
                        className="awg-mono"
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

          {!loading && grouped.length > 0 && (
            <Box style={{ display: 'flex', justifyContent: 'center' }}>
              <ActionButton
                variant="ghost"
                size="small"
                onClick={() => setFilter('all')}
              >
                Reset filter
              </ActionButton>
            </Box>
          )}
        </VStack>
      </Box>
      <BottomTabs />
    </AppScreen>
  );
};

export default QueueList;
