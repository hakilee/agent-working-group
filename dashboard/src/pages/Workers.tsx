import { useEffect, useState } from 'react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import type { ActivityComponentType } from '@stackflow/react';
import {
  Box,
  CalloutContent,
  CalloutDescription,
  CalloutRoot,
  CalloutTitle,
  HStack,
  ListRoot,
  Skeleton,
  Text,
  VStack,
} from '@seed-design/react';
import { api, type WorkerSession } from '../api/client';
import WorkerCard from '../components/WorkerCard';
import BottomTabs from '../components/BottomTabs';

const Workers: ActivityComponentType = () => {
  const [workers, setWorkers] = useState<WorkerSession[]>([]);
  const [tmuxAvailable, setTmuxAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchWorkers = () => {
      api
        .listWorkers()
        .then((data) => {
          if (cancelled) return;
          setWorkers(data.items);
          setTmuxAvailable(data.tmuxAvailable);
          setError(null);
        })
        .catch((err) => !cancelled && setError(String(err)))
        .finally(() => !cancelled && setLoading(false));
    };
    fetchWorkers();
    const id = window.setInterval(fetchWorkers, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <AppScreen appBar={{ title: 'Workers' }}>
      <Box padding="16px" paddingBottom="96px" style={{ minHeight: '100%' }}>
        <VStack gap="20px">
          <HStack justify="space-between" style={{ alignItems: 'baseline' }}>
            <Text as="h1" textStyle="screenTitle">
              Workers
            </Text>
            <Text textStyle="t8Bold" color="fg.neutralSubtle">
              tmux: {tmuxAvailable ? 'available' : 'not detected'}
            </Text>
          </HStack>

          {error && (
            <CalloutRoot tone="critical">
              <CalloutContent>
                <CalloutTitle>Failed to load workers</CalloutTitle>
                <CalloutDescription>{error}</CalloutDescription>
              </CalloutContent>
            </CalloutRoot>
          )}

          {loading ? (
            <VStack gap="8px">
              <Skeleton height="64px" radius="8" />
              <Skeleton height="64px" radius="8" />
              <Skeleton height="64px" radius="8" />
            </VStack>
          ) : workers.length === 0 ? (
            <Box
              padding="32px"
              borderRadius="r3"
              borderWidth={1}
              borderColor="stroke.neutralMuted"
              style={{ textAlign: 'center' }}
            >
              <Text textStyle="t6Regular" color="fg.neutralMuted">
                No tmux sessions matching{' '}
                <span className="awg-mono">awg-*</span>.
              </Text>
            </Box>
          ) : (
            <ListRoot as="div">
              {workers.map((worker) => (
                <WorkerCard key={worker.session} worker={worker} />
              ))}
            </ListRoot>
          )}
        </VStack>
      </Box>
      <BottomTabs />
    </AppScreen>
  );
};

export default Workers;
