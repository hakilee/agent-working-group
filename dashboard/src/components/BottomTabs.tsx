import { TabsList, TabsRoot, TabsTrigger } from '@seed-design/react';
import { useLocation, useNavigate } from 'react-router-dom';

interface Tab {
  value: string;
  label: string;
  path: string;
}

const TABS: Tab[] = [
  { value: 'home', label: 'Overview', path: '/' },
  { value: 'queue', label: 'Queue', path: '/queue' },
  { value: 'workers', label: 'Workers', path: '/workers' },
  { value: 'liveness', label: 'Liveness', path: '/liveness' },
];

function activeFor(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'home';
  if (pathname.startsWith('/queue')) return 'queue';
  if (pathname.startsWith('/workers')) return 'workers';
  if (pathname.startsWith('/liveness')) return 'liveness';
  return 'home';
}

export default function BottomTabs() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const value = activeFor(pathname);

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 50,
        background: 'var(--seed-color-bg-layer-default)',
        borderTop: '1px solid var(--seed-color-stroke-neutral-muted)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <TabsRoot
        triggerLayout="fill"
        size="medium"
        value={value}
        onValueChange={(next) => {
          const target = TABS.find((t) => t.value === next);
          if (target) navigate(target.path);
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
    </div>
  );
}
