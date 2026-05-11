import { useFlow, type TabActivity } from '../stackflow';
import { useActivity } from '@stackflow/react';

interface Tab {
  key: TabActivity;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { key: 'Home', label: 'Overview', icon: '◎' },
  { key: 'QueueList', label: 'Queue', icon: '⊞' },
  { key: 'Workers', label: 'Workers', icon: '⌘' },
  { key: 'Liveness', label: 'Liveness', icon: '♡' },
];

export default function BottomTabs() {
  const flow = useFlow();
  const current = useActivity().name as string;

  const handleSelect = (key: TabActivity) => {
    if (key === current) return;
    flow.replace(key, {}, { animate: false });
  };

  return (
    <nav className="bottom-tabs" aria-label="Primary">
      {TABS.map((tab) => {
        const active = tab.key === current;
        return (
          <button
            key={tab.key}
            type="button"
            className="bottom-tab"
            aria-current={active ? 'page' : undefined}
            onClick={() => handleSelect(tab.key)}
          >
            <span className="bottom-tab-icon" aria-hidden>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
