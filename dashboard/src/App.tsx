import { Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import QueueList from './pages/QueueList';
import QueueDetail from './pages/QueueDetail';
import Workers from './pages/Workers';
import WorkerTerminal from './pages/WorkerTerminal';
import Liveness from './pages/Liveness';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100%',
        background: 'var(--color-canvas)',
      }}
    >
      <Sidebar />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          padding: 'var(--space-xl) var(--space-xl)',
          maxWidth: 1200,
          width: '100%',
        }}
      >
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/queue" element={<QueueList />} />
        <Route path="/queue/:id" element={<QueueDetail />} />
        <Route path="/workers" element={<Workers />} />
        <Route path="/workers/:session" element={<WorkerTerminal />} />
        <Route path="/liveness" element={<Liveness />} />
      </Routes>
    </Layout>
  );
}
