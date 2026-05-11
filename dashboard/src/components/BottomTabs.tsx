import { TabsList, TabsRoot, TabsTrigger } from '@seed-design/react';
import { useActivity } from '@stackflow/react';
import { useFlow, type TabActivity } from '../stackflow';

const TABS: { value: TabActivity; label: string }[] = [
  { value: 'Home', label: 'Overview' },
  { value: 'QueueList', label: 'Queue' },
  { value: 'Workers', label: 'Workers' },
  { value: 'Liveness', label: 'Liveness' },
];

const TAB_VALUES = TABS.map((t) => t.value);

export default function BottomTabs() {
  const flow = useFlow();
  const current = useActivity().name as TabActivity;
  const active = TAB_VALUES.includes(current) ? current : 'Home';

  return (
    <TabsRoot
      triggerLayout="fill"
      size="medium"
      value={active}
      onValueChange={(value) => {
        if (value === current) return;
        flow.replace(value as TabActivity, {}, { animate: false });
      }}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'var(--seed-color-bg-layer-default)',
        borderTop: '1px solid var(--seed-color-stroke-neutral-muted)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <TabsList>
        {TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </TabsRoot>
  );
}
