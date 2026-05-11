import { useEffect, useState } from 'react';
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
  ListSuffix,
  ListTitle,
  Skeleton,
  Text,
  VStack,
} from '@seed-design/react';
import {
  api,
  type ContractBreach,
  type HeartbeatEntry,
  type HeartbeatList,
  type TimeoutItem,
} from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { useLivenessStream } from '../hooks/useLivenessStream';

const POLL_INTERVAL_MS = 5000;

interface Snapshot {
  heartbeats: HeartbeatEntry[];
  heartbeatCounts: Record<string, number>;
  timeouts: TimeoutItem[];
  contracts: ContractBreach[];
}

const EMPTY: Snapshot = {
  heartbeats: [],
  heartbeatCounts: { fresh: 0, stale: 0, missing: 0 },
  timeouts: [],
  contracts: [],
};

function applyHeartbeats(prev: Snapshot, hb: HeartbeatList): Snapshot {
  return {
    ...prev,
    heartbeats: hb.items,
    heartbeatCounts: { ...prev.heartbeatCounts, ...hb.counts },
  };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text
      as="h2"
      textStyle="t5Bold"
      color="fg.neutralMuted"
      style={{ marginBottom: 8, display: 'block' }}
    >
      {children}
    </Text>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <Box
      padding="24px"
      borderRadius="r3"
      borderWidth={1}
      borderColor="stroke.neutralMuted"
      style={{ textAlign: 'center' }}
    >
      <Text textStyle="t6Regular" color="fg.neutralMuted">
        {children}
      </Text>
    </Box>
  );
}

export default function Liveness() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const stream = useLivenessStream();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([
        api.liveness.heartbeats(),
        api.liveness.timeouts(),
        api.liveness.contracts(),
      ])
        .then(([hb, tm, ct]) => {
          if (cancelled) return;
          setSnap({
            heartbeats: hb.items,
            heartbeatCounts: hb.counts,
            timeouts: tm.items,
            contracts: ct.items,
          });
          setError(null);
        })
        .catch((err) => !cancelled && setError(String(err)))
        .finally(() => !cancelled && setLoading(false));
    };
    load();
    const id = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!stream) return;
    setSnap((prev) => {
      let next = prev;
      if (stream.heartbeats) next = applyHeartbeats(next, stream.heartbeats);
      if (stream.timeouts) next = { ...next, timeouts: stream.timeouts.items };
      if (stream.contracts) next = { ...next, contracts: stream.contracts.items };
      return next;
    });
  }, [stream]);

  return (
    <VStack gap="24px">
      <HStack justify="space-between" gap="8px" wrap="wrap" style={{ alignItems: 'baseline' }}>
        <Text as="h1" textStyle="screenTitle">
          Liveness
        </Text>
        <HStack gap="6px" wrap="wrap" style={{ alignItems: 'center' }}>
          <StatusBadge status="fresh" />
          <Text textStyle="t7Regular" color="fg.neutralMuted">
            {snap.heartbeatCounts.fresh ?? 0}
          </Text>
          <StatusBadge status="stale" />
          <Text textStyle="t7Regular" color="fg.neutralMuted">
            {snap.heartbeatCounts.stale ?? 0}
          </Text>
          <StatusBadge status="missing" />
          <Text textStyle="t7Regular" color="fg.neutralMuted">
            {snap.heartbeatCounts.missing ?? 0}
          </Text>
        </HStack>
      </HStack>

      {error && (
        <CalloutRoot tone="critical">
          <CalloutContent>
            <CalloutTitle>Failed to load liveness</CalloutTitle>
            <CalloutDescription>{error}</CalloutDescription>
          </CalloutContent>
        </CalloutRoot>
      )}

      {loading && !error && (
        <VStack gap="8px">
          <Skeleton height="56px" radius="8" />
          <Skeleton height="56px" radius="8" />
        </VStack>
      )}

      <section>
        <SectionTitle>Heartbeats</SectionTitle>
        {snap.heartbeats.length === 0 ? (
          <EmptyHint>no heartbeats reported</EmptyHint>
        ) : (
          <ListRoot>
            {snap.heartbeats.map((hb) => (
              <ListItem key={`${hb.agent}/${hb.session || '_'}`}>
                <ListContent>
                  <ListTitle>
                    <Text textStyle="t6Bold">{hb.agent}</Text>
                  </ListTitle>
                  <ListDetail>
                    <Text textStyle="t7Regular" color="fg.neutralMuted">
                      {hb.session || '—'} · age{' '}
                      {hb.ageSeconds == null ? '—' : `${hb.ageSeconds}s`} · timeout{' '}
                      {hb.timeoutSeconds}s
                    </Text>
                  </ListDetail>
                </ListContent>
                <ListSuffix>
                  <StatusBadge status={hb.status} />
                </ListSuffix>
              </ListItem>
            ))}
          </ListRoot>
        )}
      </section>

      <section>
        <SectionTitle>Processing timeouts ({snap.timeouts.length})</SectionTitle>
        {snap.timeouts.length === 0 ? (
          <EmptyHint>no stale processing items</EmptyHint>
        ) : (
          <ListRoot>
            {snap.timeouts.map((row) => (
              <ListItem key={`${row.agent}/${row.file}`}>
                <ListContent>
                  <ListTitle>
                    <Text textStyle="t6Bold">{row.agent}</Text>
                  </ListTitle>
                  <ListDetail>
                    <Text textStyle="t7Regular" color="fg.neutralMuted">
                      {row.messageId || row.file}
                    </Text>
                    <Text
                      as="p"
                      textStyle="t7Regular"
                      color="fg.warning"
                      style={{ marginTop: 2 }}
                    >
                      age {row.ageSeconds}s · timeout {row.timeoutSeconds}s ·{' '}
                      {row.timestampSource}
                    </Text>
                  </ListDetail>
                </ListContent>
              </ListItem>
            ))}
          </ListRoot>
        )}
      </section>

      <section>
        <SectionTitle>
          Response contract breaches ({snap.contracts.length})
        </SectionTitle>
        {snap.contracts.length === 0 ? (
          <EmptyHint>no contract breaches</EmptyHint>
        ) : (
          <ListRoot>
            {snap.contracts.map((row) => (
              <ListItem key={`${row.agent}/${row.file}`}>
                <ListContent>
                  <ListTitle>
                    <Text textStyle="t6Bold">{row.agent}</Text>
                  </ListTitle>
                  <ListDetail>
                    <Text textStyle="t7Regular" color="fg.neutralMuted">
                      {row.messageId || row.file} · {row.location}
                    </Text>
                    <Text
                      as="p"
                      textStyle="t7Regular"
                      color="fg.critical"
                      style={{ marginTop: 2 }}
                    >
                      expected {row.expectedSeconds}s · actual {row.actualSeconds}s
                    </Text>
                  </ListDetail>
                </ListContent>
              </ListItem>
            ))}
          </ListRoot>
        )}
      </section>
    </VStack>
  );
}
