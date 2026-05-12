import { Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Liveness from './pages/Liveness';
import Overview from './pages/Overview';
import QueueDetail from './pages/QueueDetail';
import QueueList from './pages/QueueList';
import WorkerTerminal from './pages/WorkerTerminal';
import Workers from './pages/Workers';

export default function App() {
  return (
    <div className="min-h-dvh md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 p-5 md:p-8">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/queue" element={<QueueList />} />
          <Route path="/queue/:id" element={<QueueDetail />} />
          <Route path="/workers" element={<Workers />} />
          <Route path="/workers/:session" element={<WorkerTerminal />} />
          <Route path="/liveness" element={<Liveness />} />
        </Routes>
      </main>
    </div>
  );
}
