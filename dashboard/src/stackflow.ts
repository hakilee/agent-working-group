import { stackflow } from '@stackflow/react';
import { basicRendererPlugin } from '@stackflow/plugin-renderer-basic';
import { basicUIPlugin } from '@stackflow/plugin-basic-ui';
import Home from './pages/Home';
import QueueList from './pages/QueueList';
import QueueDetail from './pages/QueueDetail';
import Workers from './pages/Workers';
import WorkerTerminal from './pages/WorkerTerminal';
import Liveness from './pages/Liveness';

export const { Stack, useFlow } = stackflow({
  transitionDuration: 300,
  activities: {
    Home,
    QueueList,
    QueueDetail,
    Workers,
    WorkerTerminal,
    Liveness,
  },
  initialActivity: () => 'Home',
  plugins: [
    basicRendererPlugin(),
    basicUIPlugin({
      theme: 'cupertino',
      appBar: {
        backButton: {
          ariaLabel: 'Back',
        },
      },
    }),
  ],
});

export type TabActivity = 'Home' | 'QueueList' | 'Workers' | 'Liveness';
