import { Box, HStack, Text } from '@seed-design/react';
import { Outlet, useLocation } from 'react-router-dom';
import BottomTabs from './BottomTabs';
import ThemeToggle from './ThemeToggle';

function pageTitle(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'Overview';
  if (pathname.startsWith('/queue/')) return 'Message';
  if (pathname === '/queue') return 'Queue';
  if (pathname.startsWith('/workers/')) return 'Worker';
  if (pathname === '/workers') return 'Workers';
  if (pathname === '/liveness') return 'Liveness';
  return 'AWG';
}

export default function Layout() {
  const { pathname } = useLocation();

  return (
    <Box
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--seed-color-bg-layer-default)',
      }}
    >
      <Box
        as="header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'var(--seed-color-bg-layer-default)',
          borderBottom: '1px solid var(--seed-color-stroke-neutral-muted)',
        }}
      >
        <HStack
          justify="space-between"
          gap="12px"
          style={{
            alignItems: 'center',
            padding: '10px 16px',
            maxWidth: 960,
            margin: '0 auto',
          }}
        >
          <HStack gap="10px" style={{ alignItems: 'baseline' }}>
            <Text textStyle="t5Bold" color="fg.brand">
              AWG
            </Text>
            <Text textStyle="t7Regular" color="fg.neutralSubtle">
              {pageTitle(pathname)}
            </Text>
          </HStack>
          <ThemeToggle />
        </HStack>
      </Box>

      <Box
        as="main"
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 960,
          margin: '0 auto',
          padding: '16px',
          boxSizing: 'border-box',
        }}
      >
        <Outlet />
      </Box>

      <BottomTabs />
    </Box>
  );
}
