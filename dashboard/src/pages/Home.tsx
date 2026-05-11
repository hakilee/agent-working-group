import { use, Suspense, startTransition, useEffect, useState } from 'react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import type { ActivityComponentType } from '@stackflow/react';
import {
  ActionButton,
  Box,
  ChipLabel,
  ChipRoot,
  Grid,
  HStack,
  Skeleton,
  Text,
  VStack,
} from '@seed-design/react';
import { api, type SystemStatus } from '../api/client';
import ActivityFeed from '../components/ActivityFeed';
import BottomTabs from '../components/BottomTabs';
import { useFlow } from '../stackflow';

interface Tone {
  key: string;
  label: string;
  color: 'fg.warning' | 'fg.informative' | 'fg.positive' | 'fg.critical';
}

const STATE_CARDS: Tone[] = [
  { key: 'pending', label: 'Pending', color: 'fg.warning' },
  { key: 'processing', label: 'Processing', color: 'fg.informative' },
  { key: 'processed', label: 'Processed', color: 'fg.positive' },
  { key: 'dead', label: 'Dead', color: 'fg.critical' },
];

function StatTile({
  label,
  value,
  color = 'fg.neutral',
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <Box
      padding="16px"
      borderRadius="r3"
      borderWidth={1}
      borderColor="stroke.neutralMuted"
      background="bg.layerFill"
    >
      <Text as="p" textStyle="t8Bold" color="fg.neutralSubtle">
        {label}
      </Text>
      <Text
        as="p"
        textStyle="t2Bold"
        color={color}
        style={{ marginTop: 4 }}
      >
        {value}
      </Text>
    </Box>
  );
}

function HomeBody({ statusPromise }: { statusPromise: Promise<SystemStatus> }) {
  const status = use(statusPromise);
  const flow = useFlow();

  return (
    <VStack gap="24px">
      <section>
        <HStack
          justify="space-between"
          style={{ marginBottom: 12, alignItems: 'baseline' }}
        >
          <Text as="h1" textStyle="screenTitle">
            Overview
          </Text>
          <Text textStyle="t8Bold" color="fg.neutralSubtle" className="awg-mono">
            {status.root}
          </Text>
        </HStack>
        <Grid columns={2} gap="12px">
          {STATE_CARDS.map((card) => (
            <StatTile
              key={card.key}
              label={card.label}
              value={status.counts[card.key] ?? 0}
              color={card.color}
            />
          ))}
        </Grid>
      </section>

      <VStack gap="12px">
        <Box
          padding="16px"
          borderRadius="r3"
          borderWidth={1}
          borderColor="stroke.neutralMuted"
          background="bg.layerFill"
        >
          <Text as="p" textStyle="t8Bold" color="fg.neutralSubtle">
            Workers
          </Text>
          <Text as="p" textStyle="t2Bold" style={{ marginTop: 4 }}>
            {status.workers.total}
          </Text>
          <Text
            as="p"
            textStyle="t7Regular"
            color="fg.neutralMuted"
            style={{ marginTop: 4 }}
          >
            {status.workers.attached} attached · tmux{' '}
            {status.workers.tmuxAvailable ? 'ok' : 'unavailable'}
          </Text>
          <Box style={{ marginTop: 8 }}>
            <ActionButton
              variant="ghost"
              size="small"
              onClick={() => flow.replace('Workers', {}, { animate: false })}
            >
              view all workers →
            </ActionButton>
          </Box>
        </Box>

        <Box
          padding="16px"
          borderRadius="r3"
          borderWidth={1}
          borderColor="stroke.neutralMuted"
          background="bg.layerFill"
        >
          <Text as="p" textStyle="t8Bold" color="fg.neutralSubtle">
            Agents
          </Text>
          <HStack gap="6px" wrap="wrap" style={{ marginTop: 8 }}>
            {status.agents.length ? (
              status.agents.map((agent) => (
                <ChipRoot key={agent} variant="solid" size="small" disabled>
                  <ChipLabel>
                    <span className="awg-mono">{agent}</span>
                  </ChipLabel>
                </ChipRoot>
              ))
            ) : (
              <Text textStyle="t7Regular" color="fg.neutralSubtle">
                no agents registered
              </Text>
            )}
          </HStack>
        </Box>

        <Box
          padding="16px"
          borderRadius="r3"
          borderWidth={1}
          borderColor="stroke.neutralMuted"
          background="bg.layerFill"
        >
          <Text as="p" textStyle="t8Bold" color="fg.neutralSubtle">
            Total queue items
          </Text>
          <Text as="p" textStyle="t2Bold" style={{ marginTop: 4 }}>
            {status.totalQueueItems}
          </Text>
          <Box style={{ marginTop: 8 }}>
            <ActionButton
              variant="ghost"
              size="small"
              onClick={() => flow.replace('QueueList', {}, { animate: false })}
            >
              browse queue →
            </ActionButton>
          </Box>
        </Box>
      </VStack>

      <section>
        <Text
          as="h2"
          textStyle="t5Bold"
          color="fg.neutralMuted"
          style={{ marginBottom: 8, display: 'block' }}
        >
          Recent activity
        </Text>
        <ActivityFeed entries={status.recentActivity} />
      </section>
    </VStack>
  );
}

function HomeFallback() {
  return (
    <VStack gap="12px">
      <Skeleton height="28px" width="200px" radius="8" />
      <Skeleton height="80px" radius="8" />
      <Skeleton height="80px" radius="8" />
    </VStack>
  );
}

const Home: ActivityComponentType = () => {
  const [promise, setPromise] = useState(() => api.status());

  useEffect(() => {
    const id = window.setInterval(() => {
      startTransition(() => setPromise(api.status()));
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <AppScreen appBar={{ title: 'AWG' }}>
      <Box padding="16px" paddingBottom="96px" style={{ minHeight: '100%' }}>
        <Suspense fallback={<HomeFallback />}>
          <HomeBody statusPromise={promise} />
        </Suspense>
      </Box>
      <BottomTabs />
    </AppScreen>
  );
};

export default Home;
