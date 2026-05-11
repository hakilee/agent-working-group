import { useEffect, useState } from 'react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { useActivityParams, type ActivityComponentType } from '@stackflow/react';
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
  Text,
  VStack,
} from '@seed-design/react';
import { api, type QueueDetail } from '../api/client';
import StatusBadge from '../components/StatusBadge';

interface Params {
  id: string;
}

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <ListItem>
      <ListContent>
        <ListTitle>
          <Text textStyle="t6Medium" color="fg.neutralSubtle">
            {label}
          </Text>
        </ListTitle>
        <ListDetail>
          <Text textStyle="t6Regular" className="awg-mono">
            {value}
          </Text>
        </ListDetail>
      </ListContent>
    </ListItem>
  );
}

const QueueDetailPage: ActivityComponentType<Params> = () => {
  const { id = '' } = useActivityParams<Params>();
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
    <AppScreen appBar={{ title: 'Message', backButton: { ariaLabel: 'Back' } }}>
      <Box padding="16px" style={{ minHeight: '100%' }}>
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
          <VStack gap="20px">
            <HStack justify="space-between" align="center">
              <Text textStyle="t8Bold" color="fg.neutralSubtle" className="awg-mono">
                {item.id}
              </Text>
              <StatusBadge status={item.state} />
            </HStack>

            <Box
              padding="16px"
              borderRadius="r3"
              borderWidth={1}
              borderColor="stroke.neutralMuted"
              background="bg.layerFill"
            >
              <HStack gap="8px" wrap="wrap" style={{ alignItems: 'baseline' }}>
                <StatusBadge status={item.kind || 'msg'} />
                <Text textStyle="t6Medium" className="awg-mono">
                  {item.from ?? '?'}
                </Text>
                <Text textStyle="t6Regular" color="fg.neutralSubtle">
                  →
                </Text>
                <Text textStyle="t6Medium" className="awg-mono">
                  {item.to ?? '?'}
                </Text>
                <Text
                  textStyle="t8Bold"
                  color="fg.neutralSubtle"
                  className="awg-mono"
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
              <CalloutRoot tone="neutral">
                <CalloutContent>
                  <CalloutDescription>
                    <pre
                      className="awg-mono"
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: 12,
                      }}
                    >
                      {item.body || '(empty)'}
                    </pre>
                  </CalloutDescription>
                </CalloutContent>
              </CalloutRoot>
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
                <CalloutRoot tone="informative">
                  <CalloutContent>
                    <CalloutDescription>
                      <pre
                        className="awg-mono"
                        style={{
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontSize: 12,
                        }}
                      >
                        {JSON.stringify(item.refs, null, 2)}
                      </pre>
                    </CalloutDescription>
                  </CalloutContent>
                </CalloutRoot>
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
              <CalloutRoot tone="neutral">
                <CalloutContent>
                  <CalloutDescription>
                    <pre
                      className="awg-mono"
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: 12,
                      }}
                    >
                      {JSON.stringify(item.message, null, 2)}
                    </pre>
                  </CalloutDescription>
                </CalloutContent>
              </CalloutRoot>
            </section>
          </VStack>
        )}
      </Box>
    </AppScreen>
  );
};

export default QueueDetailPage;
