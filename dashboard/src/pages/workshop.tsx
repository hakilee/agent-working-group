import { Fragment, useEffect, useMemo, useState } from 'react';
import { api, type AgentSummary } from '../api/client';
import { useQueueStream } from '../hooks/use-queue-stream';
import { Page, PageHeader } from '../components/ui/page';
import { deriveRooms } from '../workshop/room-state';
import RoomCard from '../workshop/room';
import Corridor from '../workshop/corridor';

export default function Workshop() {
  const stream = useQueueStream();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listQueues()
      .then((data) => { if (!cancelled) setAgents(data.agents ?? []); })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const streamAgents = stream.data?.agents;
    if (streamAgents && streamAgents.length > 0) {
      setAgents(streamAgents);
      setError(null);
    }
  }, [stream.data]);

  const rooms = useMemo(() => deriveRooms(agents), [agents]);
  const hasActive = rooms.some(
    (r) => r.counts.pending > 0 || r.counts.processing > 0,
  );

  return (
    <Page>
      <PageHeader eyebrow="Workshop" title="Agent rooms">
        <span className="text-[10px] uppercase tracking-widest text-ops-muted dark:text-[#839087]">
          {rooms.length} {rooms.length === 1 ? 'agent' : 'agents'}
        </span>
      </PageHeader>

      {error && (
        <div className="border border-rose-500 bg-rose-50/80 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </div>
      )}

      {rooms.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center border border-dashed border-ops-line bg-ops-panel p-6 text-xs text-ops-muted dark:border-white/15 dark:bg-[#1e2722]/85 dark:text-[#839087]">
          No agents found. Waiting for queue activity...
        </div>
      ) : (
        <div
          className="grid items-stretch gap-3"
          style={{
            gridTemplateColumns:
              rooms.length === 1
                ? '1fr'
                : rooms.length === 2
                  ? '1fr auto 1fr'
                  : `repeat(${rooms.length}, minmax(0, 1fr))`,
          }}
        >
          {rooms.map((room, i) => (
            <Fragment key={room.role}>
              <RoomCard room={room} />
              {rooms.length === 2 && i === 0 && <Corridor busy={hasActive} />}
            </Fragment>
          ))}
        </div>
      )}
    </Page>
  );
}
