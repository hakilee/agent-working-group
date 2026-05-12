import { Route, Routes } from 'react-router';
import Sidebar from './components/sidebar';
import Liveness from './pages/liveness';
import Overview from './pages/overview';
import QueueDetail from './pages/queue-detail';
import QueueList from './pages/queue-list';
import Settings from './pages/settings';
import WorkerTerminal from './pages/worker-terminal';
import Workers from './pages/workers';
import Workshop from './pages/workshop';

export default function App() {
  return (
    <div className="min-h-dvh md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 p-3 md:p-4">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/queue" element={<QueueList />} />
          <Route path="/queue/:id" element={<QueueDetail />} />
          <Route path="/workers" element={<Workers />} />
          <Route path="/workers/:session" element={<WorkerTerminal />} />
          <Route path="/workshop" element={<Workshop />} />
          <Route path="/liveness" element={<Liveness />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
